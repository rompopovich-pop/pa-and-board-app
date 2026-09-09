/**
 * WhatsApp Cloud API identifies senders by a digits-only "wa_id" (no "+",
 * no separators). Normalizing every phone number to that shape on write
 * means a user's app-entered number ("+1 415-555-0100") and their WhatsApp
 * wa_id ("14155550100") match on lookup without special-casing either side.
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}
