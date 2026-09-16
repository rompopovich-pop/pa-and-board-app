import { z } from "zod/v4";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BoardFieldType } from "@prisma/client";
import { CONVERSATION_MODEL, getAnthropicClient } from "./anthropic";

// The board-generation engine (business-board-spec.md section 5): the
// owner's plain-language description in, a board schema out. Claude infers
// what a client record should track for this business, sensible status
// categories, and a default follow-up rule; this module then normalises
// what came back so the two fields every board must have (`name` and the
// general-info catch-all) are always present, keys are stable ASCII
// identifiers, and nothing downstream has to defend against a missing or
// duplicated column.

export const STATUS_TONES = ["new", "active", "needs_follow_up", "inactive"] as const;
export type StatusTone = (typeof STATUS_TONES)[number];

export interface BoardStatus {
  key: string;
  label: string;
  tone: StatusTone;
}

export interface FollowUpRule {
  days: number;
  basis: "last_session" | "last_contact";
  description: string;
}

export interface GeneratedField {
  key: string;
  label: string;
  type: BoardFieldType;
  options: string[];
  required: boolean;
  isSystem: boolean;
  hint: string | null;
}

export interface GeneratedBoard {
  businessName: string;
  businessType: string;
  language: string;
  boardName: string;
  clientNoun: string;
  clientNounPlural: string;
  fields: GeneratedField[];
  statuses: BoardStatus[];
  followUpRule: FollowUpRule;
  summary: string;
  assumptions: string | null;
}

const FIELD_TYPES = ["text", "long_text", "number", "date", "select", "phone", "email", "checkbox"] as const;

// Structured-output schema. Everything is required (structured outputs
// don't do optional keys); "nothing to say" is expressed with null or [].
const GeneratedBoardSchema = z.object({
  business_name: z.string().describe("A short name for the business, in the description's language"),
  business_type: z.string().describe("The category of business, e.g. 'therapist', in the description's language"),
  language: z.string().describe("BCP-47 primary language tag of the description, e.g. 'en' or 'he'"),
  board_name: z.string().describe("What to call the board, e.g. 'Patients' - in the description's language"),
  client_noun: z.string().describe("What this business calls one client (patient, student, client...), singular, in the description's language"),
  client_noun_plural: z.string().describe("Plural of client_noun"),
  fields: z.array(
    z.object({
      key: z.string().describe("Stable ASCII snake_case identifier in English, e.g. next_appointment"),
      label: z.string().describe("Label shown to the owner, in the description's language"),
      type: z.enum(FIELD_TYPES),
      options: z.array(z.string()).describe("Choices for a select field, in the description's language; [] for every other type"),
      required: z.boolean(),
      hint: z.string().nullable().describe("One short clause on why this field is here, or null"),
    }),
  ),
  statuses: z.array(
    z.object({
      key: z.string().describe("Stable ASCII snake_case identifier in English"),
      label: z.string().describe("Label shown to the owner, in the description's language"),
      tone: z.enum(STATUS_TONES),
    }),
  ),
  follow_up_rule: z.object({
    days: z.number().int().describe("Flag a client after this many days"),
    basis: z.enum(["last_session", "last_contact"]),
    description: z.string().describe("One plain sentence stating the rule, in the description's language"),
  }),
  summary: z.string().describe("2-4 warm, first-person sentences to the owner about what was built"),
  assumptions: z.string().nullable().describe("What was assumed because the description didn't say, or null"),
});

type RawGeneratedBoard = z.infer<typeof GeneratedBoardSchema>;

// Seed from business-board-spec.md section 8, expanded with the rules the
// app relies on (mandatory fields, what the record already tracks on its
// own, follow-up defaults per business type from spec section 7).
const SYSTEM_PROMPT = `You turn a small business owner's plain-language description of their business into a board schema: a set of client fields appropriate to that business, sensible status categories, and a default follow-up rule for when a client should be flagged. Be concrete and practical - infer what actually matters for this type of business rather than generating a generic contact list.

The owner is not technical. Design the board they would have built for themselves if they knew how, using their own words where they gave them. If they describe what they currently track (a notebook, a notes app, a spreadsheet), map every item they mentioned onto the board: nothing they track today should be missing.

Language: write every label, option, status, the board name, the client noun, the summary and any assumptions in the language the description is written in. Keys are always ASCII snake_case English identifiers.

Fields:
- Two fields are mandatory on every board and must use exactly these keys: "name" (type text, required, first) and "general_info" (type long_text, last) - the free-text catch-all for anything the other fields don't cover.
- Include a phone field (type phone) unless the business clearly never contacts clients directly. Add email only if it matters for this business.
- 6 to 12 fields in total, including the two mandatory ones. Prefer fewer, sharper fields over an exhaustive form.
- Types: text for short free text; long_text for a paragraph; number for counts and money (sessions paid for, session number, balance); date for a next appointment, start date, last visit; select for a small closed set of choices (give 2-6 options); checkbox for a plain yes/no; phone and email for contact details.
- Do NOT add fields for things the record already has on its own: a status column, a chronological history log where the owner logs each session or note (so no "session notes", "history", "last session date", "notes" fields), and created/updated timestamps. Counters like "session number" or "sessions paid for" are still useful fields.
- "Who I'm seeing today" or similar means a next-appointment date field.

Statuses: 3 to 6 categories that fit this business, each tagged with a tone: "new" (just arrived / not yet started), "active" (ongoing), "needs_follow_up" (attention needed), "inactive" (finished, paused or lapsed). Include at least one status of tone new, one active, one needs_follow_up and one inactive. Business-specific labels ("In treatment", "Waiting list", "On hold") are better than generic ones when they fit.

Follow-up rule: how many days without a session (basis "last_session", for anyone with recurring appointments) or without contact (basis "last_contact", for everyone else) before a client is flagged. If the owner states a window, use it exactly. Otherwise use about 1.5x the typical interval between visits: weekly clients -> 10-14 days; every two weeks -> 21; monthly -> 45; a 6-8 week cycle (hairdressers, dentists) -> 60-70; consultants and project work -> 30. Describe the rule in one plain sentence in the owner's language.

Summary: 2-4 warm, brief, first-person sentences to the owner ("I've set up..."), naming the follow-up rule in plain words. No jargon: say "board" and "follow up", never "schema", "field type" or "rule engine".

If the description is vague or incomplete (for example just "I run a small business"), still build a sensible starter board (name, phone, email, what they buy or book, when you last saw them, general info) rather than asking questions, and state briefly in "assumptions" what you assumed and that any of it can be changed later. Set assumptions to null when the description was clear enough.`;

export class BoardGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardGenerationError";
  }
}

const DEFAULTS: Record<string, { name: string; generalInfo: string; client: [string, string]; statuses: BoardStatus[] }> = {
  en: {
    name: "Name",
    generalInfo: "General info",
    client: ["client", "clients"],
    statuses: [
      { key: "new", label: "New", tone: "new" },
      { key: "active", label: "Active", tone: "active" },
      { key: "needs_follow_up", label: "Needs follow-up", tone: "needs_follow_up" },
      { key: "inactive", label: "Inactive", tone: "inactive" },
    ],
  },
  he: {
    name: "שם",
    generalInfo: "מידע כללי",
    client: ["לקוח", "לקוחות"],
    statuses: [
      { key: "new", label: "חדש", tone: "new" },
      { key: "active", label: "פעיל", tone: "active" },
      { key: "needs_follow_up", label: "דורש מעקב", tone: "needs_follow_up" },
      { key: "inactive", label: "לא פעיל", tone: "inactive" },
    ],
  },
};

export function slugKey(raw: string, fallback: string): string {
  const slug = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

function uniqueKey(key: string, taken: Set<string>): string {
  let candidate = key;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${key}_${n++}`;
  }
  taken.add(candidate);
  return candidate;
}

const NAME_LABELS = /^(name|full name|client name|patient name|שם|שם מלא|שם הלקוח|שם המטופל)$/i;
const GENERAL_INFO_LABELS = /(general|misc|other|background|כללי|רקע)/i;

/** Turns the model's raw output into the shape the rest of the app relies on. */
export function normalizeGeneratedBoard(raw: RawGeneratedBoard): GeneratedBoard {
  const language = (raw.language || "en").toLowerCase().split(/[-_]/)[0] || "en";
  const defaults = DEFAULTS[language] ?? DEFAULTS.en;

  const taken = new Set<string>(["status"]);
  const fields: GeneratedField[] = [];
  raw.fields.forEach((field, index) => {
    const label = field.label.trim();
    if (!label) return;
    let key = slugKey(field.key, `field_${index + 1}`);
    if (key !== "name" && NAME_LABELS.test(label)) key = "name";
    if (key !== "general_info" && field.type === "long_text" && GENERAL_INFO_LABELS.test(label) && !taken.has("general_info")) {
      key = "general_info";
    }
    if (taken.has(key) && (key === "name" || key === "general_info")) return; // a second copy of a system field
    key = uniqueKey(key, taken);

    const isSystem = key === "name" || key === "general_info";
    const options = field.type === "select" ? Array.from(new Set(field.options.map((o) => o.trim()).filter(Boolean))) : [];
    const type: BoardFieldType = isSystem
      ? key === "name"
        ? "text"
        : "long_text"
      : field.type === "select" && options.length < 2
        ? "text"
        : field.type;

    fields.push({
      key,
      label,
      type,
      options: type === "select" ? options : [],
      required: key === "name" ? true : key === "general_info" ? false : field.required,
      isSystem,
      hint: field.hint?.trim() || null,
    });
  });

  if (!fields.some((f) => f.key === "name")) {
    fields.unshift({ key: "name", label: defaults.name, type: "text", options: [], required: true, isSystem: true, hint: null });
  }
  if (!fields.some((f) => f.key === "general_info")) {
    fields.push({ key: "general_info", label: defaults.generalInfo, type: "long_text", options: [], required: false, isSystem: true, hint: null });
  }

  // `name` first, `general_info` last, everything else in the order given.
  const ordered = [
    fields.find((f) => f.key === "name")!,
    ...fields.filter((f) => !f.isSystem).slice(0, 14),
    fields.find((f) => f.key === "general_info")!,
  ];

  const statusKeys = new Set<string>();
  let statuses: BoardStatus[] = raw.statuses
    .map((status, index) => ({
      key: slugKey(status.key || status.label, `status_${index + 1}`),
      label: status.label.trim(),
      tone: status.tone,
    }))
    .filter((status) => status.label && !statusKeys.has(status.key) && statusKeys.add(status.key))
    .slice(0, 8);
  if (statuses.length === 0) statuses = defaults.statuses;
  // Make sure the app always has a "new" bucket to drop fresh clients into
  // and a "needs follow-up" one for Phase 2 to move people into.
  for (const tone of ["new", "needs_follow_up"] as const) {
    if (!statuses.some((s) => s.tone === tone)) {
      const fallback = defaults.statuses.find((s) => s.tone === tone)!;
      statuses = tone === "new" ? [fallback, ...statuses] : [...statuses, fallback];
    }
  }

  const days = Number.isFinite(raw.follow_up_rule.days) ? Math.min(365, Math.max(1, Math.round(raw.follow_up_rule.days))) : 21;

  return {
    businessName: raw.business_name.trim() || raw.business_type.trim() || "My business",
    businessType: raw.business_type.trim() || "business",
    language,
    boardName: raw.board_name.trim() || defaults.client[1],
    clientNoun: raw.client_noun.trim() || defaults.client[0],
    clientNounPlural: raw.client_noun_plural.trim() || defaults.client[1],
    fields: ordered,
    statuses,
    followUpRule: { days, basis: raw.follow_up_rule.basis, description: raw.follow_up_rule.description.trim() },
    summary: raw.summary.trim(),
    assumptions: raw.assumptions?.trim() || null,
  };
}

/** Runs the engine on a description. Throws BoardGenerationError when the model can't. */
export async function generateBoardSchema(description: string): Promise<GeneratedBoard> {
  const client = getAnthropicClient();
  let response;
  try {
    response = await client.messages.parse({
      model: CONVERSATION_MODEL,
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Business description:\n"""\n${description.trim()}\n"""` }],
      output_config: { format: zodOutputFormat(GeneratedBoardSchema), effort: "medium" },
    });
  } catch (error) {
    console.error("Board generation request failed:", error);
    throw new BoardGenerationError("I couldn't reach the board builder just now - please try again in a moment.");
  }

  if (!response.parsed_output) {
    console.error("Board generation returned no parsed output; stop_reason:", response.stop_reason);
    throw new BoardGenerationError("I couldn't turn that into a board - could you try describing it a little differently?");
  }

  return normalizeGeneratedBoard(response.parsed_output);
}
