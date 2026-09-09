import Anthropic from "@anthropic-ai/sdk";
import { gmail_v1 } from "@googleapis/gmail";
import { EmailDraft } from "@prisma/client";
import { prisma } from "../db";
import { TurnContext } from "./toolContext";
import {
  buildGoogleConnectUrl,
  calendarFor,
  getGoogleClientForUser,
  gmailFor,
  isGoogleConfigured,
} from "./google";

// Gmail + Calendar tools for the conversation engine (spec section 6). The
// auto-send-vs-draft rule itself lives in the system prompt; these tools are
// the two halves of it (send_email vs draft_email + send_draft).

export const googleTools: Anthropic.Tool[] = [
  {
    name: "get_google_connect_link",
    description:
      "Get the link the user needs to open to connect their Google account (Gmail + Calendar). Use when they ask for anything email- or calendar-related but aren't connected yet.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_emails",
    description:
      "List recent emails from the user's Gmail. Returns id, from, subject, date and a snippet for each. Use a Gmail search query to narrow it down (e.g. 'from:dana', 'is:unread', 'subject:invoice').",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Gmail search query. Defaults to the inbox from the last 7 days.",
        },
        max_results: { type: "integer", description: "How many to return (1-20). Default 10." },
      },
    },
  },
  {
    name: "read_email",
    description: "Read the full text of one email by id (from list_emails).",
    input_schema: {
      type: "object",
      properties: { message_id: { type: "string" } },
      required: ["message_id"],
    },
  },
  {
    name: "send_email",
    description:
      "Send an email immediately, without asking. ONLY for unambiguous requests where the user has already decided what to say and you're just delivering it (see your instructions). To reply within an existing thread, pass reply_to_message_id.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient address. Optional when replying - defaults to the original sender." },
        subject: { type: "string", description: "Optional when replying - defaults to 'Re: <original subject>'." },
        body: { type: "string", description: "Plain-text body, in the user's voice, signed the way they would." },
        reply_to_message_id: { type: "string", description: "Gmail message id to reply to, if this is a reply." },
      },
      required: ["body"],
    },
  },
  {
    name: "draft_email",
    description:
      "Create an email draft for the user to approve before it's sent. Use whenever you had to decide what to say (tone, wording, judgment), or for anything involving money, contracts, legal terms, or a decline. The draft is saved in their Gmail Drafts too.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient address. Optional when replying - defaults to the original sender." },
        subject: { type: "string", description: "Optional when replying - defaults to 'Re: <original subject>'." },
        body: { type: "string", description: "Plain-text body, in the user's voice." },
        reply_to_message_id: { type: "string", description: "Gmail message id to reply to, if this is a reply." },
      },
      required: ["body"],
    },
  },
  {
    name: "send_draft",
    description:
      "Send a draft the user has just approved ('send it', 'yes', 'looks good'). Defaults to the most recent pending draft.",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string", description: "Draft id from draft_email or your instructions." } },
    },
  },
  {
    name: "discard_draft",
    description:
      "Discard a pending draft the user rejected or wants rewritten. Defaults to the most recent pending draft. Then create a new one with draft_email if they asked for changes.",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string" } },
    },
  },
  {
    name: "list_calendar_events",
    description:
      "List the user's calendar events in a time window - use it to check availability (the gaps between events) or to answer 'what's on my calendar'.",
    input_schema: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "Window start as ISO 8601 UTC datetime." },
        time_max: { type: "string", description: "Window end as ISO 8601 UTC datetime." },
      },
      required: ["time_min", "time_max"],
    },
  },
  {
    name: "create_calendar_event",
    description:
      "Create an event on the user's primary calendar. Use for direct requests, confirmed bookings, or reminders that are really appointments.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title." },
        start: { type: "string", description: "Start as ISO 8601 UTC datetime." },
        end: { type: "string", description: "End as ISO 8601 UTC datetime." },
        description: { type: "string" },
        location: { type: "string" },
        attendees: { type: "array", items: { type: "string" }, description: "Attendee email addresses." },
      },
      required: ["summary", "start", "end"],
    },
  },
];

export const googleToolNames = new Set(googleTools.map((tool) => tool.name));

const NOT_CONNECTED = JSON.stringify({
  ok: false,
  reason: "google_not_connected",
  hint: "The user hasn't connected Google. Call get_google_connect_link and share the link warmly.",
});

const NOT_CONFIGURED = JSON.stringify({
  ok: false,
  reason: "google_not_configured",
  hint: "Google integration isn't set up on this server yet - tell the user email and calendar aren't available yet.",
});

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function header(message: gmail_v1.Schema$Message, name: string): string | undefined {
  return message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

function decodeBody(data: string | null | undefined): string {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function extractText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  const plainParts: string[] = [];
  const htmlParts: string[] = [];

  const walk = (part: gmail_v1.Schema$MessagePart) => {
    if (part.mimeType === "text/plain" && part.body?.data) plainParts.push(decodeBody(part.body.data));
    else if (part.mimeType === "text/html" && part.body?.data) htmlParts.push(decodeBody(part.body.data));
    part.parts?.forEach(walk);
  };
  walk(payload);

  if (plainParts.length) return plainParts.join("\n").trim();
  return htmlParts
    .join("\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function encodeHeaderValue(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

function buildRawEmail(email: OutgoingEmail): string {
  const lines = [
    `To: ${email.to}`,
    `Subject: ${encodeHeaderValue(email.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    email.inReplyTo ? `In-Reply-To: ${email.inReplyTo}` : null,
    email.references ? `References: ${email.references}` : null,
    "",
    Buffer.from(email.body, "utf8").toString("base64"),
  ].filter((line): line is string => line !== null);
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

/** Resolves to/subject/threading from the tool input, filling in reply
 * defaults from the original message when reply_to_message_id is given. */
async function resolveOutgoing(gmailClient: gmail_v1.Gmail, args: Record<string, unknown>): Promise<OutgoingEmail | string> {
  const body = str(args.body);
  if (!body) return JSON.stringify({ ok: false, error: "body is required" });

  const replyToId = str(args.reply_to_message_id);
  let to = str(args.to);
  let subject = str(args.subject);
  let inReplyTo: string | undefined;
  let references: string | undefined;
  let threadId: string | undefined;

  if (replyToId) {
    const original = await gmailClient.users.messages.get({
      userId: "me",
      id: replyToId,
      format: "metadata",
      metadataHeaders: ["Message-ID", "References", "Subject", "From", "Reply-To"],
    });
    const messageId = header(original.data, "Message-ID");
    to ??= header(original.data, "Reply-To") ?? header(original.data, "From");
    const originalSubject = header(original.data, "Subject") ?? "";
    subject ??= /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
    inReplyTo = messageId;
    references = [header(original.data, "References"), messageId].filter(Boolean).join(" ") || undefined;
    threadId = original.data.threadId ?? undefined;
  }

  if (!to) return JSON.stringify({ ok: false, error: "to is required (or pass reply_to_message_id)" });
  subject ??= "(no subject)";

  return { to, subject, body, inReplyTo, references, threadId };
}

async function findPendingDraft(userId: string, draftId?: string): Promise<EmailDraft | null> {
  if (draftId) {
    return prisma.emailDraft.findFirst({ where: { id: draftId, userId, status: "pending" } });
  }
  return prisma.emailDraft.findFirst({ where: { userId, status: "pending" }, orderBy: { createdAt: "desc" } });
}

async function markDraftMessages(userId: string, draftId: string, status: "sent" | "discarded"): Promise<void> {
  // The chat message that carried this draft as a confirmation card gets its
  // status updated so the card stops offering Send/Discard.
  const carriers = await prisma.message.findMany({
    where: { userId, metadata: { path: ["draftId"], equals: draftId } },
  });
  for (const carrier of carriers) {
    const metadata = (carrier.metadata ?? {}) as Record<string, unknown>;
    await prisma.message.update({ where: { id: carrier.id }, data: { metadata: { ...metadata, status } } });
  }
}

export async function sendPendingDraft(userId: string, draftId?: string): Promise<EmailDraft | null> {
  const draft = await findPendingDraft(userId, draftId);
  if (!draft) return null;
  const client = await getGoogleClientForUser(userId);
  if (!client) throw new Error("Google is not connected");

  await gmailFor(client).users.drafts.send({ userId: "me", requestBody: { id: draft.gmailDraftId } });
  const updated = await prisma.emailDraft.update({ where: { id: draft.id }, data: { status: "sent" } });
  await markDraftMessages(userId, draft.id, "sent");
  return updated;
}

export async function discardPendingDraft(userId: string, draftId?: string): Promise<EmailDraft | null> {
  const draft = await findPendingDraft(userId, draftId);
  if (!draft) return null;
  const client = await getGoogleClientForUser(userId);
  if (client) {
    await gmailFor(client)
      .users.drafts.delete({ userId: "me", id: draft.gmailDraftId })
      .catch((error) => console.warn("Gmail draft delete failed:", error));
  }
  const updated = await prisma.emailDraft.update({ where: { id: draft.id }, data: { status: "discarded" } });
  await markDraftMessages(userId, draft.id, "discarded");
  return updated;
}

export async function listPendingDrafts(userId: string): Promise<EmailDraft[]> {
  return prisma.emailDraft.findMany({ where: { userId, status: "pending" }, orderBy: { createdAt: "desc" }, take: 5 });
}

export async function executeGoogleTool(ctx: TurnContext, name: string, input: unknown): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;
  const { userId } = ctx;

  if (name === "get_google_connect_link") {
    if (!isGoogleConfigured()) return NOT_CONFIGURED;
    return JSON.stringify({ ok: true, url: buildGoogleConnectUrl(userId) });
  }

  if (!isGoogleConfigured()) return NOT_CONFIGURED;
  const client = await getGoogleClientForUser(userId);
  if (!client) return NOT_CONNECTED;

  switch (name) {
    case "list_emails": {
      const gmailClient = gmailFor(client);
      const maxResults = Math.min(Math.max(Number(args.max_results) || 10, 1), 20);
      const list = await gmailClient.users.messages.list({
        userId: "me",
        q: str(args.query) ?? "in:inbox newer_than:7d",
        maxResults,
      });
      const ids = (list.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      const messages = await Promise.all(
        ids.map((id) =>
          gmailClient.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          }),
        ),
      );
      return JSON.stringify({
        ok: true,
        emails: messages.map((m) => ({
          id: m.data.id,
          thread_id: m.data.threadId,
          from: header(m.data, "From"),
          subject: header(m.data, "Subject"),
          date: header(m.data, "Date"),
          snippet: m.data.snippet,
          unread: m.data.labelIds?.includes("UNREAD") ?? false,
        })),
      });
    }

    case "read_email": {
      const id = str(args.message_id);
      if (!id) return JSON.stringify({ ok: false, error: "message_id is required" });
      const message = await gmailFor(client).users.messages.get({ userId: "me", id, format: "full" });
      return JSON.stringify({
        ok: true,
        id: message.data.id,
        thread_id: message.data.threadId,
        from: header(message.data, "From"),
        to: header(message.data, "To"),
        subject: header(message.data, "Subject"),
        date: header(message.data, "Date"),
        body: extractText(message.data.payload).slice(0, 8000),
      });
    }

    case "send_email": {
      const gmailClient = gmailFor(client);
      const outgoing = await resolveOutgoing(gmailClient, args);
      if (typeof outgoing === "string") return outgoing;
      const sent = await gmailClient.users.messages.send({
        userId: "me",
        requestBody: { raw: buildRawEmail(outgoing), threadId: outgoing.threadId },
      });
      return JSON.stringify({ ok: true, id: sent.data.id, to: outgoing.to, subject: outgoing.subject });
    }

    case "draft_email": {
      const gmailClient = gmailFor(client);
      const outgoing = await resolveOutgoing(gmailClient, args);
      if (typeof outgoing === "string") return outgoing;
      const created = await gmailClient.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw: buildRawEmail(outgoing), threadId: outgoing.threadId } },
      });
      if (!created.data.id) return JSON.stringify({ ok: false, error: "Gmail did not return a draft id" });

      const draft = await prisma.emailDraft.create({
        data: {
          userId,
          gmailDraftId: created.data.id,
          to: outgoing.to,
          subject: outgoing.subject,
          body: outgoing.body,
          threadId: outgoing.threadId,
        },
      });
      ctx.metadata = {
        type: "email_draft",
        draftId: draft.id,
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        status: "pending",
      };
      return JSON.stringify({ ok: true, draft_id: draft.id, to: draft.to, subject: draft.subject, body: draft.body });
    }

    case "send_draft": {
      const draft = await sendPendingDraft(userId, str(args.draft_id));
      if (!draft) return JSON.stringify({ ok: false, reason: "no_pending_draft" });
      return JSON.stringify({ ok: true, sent: { draft_id: draft.id, to: draft.to, subject: draft.subject } });
    }

    case "discard_draft": {
      const draft = await discardPendingDraft(userId, str(args.draft_id));
      if (!draft) return JSON.stringify({ ok: false, reason: "no_pending_draft" });
      return JSON.stringify({ ok: true, discarded: { draft_id: draft.id, to: draft.to, subject: draft.subject } });
    }

    case "list_calendar_events": {
      const timeMin = str(args.time_min);
      const timeMax = str(args.time_max);
      if (!timeMin || !timeMax) return JSON.stringify({ ok: false, error: "time_min and time_max are required" });
      const events = await calendarFor(client).events.list({
        calendarId: "primary",
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      });
      return JSON.stringify({
        ok: true,
        events: (events.data.items ?? []).map((event) => ({
          id: event.id,
          summary: event.summary,
          start: event.start?.dateTime ?? event.start?.date,
          end: event.end?.dateTime ?? event.end?.date,
          location: event.location,
          attendees: event.attendees?.map((a) => a.email),
        })),
      });
    }

    case "create_calendar_event": {
      const summary = str(args.summary);
      const start = str(args.start);
      const end = str(args.end);
      if (!summary || !start || !end) return JSON.stringify({ ok: false, error: "summary, start and end are required" });
      if (Number.isNaN(Date.parse(start)) || Number.isNaN(Date.parse(end))) {
        return JSON.stringify({ ok: false, error: "start/end must be ISO 8601 datetimes" });
      }
      const user = await prisma.user.findUnique({ where: { id: userId } });
      const timeZone = user?.timezone ?? "UTC";
      const attendees = Array.isArray(args.attendees)
        ? args.attendees.filter((a): a is string => typeof a === "string").map((email) => ({ email }))
        : undefined;
      const created = await calendarFor(client).events.insert({
        calendarId: "primary",
        requestBody: {
          summary,
          description: str(args.description),
          location: str(args.location),
          start: { dateTime: start, timeZone },
          end: { dateTime: end, timeZone },
          attendees,
        },
      });
      return JSON.stringify({
        ok: true,
        id: created.data.id,
        link: created.data.htmlLink,
        start: created.data.start?.dateTime,
        end: created.data.end?.dateTime,
      });
    }

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool ${name}` });
  }
}
