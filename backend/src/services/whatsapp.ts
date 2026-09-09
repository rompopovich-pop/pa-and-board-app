import { config } from "../config";

const GRAPH_API_VERSION = "v21.0";

/** Sends a plain-text WhatsApp message via the Cloud API. No-ops (with a
 * warning) if WhatsApp isn't configured, so local/app-only dev doesn't need
 * WhatsApp credentials. */
export async function sendWhatsAppMessage(toPhone: string, text: string): Promise<void> {
  const { accessToken, phoneNumberId } = config.whatsapp;
  if (!accessToken || !phoneNumberId) {
    console.warn(`WhatsApp not configured; skipping send to ${toPhone}`);
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: { body: text },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`WhatsApp send to ${toPhone} failed (${response.status}): ${body}`);
  }
}
