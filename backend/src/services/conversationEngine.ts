import Anthropic from "@anthropic-ai/sdk";
import { EmailDraft, Message, MessageChannel, MessageModality, User } from "@prisma/client";
import { prisma } from "../db";
import { getAnthropicClient, CONVERSATION_MODEL } from "./anthropic";
import { reminderTools, executeReminderTool } from "./reminderTools";
import { googleTools, googleToolNames, executeGoogleTool, listPendingDrafts } from "./googleTools";
import { getGoogleConnection, isGoogleConfigured } from "./google";
import { isTtsConfigured, synthesizeSpeech } from "./voice";
import { saveAudio } from "./storage";
import { TurnContext } from "./toolContext";

// One user, one conversation/task state, regardless of channel - see
// pa-whatsapp-spec.md section 3. Both the WhatsApp webhook and the app's
// /pa/messages routes call this same function. Voice is an adapter on top:
// the engine only ever sees (and produces) text; callers transcribe voice
// notes before calling it, and it synthesizes a spoken reply on request.

const HISTORY_LIMIT = 30;
const MAX_TOOL_ITERATIONS = 8;
const FALLBACK_REPLY = "Sorry, I'm having trouble connecting right now - please try again in a bit.";

const tools = [...reminderTools, ...googleTools];

interface PromptContext {
  user: Pick<User, "name" | "timezone">;
  channel: MessageChannel;
  modality: MessageModality;
  googleConnected: boolean;
  pendingDrafts: EmailDraft[];
}

const EMAIL_RULE = `Email rule - auto-send vs draft (this matters a lot):
- Send directly with send_email ONLY when the request is unambiguous: a clear recipient AND clear content, where the user has already decided what to say and you're just delivering it. Examples of requests to send directly: "Tell Dana I'll be there at 3"; "Confirm the meeting time with Alex for tomorrow at 10am"; "Send my flight details to Maria"; "Reply to the landlord that rent will be paid by Friday"; "Let the team know I'll be 10 minutes late".
- Draft first with draft_email whenever you'd have to decide what to say - the recipient or content needs inference, tone, or judgment. Examples: "Deal with that email from my boss" (no instruction on what to say); "Tell him I'm not interested" (needs wording, sensitive); "Reply to the client about the pricing issue" (judgment on positioning/numbers); "Handle my inbox" (many unknown emails); "Apologize to Sarah for missing the call" (personal wording).
- Also draft, no matter how clear the instruction sounds, for anything involving money, contracts, legal terms, or a decline/rejection - the downside of getting tone or details wrong is too high.
- The dividing line: if you have to decide what to say, draft. If the user has already decided and you're just delivering it, send.
- Never send a draft until the user explicitly approves it. When they do ("send it", "yes", "looks good"), call send_draft. If they want changes, call discard_draft, then draft_email again with the new version.
- After sending anything, tell the user you did, briefly ("Done - sent to Dana.").`;

function buildSystemPrompt(ctx: PromptContext): string {
  const { user, channel, modality, googleConnected, pendingDrafts } = ctx;
  const nowIso = new Date().toISOString();

  const identity = user.name
    ? `You are ${user.name}'s personal assistant, reachable by text or voice through the app or WhatsApp.`
    : "You are this person's personal assistant, reachable by text or voice through the app or WhatsApp. You don't know their name yet.";

  const timezoneNote = user.timezone
    ? `Their timezone is ${user.timezone} - use it to work out dates/times they mention (e.g. "tomorrow at 9am"), and convert to UTC for tool inputs.`
    : "You don't know their timezone yet. If it matters for timing, ask, or call update_user_profile as soon as they mention their city or timezone.";

  const onboardingNote = !user.name
    ? "This looks like a new conversation. Greet them warmly, introduce yourself briefly, and ask their name (and where they're based, for timezone) before getting into anything else. Call update_user_profile as soon as you learn either one."
    : "";

  const capabilities = googleConnected
    ? "You can: chat; manage reminders (create, list, cancel); read, draft and send email through their Gmail; and read their calendar for availability/context and create events on it. Web research and reaching out to people on their behalf are coming soon - if asked, say so honestly rather than pretending."
    : isGoogleConfigured()
      ? "You can: chat and manage reminders (create, list, cancel). Email and calendar are available once they connect their Google account - if they ask for anything email- or calendar-related, explain that in one line and call get_google_connect_link so you can give them the link. Web research and reaching out to people on their behalf are coming soon."
      : "You can: chat and manage reminders (create, list, cancel). Email, calendar, web research, and reaching out to people on their behalf aren't available yet - if asked, say so honestly rather than pretending.";

  const draftsNote = pendingDrafts.length
    ? `Email drafts waiting for the user's OK (most recent first):\n${pendingDrafts
        .map((d) => `- draft_id ${d.id}: to ${d.to}, subject "${d.subject}"`)
        .join("\n")}`
    : "";

  const draftPresentation =
    channel === "app"
      ? "When you create a draft, the app shows it to the user in a card with Send and Discard buttons - so don't repeat the full draft in your reply; say briefly what you drafted and ask if it looks right."
      : "When you create a draft, show it in full in your reply (to, subject, body) and ask them to reply 'send' or tell you what to change.";

  const voiceNote =
    modality === "voice"
      ? "The user sent this as a voice note; the text above is its transcript. Your reply will be spoken aloud, so keep it short and natural - no markdown, lists, or reading out URLs (if you need to share a link, just say you're sending it; it's included as text)."
      : "";

  return [
    identity,
    "Be warm, brief, and capable - the way a genuinely excellent human PA talks, not like a chatbot.",
    "Always reply in the same language the user just wrote or spoke in, regardless of what language earlier turns were in.",
    timezoneNote,
    `The current UTC date and time is ${nowIso}.`,
    capabilities,
    "When creating a reminder or calendar event, compute times as absolute UTC ISO 8601 datetimes from what they said plus the current time/timezone above.",
    googleConnected ? EMAIL_RULE : "",
    googleConnected ? draftPresentation : "",
    draftsNote,
    voiceNote,
    onboardingNote,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface IncomingOptions {
  modality?: MessageModality;
  /** Storage path of the user's own voice note, if this was one. */
  audioPath?: string;
  /** Reply in kind with a spoken (TTS) reply when possible. */
  replyWithVoice?: boolean;
}

export interface TurnResult {
  userMessage: Message;
  assistantMessage: Message;
}

export async function handleIncomingMessage(
  userId: string,
  text: string,
  channel: MessageChannel,
  options: IncomingOptions = {},
): Promise<TurnResult> {
  const modality = options.modality ?? "text";
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const userMessage = await prisma.message.create({
    data: { userId, role: "user", channel, modality, content: text, audioPath: options.audioPath },
  });

  const history = await prisma.message.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  history.reverse();

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const [googleConnection, pendingDrafts] = await Promise.all([getGoogleConnection(userId), listPendingDrafts(userId)]);
  const system = buildSystemPrompt({
    user,
    channel,
    modality,
    googleConnected: Boolean(googleConnection),
    pendingDrafts,
  });

  const turn: TurnContext = { userId, channel };
  let finalText = "";

  try {
    const client = getAnthropicClient();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.messages.create({
        model: CONVERSATION_MODEL,
        max_tokens: 2048,
        // Chat is latency-sensitive and doesn't need deep reasoning, but the
        // send-vs-draft judgment and date math benefit from a bit of care -
        // medium splits the difference.
        output_config: { effort: "medium" },
        system,
        tools,
        messages,
      });

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      finalText = textBlocks
        .map((b) => b.text)
        .join("\n\n")
        .trim();

      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        break;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        let result: string;
        try {
          result = googleToolNames.has(toolUse.name)
            ? await executeGoogleTool(turn, toolUse.name, toolUse.input)
            : await executeReminderTool(userId, channel, toolUse.name, toolUse.input);
        } catch (error) {
          console.error(`Tool ${toolUse.name} failed:`, error);
          result = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Tool failed" });
        }
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: result });
      }
      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText) {
      finalText = FALLBACK_REPLY;
    }
  } catch (error) {
    console.error("Conversation engine error:", error);
    finalText = FALLBACK_REPLY;
  }

  let assistantAudioPath: string | undefined;
  if (options.replyWithVoice && isTtsConfigured() && finalText !== FALLBACK_REPLY) {
    try {
      assistantAudioPath = await saveAudio(await synthesizeSpeech(finalText), "mp3");
    } catch (error) {
      // Fall back to a text reply rather than failing the turn.
      console.error("Text-to-speech failed:", error);
    }
  }

  const assistantMessage = await prisma.message.create({
    data: {
      userId,
      role: "assistant",
      channel,
      modality: assistantAudioPath ? "voice" : "text",
      content: finalText,
      audioPath: assistantAudioPath,
      metadata: turn.metadata,
    },
  });

  return { userMessage, assistantMessage };
}
