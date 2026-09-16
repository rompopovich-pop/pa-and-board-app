import type { TextStyle } from "react-native";
import type { TFunction } from "i18next";
import type { Board, BoardField, BoardStatus, FieldValue, StatusTone } from "../../api/board";
import type { Theme } from "../../theme";

// Small helpers for rendering generated board content. Labels, statuses
// and the summary are in whatever language the owner described their
// business in (design-ux-localization-spec.md section 5), which need not
// match the app's UI language - so generated text carries its own writing
// direction, while everything else follows the UI locale.

export function generatedTextStyle(language: string): TextStyle {
  return { writingDirection: language === "he" ? "rtl" : "ltr" };
}

export function localeFor(uiLanguage: string): string {
  return uiLanguage.startsWith("he") ? "he-IL" : "en-GB";
}

export function statusColor(colors: Theme["colors"], tone: StatusTone): string {
  switch (tone) {
    case "new":
      return colors.statusNew;
    case "active":
      return colors.statusActive;
    case "needs_follow_up":
      return colors.statusNeedsFollowUp;
    default:
      return colors.statusInactive;
  }
}

export function findStatus(board: Board, key: string): BoardStatus | undefined {
  return board.statuses.find((status) => status.key === key);
}

export function formatDate(isoDate: string, uiLanguage: string): string {
  // "YYYY-MM-DD" parses as UTC midnight; anchor it to local noon so the
  // calendar day never shifts west of Greenwich.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? new Date(`${isoDate}T12:00:00`) : new Date(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(localeFor(uiLanguage), { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string, uiLanguage: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(localeFor(uiLanguage), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFieldValue(field: BoardField, value: FieldValue, t: TFunction, uiLanguage: string): string {
  if (value === null || value === undefined || value === "") return "";
  switch (field.type) {
    case "checkbox":
      return value ? t("board.yes") : t("board.no");
    case "date":
      return formatDate(String(value), uiLanguage);
    case "number":
      return typeof value === "number" ? value.toLocaleString(localeFor(uiLanguage)) : String(value);
    default:
      return String(value);
  }
}

/** The fields worth showing on a list row: the first two non-system ones with a value. */
export function highlightFields(board: Board, fields: Record<string, FieldValue>, limit = 2): BoardField[] {
  return board.fields
    .filter((field) => !field.isSystem && fields[field.key] !== null && fields[field.key] !== "" && fields[field.key] !== false)
    .slice(0, limit);
}
