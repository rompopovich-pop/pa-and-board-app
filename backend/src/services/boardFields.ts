import { BoardField } from "@prisma/client";

// The dynamic field layer (business-board-spec.md section 4): a client's
// values are JSONB keyed by board_fields.key. Nothing about a particular
// business type is hardcoded here - the field list is whatever the
// generation engine produced, and this module only makes sure each value
// is the shape its field type promises, so the app can render and later
// phases (follow-up rules, import, quick capture) can rely on it.

export type FieldValue = string | number | boolean | null;
export type ClientFields = Record<string, FieldValue>;

export class FieldValidationError extends Error {
  constructor(
    message: string,
    public readonly key?: string,
  ) {
    super(message);
    this.name = "FieldValidationError";
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isBlank(raw: unknown): boolean {
  return raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
}

/** Coerces one raw value (from JSON) to the canonical value for its field. */
export function coerceFieldValue(field: BoardField, raw: unknown): FieldValue {
  if (isBlank(raw)) {
    return field.type === "checkbox" ? false : null;
  }

  switch (field.type) {
    case "text":
    case "long_text":
    case "phone": {
      if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
      if (typeof raw !== "string") throw new FieldValidationError(`${field.label} must be text`, field.key);
      return raw.trim();
    }
    case "email": {
      if (typeof raw !== "string") throw new FieldValidationError(`${field.label} must be text`, field.key);
      const value = raw.trim();
      if (!value.includes("@")) throw new FieldValidationError(`${field.label} doesn't look like an email address`, field.key);
      return value;
    }
    case "number": {
      const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/,/g, "").trim()) : NaN;
      if (!Number.isFinite(value)) throw new FieldValidationError(`${field.label} must be a number`, field.key);
      return value;
    }
    case "date": {
      if (typeof raw !== "string") throw new FieldValidationError(`${field.label} must be a date`, field.key);
      const value = raw.trim();
      if (ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))) return value;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new FieldValidationError(`${field.label} must be a date like 2026-03-14`, field.key);
      }
      return parsed.toISOString().slice(0, 10);
    }
    case "select": {
      if (typeof raw !== "string") throw new FieldValidationError(`${field.label} must be one of its options`, field.key);
      const value = raw.trim();
      const match = field.options.find((option) => option === value || option.toLowerCase() === value.toLowerCase());
      if (!match) {
        throw new FieldValidationError(`${field.label} must be one of: ${field.options.join(", ")}`, field.key);
      }
      return match;
    }
    case "checkbox": {
      if (typeof raw === "boolean") return raw;
      if (typeof raw === "string") {
        const lowered = raw.trim().toLowerCase();
        if (["true", "yes", "1", "on"].includes(lowered)) return true;
        if (["false", "no", "0", "off"].includes(lowered)) return false;
      }
      if (typeof raw === "number") return raw !== 0;
      throw new FieldValidationError(`${field.label} must be yes or no`, field.key);
    }
    default:
      return null;
  }
}

/**
 * Merges an incoming partial `fields` object over an existing record and
 * validates the result against the board's fields. Every board field ends up
 * present in the output (null when unset) so the stored JSON always mirrors
 * the schema. Returns the canonical values plus the mirrored `name`.
 */
export function validateClientFields(
  boardFields: BoardField[],
  input: Record<string, unknown>,
  existing: ClientFields = {},
): { fields: ClientFields; name: string } {
  const known = new Map(boardFields.map((field) => [field.key, field]));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) {
      throw new FieldValidationError(`"${key}" isn't a field on this board`, key);
    }
  }

  const fields: ClientFields = {};
  for (const field of boardFields) {
    const hasIncoming = Object.prototype.hasOwnProperty.call(input, field.key);
    const value = hasIncoming ? coerceFieldValue(field, input[field.key]) : (existing[field.key] ?? (field.type === "checkbox" ? false : null));
    if (field.required && (value === null || value === "")) {
      throw new FieldValidationError(`${field.label} is required`, field.key);
    }
    fields[field.key] = value;
  }

  const name = typeof fields.name === "string" ? fields.name.trim() : "";
  if (!name) {
    throw new FieldValidationError("A name is required", "name");
  }
  fields.name = name;

  return { fields, name };
}

/** Reads stored JSON back as ClientFields, tolerating anything odd in the column. */
export function readClientFields(json: unknown): ClientFields {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: ClientFields = {};
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    out[key] = typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
  }
  return out;
}
