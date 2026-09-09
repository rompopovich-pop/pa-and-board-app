import Anthropic from "@anthropic-ai/sdk";
import { MessageChannel } from "@prisma/client";
import { prisma } from "../db";

export const reminderTools: Anthropic.Tool[] = [
  {
    name: "create_reminder",
    description:
      "Create a reminder for the user. Call this whenever they ask to be reminded of something, at a specific time or after a delay.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "What to remind the user about, written the way you'd say it to them.",
        },
        due_at: {
          type: "string",
          description:
            "The UTC datetime the reminder should fire, as ISO 8601 (e.g. 2026-09-10T14:00:00Z). Compute this from the current time and the user's timezone given in your instructions.",
        },
        recurrence: {
          type: "string",
          enum: ["none", "daily", "weekly", "monthly"],
          description: "How often the reminder repeats. Default 'none' for a one-off reminder.",
        },
      },
      required: ["text", "due_at"],
    },
  },
  {
    name: "list_reminders",
    description:
      "List the user's upcoming pending reminders. Use this to answer questions about existing reminders, or to find the right one before cancelling it.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancel_reminder",
    description:
      "Cancel a pending reminder that matches the given description. If it's ambiguous which reminder is meant, the result lists the candidates so you can ask the user to clarify.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Words identifying which reminder to cancel, e.g. 'dentist' or 'call mom'.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "update_user_profile",
    description:
      "Save the user's name and/or IANA timezone once they've told you (directly, or by mentioning their city or country). Use this during onboarding for a first-time user, and any other time they mention their name or where they're based.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        timezone: {
          type: "string",
          description: "IANA timezone name, e.g. 'America/New_York' or 'Asia/Jerusalem'.",
        },
      },
    },
  },
];

export async function executeReminderTool(
  userId: string,
  channel: MessageChannel,
  name: string,
  input: unknown,
): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;

  switch (name) {
    case "create_reminder": {
      const text = typeof args.text === "string" ? args.text.trim() : "";
      const dueAt = typeof args.due_at === "string" ? new Date(args.due_at) : new Date(NaN);
      const recurrence = typeof args.recurrence === "string" ? args.recurrence : "none";

      if (!text) return JSON.stringify({ ok: false, error: "text is required" });
      if (Number.isNaN(dueAt.getTime())) {
        return JSON.stringify({ ok: false, error: "due_at was not a valid ISO 8601 datetime" });
      }
      if (!["none", "daily", "weekly", "monthly"].includes(recurrence)) {
        return JSON.stringify({ ok: false, error: "recurrence must be none, daily, weekly, or monthly" });
      }

      const reminder = await prisma.reminder.create({
        data: { userId, text, dueAt, recurrence: recurrence as never, channel },
      });
      return JSON.stringify({
        ok: true,
        id: reminder.id,
        text: reminder.text,
        due_at: reminder.dueAt.toISOString(),
        recurrence: reminder.recurrence,
      });
    }

    case "list_reminders": {
      const reminders = await prisma.reminder.findMany({
        where: { userId, status: "pending" },
        orderBy: { dueAt: "asc" },
        take: 20,
      });
      return JSON.stringify({
        reminders: reminders.map((r) => ({
          id: r.id,
          text: r.text,
          due_at: r.dueAt.toISOString(),
          recurrence: r.recurrence,
        })),
      });
    }

    case "cancel_reminder": {
      const description = typeof args.description === "string" ? args.description.trim() : "";
      if (!description) return JSON.stringify({ ok: false, error: "description is required" });

      const candidates = await prisma.reminder.findMany({
        where: { userId, status: "pending", text: { contains: description, mode: "insensitive" } },
        orderBy: { dueAt: "asc" },
      });

      if (candidates.length === 0) {
        return JSON.stringify({ ok: false, reason: "no_match" });
      }
      if (candidates.length > 1) {
        return JSON.stringify({
          ok: false,
          reason: "ambiguous",
          candidates: candidates.map((c) => ({ id: c.id, text: c.text, due_at: c.dueAt.toISOString() })),
        });
      }

      const [match] = candidates;
      await prisma.reminder.update({ where: { id: match.id }, data: { status: "cancelled" } });
      return JSON.stringify({ ok: true, cancelled: { id: match.id, text: match.text } });
    }

    case "update_user_profile": {
      const data: { name?: string; timezone?: string } = {};
      if (typeof args.name === "string" && args.name.trim()) data.name = args.name.trim();
      if (typeof args.timezone === "string" && args.timezone.trim()) data.timezone = args.timezone.trim();

      if (Object.keys(data).length === 0) {
        return JSON.stringify({ ok: false, error: "nothing to update" });
      }

      const user = await prisma.user.update({ where: { id: userId }, data });
      return JSON.stringify({ ok: true, name: user.name, timezone: user.timezone });
    }

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool ${name}` });
  }
}
