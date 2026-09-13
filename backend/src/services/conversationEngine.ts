import Anthropic from "@anthropic-ai/sdk";
import { EmailDraft, Message, MessageChannel, MessageModality, Prisma, ResearchSession, User } from "@prisma/client";
import { prisma } from "../db";
import { getAnthropicClient, CONVERSATION_MODEL } from "./anthropic";
import { reminderTools, executeReminderTool } from "./reminderTools";
import { googleTools, googleToolNames, executeGoogleTool, listPendingDrafts } from "./googleTools";
import {
  researchTools,
  researchToolNames,
  executeResearchTool,
  latestResearchSession,
  optionsOf,
  webSearchToolFor,
} from "./researchTools";
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
// Tool records are replayed on every later turn, so they're capped to keep
// the history cheap. Enough to carry the outcome and the identifying fields.
const TOOL_INPUT_CAP = 300;
const TOOL_RESULT_CAP = 400;
// Web search runs server-side inside a single API call, but a long search
// can come back as pause_turn and need resuming - so the loop allows a few
// more iterations than the custom tools alone would need.
const MAX_TOOL_ITERATIONS = 10;
const FALLBACK_REPLY = "Sorry, I'm having trouble connecting right now - please try again in a bit.";

function toolsFor(user: Pick<User, "timezone">): Anthropic.Messages.ToolUnion[] {
  return [...reminderTools, ...googleTools, ...researchTools, webSearchToolFor(user.timezone)];
}

interface ToolCallRecord {
  name: string;
  input: string;
  result: string;
}

function truncate(value: string, cap: number): string {
  return value.length > cap ? `${value.slice(0, cap)}…(truncated)` : value;
}

function recordToolCall(name: string, input: unknown, result: string): ToolCallRecord {
  return {
    name,
    input: truncate(JSON.stringify(input ?? {}), TOOL_INPUT_CAP),
    result: truncate(result, TOOL_RESULT_CAP),
  };
}

/** Renders a turn's tool outcomes for the model's view of the history. This is
 * never shown to the user - it's appended to the assistant turn's content only
 * when rebuilding the prompt, so a later turn can see what actually happened
 * rather than re-reading its own claim that it happened. */
function renderToolRecord(toolCalls: unknown): string {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return "";
  const lines = (toolCalls as ToolCallRecord[])
    .filter((call) => call && typeof call.name === "string")
    .map((call) => `${call.name}(${call.input}) -> ${call.result}`);
  return lines.length ? `\n\n<tool_record>\n${lines.join("\n")}\n</tool_record>` : "";
}

const TOOL_RECORD_RULE = `Some of your earlier turns end with a <tool_record> block. That is a factual system-written log of the tools that actually ran on that turn and exactly what they returned - it is evidence, not something you wrote. Trust it over the wording of your own earlier replies, and never apologise for or retract an earlier action that a record shows succeeded. The records are historical, though: to answer a question about what is true *now* ("is that reminder still set?", "did that send?"), call the relevant tool and answer from what it returns. If you have neither a record nor a fresh tool result, say plainly that you need to check rather than guessing either way.`;

interface PromptContext {
  user: Pick<User, "name" | "timezone">;
  channel: MessageChannel;
  modality: MessageModality;
  googleConnected: boolean;
  /** The connected calendar's own timezone, when we know it. */
  calendarTimezone: string | null;
  pendingDrafts: EmailDraft[];
  latestResearch: ResearchSession | null;
}

const RESEARCH_RULE = `Research & booking-assist (flights, hotels, restaurants, products, anything to plan or buy):
- Use web_search to research, then call present_options with 2-4 concrete options: a short title, a one-line summary, the price if known, and a link to view or book. If you can't find 2 decent options, ask a clarifying question instead of padding the list.
- You cannot book, reserve, or pay for anything, and you must never say or imply that you have. The user completes any booking themselves through the option's link. Nothing counts as chosen until they explicitly pick one.
- When they explicitly pick an option ("option 2", "the morning flight", "yes, that one"), call confirm_option, then give them the link to complete it and offer to add it to their calendar or set a reminder. If none suit them, call dismiss_options and ask what to change before searching again.
- For a quick factual question, just search and answer in a sentence or two - present_options is only for choices the user needs to make.`;

const EMAIL_RULE = `Email rule - auto-send vs draft (this matters a lot):
- Send directly with send_email ONLY when the request is unambiguous: a clear recipient AND clear content, where the user has already decided what to say and you're just delivering it. Examples of requests to send directly: "Tell Dana I'll be there at 3"; "Confirm the meeting time with Alex for tomorrow at 10am"; "Send my flight details to Maria"; "Reply to the landlord that rent will be paid by Friday"; "Let the team know I'll be 10 minutes late".
- Draft first with draft_email whenever you'd have to decide what to say - the recipient or content needs inference, tone, or judgment. Examples: "Deal with that email from my boss" (no instruction on what to say); "Tell him I'm not interested" (needs wording, sensitive); "Reply to the client about the pricing issue" (judgment on positioning/numbers); "Handle my inbox" (many unknown emails); "Apologize to Sarah for missing the call" (personal wording).
- Also draft, no matter how clear the instruction sounds, for anything involving money, contracts, legal terms, or a decline/rejection - the downside of getting tone or details wrong is too high.
- The dividing line: if you have to decide what to say, draft. If the user has already decided and you're just delivering it, send.
- Never send a draft until the user explicitly approves it. When they do ("send it", "yes", "looks good"), call send_draft. If they want changes, call discard_draft, then draft_email again with the new version.
- After sending anything, tell the user you did, briefly ("Done - sent to Dana.").`;

function buildSystemPrompt(ctx: PromptContext): string {
  const { user, channel, modality, googleConnected, calendarTimezone, pendingDrafts, latestResearch } = ctx;
  const nowIso = new Date().toISOString();

  // A stale profile timezone silently puts every event at the wrong hour, and
  // the PA would state the wrong time with full confidence. Only the user can
  // say which is right, so raise it rather than guessing.
  const timezoneMismatchNote =
    calendarTimezone && user.timezone && calendarTimezone !== user.timezone
      ? `Heads up: their Google Calendar's timezone is ${calendarTimezone}, but their profile says ${user.timezone}. Before you create any event or quote a time, mention this once and ask which to use, then call update_user_profile with their answer. Until they choose, use ${calendarTimezone} - it is what their calendar will actually display.`
      : "";

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
    ? "You can: chat; manage reminders (create, list, cancel); search the web to research and plan things and present options; read, draft and send email through their Gmail; and read their calendar for availability/context and create events on it. Reaching out to people on their behalf is coming soon - if asked, say so honestly rather than pretending."
    : isGoogleConfigured()
      ? "You can: chat; manage reminders (create, list, cancel); and search the web to research and plan things and present options. Email and calendar are available once they connect their Google account - if they ask for anything email- or calendar-related, explain that in one line and call get_google_connect_link so you can give them the link. Reaching out to people on their behalf is coming soon."
      : "You can: chat; manage reminders (create, list, cancel); and search the web to research and plan things and present options. Email, calendar, and reaching out to people on their behalf aren't available yet - if asked, say so honestly rather than pretending.";

  const researchPresentation =
    channel === "app"
      ? "When you present options, the app shows them in a card with a Confirm button - don't repeat every detail; give a one-line lead-in and ask which they'd like."
      : "When you present options, list them as a numbered list (title, price, link) and ask them to reply with a number.";

  const researchNote = latestResearch
    ? (() => {
        const status = latestResearch.confirmed ? "confirmed" : latestResearch.dismissedAt ? "dismissed" : "pending";
        const lines = optionsOf(latestResearch).map(
          (o, i) => `  ${i + 1}. ${o.title}${o.price ? ` - ${o.price}` : ""}${o.url ? ` - ${o.url}` : ""}${o.id === latestResearch.chosenOptionId ? " (chosen)" : ""}`,
        );
        return `Latest options you presented (session_id ${latestResearch.id}, status: ${status}) for "${latestResearch.request}":\n${lines.join("\n")}${
          status === "confirmed"
            ? "\nThe choice is already recorded - don't call confirm_option again; help them complete it (link, calendar event, reminder)."
            : ""
        }`;
      })()
    : "";

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
    TOOL_RECORD_RULE,
    timezoneNote,
    `The current UTC date and time is ${nowIso}.`,
    timezoneMismatchNote,
    capabilities,
    "When creating a reminder or calendar event, compute times as absolute UTC ISO 8601 datetimes from what they said plus the current time/timezone above.",
    RESEARCH_RULE,
    researchPresentation,
    researchNote,
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
    content: m.role === "assistant" ? m.content + renderToolRecord(m.toolCalls) : m.content,
  }));

  const [googleConnection, pendingDrafts, latestResearch] = await Promise.all([
    getGoogleConnection(userId),
    listPendingDrafts(userId),
    latestResearchSession(userId),
  ]);
  const system = buildSystemPrompt({
    user,
    channel,
    modality,
    googleConnected: Boolean(googleConnection),
    calendarTimezone: googleConnection?.calendarTimezone ?? null,
    pendingDrafts,
    latestResearch,
  });

  const turn: TurnContext = { userId, channel };
  const tools = toolsFor(user);
  const turnToolCalls: ToolCallRecord[] = [];
  let finalText = "";

  try {
    const client = getAnthropicClient();
    // web_search does its dynamic filtering inside a server-side code
    // execution container. Once a turn has one, every later request in the
    // loop must name it, or the API rejects the follow-up with
    // "container_id is required when there are pending tool uses".
    let containerId: string | undefined;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.messages.create({
        model: CONVERSATION_MODEL,
        max_tokens: 4096,
        // Chat is latency-sensitive and doesn't need deep reasoning, but the
        // send-vs-draft judgment and date math benefit from a bit of care -
        // medium splits the difference.
        output_config: { effort: "medium" },
        system,
        tools,
        messages,
        ...(containerId ? { container: containerId } : {}),
      });

      containerId = response.container?.id ?? containerId;

      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
      // Cited text (from web search) arrives split across several text
      // blocks mid-sentence, so join without adding separators.
      finalText = textBlocks
        .map((b) => b.text)
        .join("")
        .trim();

      // The server-side search loop hit its iteration cap; resend the
      // partial assistant turn and it resumes where it left off.
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

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
            : researchToolNames.has(toolUse.name)
              ? await executeResearchTool(turn, toolUse.name, toolUse.input)
              : await executeReminderTool(userId, channel, toolUse.name, toolUse.input);
        } catch (error) {
          console.error(`Tool ${toolUse.name} failed:`, error);
          result = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Tool failed" });
        }
        turnToolCalls.push(recordToolCall(toolUse.name, toolUse.input, result));
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
      toolCalls: turnToolCalls.length ? (turnToolCalls as unknown as Prisma.InputJsonValue) : undefined,
    },
  });

  return { userMessage, assistantMessage };
}
