import Anthropic from "@anthropic-ai/sdk";
import { Prisma, ResearchSession } from "@prisma/client";
import { prisma } from "../db";
import { TurnContext } from "./toolContext";
import { patchMessageMetadata } from "./messageMetadata";

// Research & booking-assist (pa-whatsapp-spec.md section 7, Phase 3). Web
// search itself is Anthropic's server-side tool - Claude searches within the
// same API call, nothing to execute here. These custom tools implement the
// "present options, wait for explicit confirmation" flow around it.

export interface ResearchOption {
  id: string;
  title: string;
  summary: string;
  price?: string;
  url?: string;
  details?: string;
}

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

export function webSearchToolFor(timezone: string | null): Anthropic.Messages.WebSearchTool20260209 {
  return {
    type: "web_search_20260209",
    name: "web_search",
    max_uses: 5,
    user_location: timezone ? { type: "approximate", timezone } : undefined,
  };
}

export const researchTools: Anthropic.Tool[] = [
  {
    name: "present_options",
    description:
      "Present 2-4 concrete options for a research or booking request (flights, hotels, restaurants, products, plans) so the user can pick one. Call this after researching with web_search. Nothing is booked, reserved, or paid by this - the user completes any booking themselves through the option's link.",
    input_schema: {
      type: "object",
      properties: {
        request: { type: "string", description: "The request in one line, e.g. 'Flights Tel Aviv to London, Oct 12-15'." },
        options: {
          type: "array",
          minItems: MIN_OPTIONS,
          maxItems: MAX_OPTIONS,
          items: {
            type: "object",
            properties: {
              title: { type: "string", description: "Short name, e.g. 'El Al LY315, 08:10 direct'." },
              summary: { type: "string", description: "One line on why it's worth considering." },
              price: { type: "string", description: "Price with currency, if known." },
              url: { type: "string", description: "Link to view or book it." },
              details: { type: "string", description: "Any extra specifics (times, duration, address, conditions)." },
            },
            required: ["title", "summary"],
          },
        },
      },
      required: ["request", "options"],
    },
  },
  {
    name: "confirm_option",
    description:
      "Record which option the user explicitly chose. Only call this after they clearly pick one ('option 2', 'the morning flight', 'yes, that one') - never on your own initiative. Defaults to the most recent set of options.",
    input_schema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        option_id: { type: "string" },
        option_number: { type: "integer", description: "1-based position in the list, if the user answered with a number." },
      },
    },
  },
  {
    name: "dismiss_options",
    description: "The user doesn't want any of the presented options. Defaults to the most recent set. Then ask what to change and search again.",
    input_schema: {
      type: "object",
      properties: { session_id: { type: "string" } },
    },
  },
];

export const researchToolNames = new Set(researchTools.map((tool) => tool.name));

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function optionsOf(session: ResearchSession): ResearchOption[] {
  return Array.isArray(session.options) ? (session.options as unknown as ResearchOption[]) : [];
}

function isPending(session: ResearchSession): boolean {
  return !session.confirmed && !session.dismissedAt;
}

async function findSession(userId: string, sessionId?: string): Promise<ResearchSession | null> {
  if (sessionId) {
    return prisma.researchSession.findFirst({ where: { id: sessionId, userId } });
  }
  return prisma.researchSession.findFirst({
    where: { userId, confirmed: false, dismissedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function latestResearchSession(userId: string): Promise<ResearchSession | null> {
  return prisma.researchSession.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export interface ConfirmSelector {
  sessionId?: string;
  optionId?: string;
  optionNumber?: number;
}

/** Marks the user's explicit pick. Returns null if there's no matching
 * pending session/option - the caller decides how to phrase that. */
export async function confirmResearchOption(
  userId: string,
  selector: ConfirmSelector,
): Promise<{ session: ResearchSession; option: ResearchOption; number: number } | null> {
  const session = await findSession(userId, selector.sessionId);
  if (!session || !isPending(session)) return null;

  const options = optionsOf(session);
  const index = selector.optionId
    ? options.findIndex((o) => o.id === selector.optionId)
    : selector.optionNumber
      ? selector.optionNumber - 1
      : -1;
  const option = options[index];
  if (!option) return null;

  const updated = await prisma.researchSession.update({
    where: { id: session.id },
    data: { confirmed: true, chosenOptionId: option.id },
  });
  await patchMessageMetadata(userId, "sessionId", session.id, { status: "confirmed", chosenOptionId: option.id });
  return { session: updated, option, number: index + 1 };
}

export async function dismissResearchSession(userId: string, sessionId?: string): Promise<ResearchSession | null> {
  const session = await findSession(userId, sessionId);
  if (!session || !isPending(session)) return null;

  const updated = await prisma.researchSession.update({
    where: { id: session.id },
    data: { dismissedAt: new Date() },
  });
  await patchMessageMetadata(userId, "sessionId", session.id, { status: "dismissed" });
  return updated;
}

export async function executeResearchTool(ctx: TurnContext, name: string, input: unknown): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;
  const { userId } = ctx;

  switch (name) {
    case "present_options": {
      const request = str(args.request);
      const rawOptions = Array.isArray(args.options) ? args.options : [];
      if (!request) return JSON.stringify({ ok: false, error: "request is required" });
      if (rawOptions.length < MIN_OPTIONS || rawOptions.length > MAX_OPTIONS) {
        return JSON.stringify({ ok: false, error: `Present between ${MIN_OPTIONS} and ${MAX_OPTIONS} options` });
      }

      const options: ResearchOption[] = [];
      for (const [i, raw] of rawOptions.entries()) {
        const candidate = (raw ?? {}) as Record<string, unknown>;
        const title = str(candidate.title);
        const summary = str(candidate.summary);
        if (!title || !summary) return JSON.stringify({ ok: false, error: `Option ${i + 1} needs a title and summary` });
        options.push({
          id: `option-${i + 1}`,
          title,
          summary,
          price: str(candidate.price),
          url: str(candidate.url),
          details: str(candidate.details),
        });
      }

      // A new set supersedes any older pending one, so "option 2" is never ambiguous.
      await prisma.researchSession.updateMany({
        where: { userId, confirmed: false, dismissedAt: null },
        data: { dismissedAt: new Date() },
      });

      const session = await prisma.researchSession.create({
        data: { userId, request, options: options as unknown as Prisma.InputJsonValue },
      });
      ctx.metadata = {
        type: "research_options",
        sessionId: session.id,
        request,
        options,
        status: "pending",
      } as unknown as Prisma.InputJsonObject;
      return JSON.stringify({
        ok: true,
        session_id: session.id,
        options: options.map((o, i) => ({ number: i + 1, id: o.id, title: o.title })),
      });
    }

    case "confirm_option": {
      const result = await confirmResearchOption(userId, {
        sessionId: str(args.session_id),
        optionId: str(args.option_id),
        optionNumber: typeof args.option_number === "number" ? args.option_number : undefined,
      });
      if (!result) return JSON.stringify({ ok: false, reason: "no_matching_pending_option" });
      return JSON.stringify({
        ok: true,
        confirmed: { number: result.number, ...result.option },
        note: "Recorded the user's choice. Nothing has been booked or paid - give them the link to complete it, and offer a calendar event or reminder.",
      });
    }

    case "dismiss_options": {
      const session = await dismissResearchSession(userId, str(args.session_id));
      if (!session) return JSON.stringify({ ok: false, reason: "no_pending_options" });
      return JSON.stringify({ ok: true, dismissed: { session_id: session.id, request: session.request } });
    }

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool ${name}` });
  }
}
