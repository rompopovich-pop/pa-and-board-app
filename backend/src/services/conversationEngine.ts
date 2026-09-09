import Anthropic from "@anthropic-ai/sdk";
import { MessageChannel, User } from "@prisma/client";
import { prisma } from "../db";
import { getAnthropicClient, CONVERSATION_MODEL } from "./anthropic";
import { reminderTools, executeReminderTool } from "./reminderTools";

// One user, one conversation/task state, regardless of channel - see
// pa-whatsapp-spec.md section 3. Both the WhatsApp webhook and the app's
// /pa/messages route call this same function.

const HISTORY_LIMIT = 30;
const MAX_TOOL_ITERATIONS = 5;
const FALLBACK_REPLY = "Sorry, I'm having trouble connecting right now - please try again in a bit.";

function buildSystemPrompt(user: Pick<User, "name" | "timezone">): string {
  const nowIso = new Date().toISOString();

  const identity = user.name
    ? `You are ${user.name}'s personal assistant, reachable by text through the app or WhatsApp.`
    : "You are this person's personal assistant, reachable by text through the app or WhatsApp. You don't know their name yet.";

  const timezoneNote = user.timezone
    ? `Their timezone is ${user.timezone} - use it to work out dates/times they mention (e.g. "tomorrow at 9am").`
    : "You don't know their timezone yet. If it matters for a reminder's timing, ask, or call update_user_profile as soon as they mention their city or timezone.";

  const onboardingNote = !user.name
    ? 'This looks like a new conversation. Greet them warmly, introduce yourself briefly, and ask their name (and where they\'re based, for timezone) before getting into anything else. Call update_user_profile as soon as you learn either one.'
    : "";

  return [
    identity,
    "Be warm, brief, and capable - the way a genuinely excellent human PA talks, not like a chatbot.",
    "Always reply in the same language the user just wrote in, regardless of what language earlier turns were in.",
    timezoneNote,
    `The current UTC date and time is ${nowIso}.`,
    "Right now you can chat and manage reminders (create, list, cancel). Email, calendar, web research, and reaching out to people on their behalf are coming soon - if asked for any of those, say so honestly rather than pretending to do it.",
    "When creating a reminder, compute due_at as an absolute UTC ISO 8601 datetime from what they said plus the current time/timezone above.",
    onboardingNote,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function handleIncomingMessage(
  userId: string,
  text: string,
  channel: MessageChannel,
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  await prisma.message.create({ data: { userId, role: "user", channel, content: text } });

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

  const system = buildSystemPrompt(user);
  let finalText = "";

  try {
    const client = getAnthropicClient();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await client.messages.create({
        model: CONVERSATION_MODEL,
        max_tokens: 2048,
        // Chat is latency-sensitive and doesn't need deep reasoning, but
        // reminder due_at math benefits from a bit of care - medium splits
        // the difference (see shared/cost-optimization.md in the claude-api skill).
        output_config: { effort: "medium" },
        system,
        tools: reminderTools,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
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
        const result = await executeReminderTool(userId, channel, toolUse.name, toolUse.input);
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

  await prisma.message.create({ data: { userId, role: "assistant", channel, content: finalText } });

  return finalText;
}
