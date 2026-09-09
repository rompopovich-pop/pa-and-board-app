import { config } from "../config";

const GRAPH_API_VERSION = "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function credentials(): { accessToken: string; phoneNumberId: string } | null {
  const { accessToken, phoneNumberId } = config.whatsapp;
  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId };
}

async function postMessage(accessToken: string, phoneNumberId: string, payload: Record<string, unknown>) {
  const response = await fetch(`${GRAPH_BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`WhatsApp send to ${String(payload.to)} failed (${response.status}): ${body}`);
  }
}

/** Sends a plain-text WhatsApp message via the Cloud API. No-ops (with a
 * warning) if WhatsApp isn't configured, so local/app-only dev doesn't need
 * WhatsApp credentials. */
export async function sendWhatsAppMessage(toPhone: string, text: string): Promise<void> {
  const creds = credentials();
  if (!creds) {
    console.warn(`WhatsApp not configured; skipping send to ${toPhone}`);
    return;
  }
  await postMessage(creds.accessToken, creds.phoneNumberId, { to: toPhone, type: "text", text: { body: text } });
}

/** Uploads audio bytes as WhatsApp media and sends them as an audio message
 * (the "spoken voice reply" of spec section 5). */
export async function sendWhatsAppAudio(toPhone: string, audio: Buffer, mimeType: string): Promise<void> {
  const creds = credentials();
  if (!creds) {
    console.warn(`WhatsApp not configured; skipping audio send to ${toPhone}`);
    return;
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([audio], { type: mimeType }), `reply.${mimeType === "audio/mpeg" ? "mp3" : "bin"}`);

  const upload = await fetch(`${GRAPH_BASE}/${creds.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.accessToken}` },
    body: form,
  });
  if (!upload.ok) {
    const body = await upload.text().catch(() => "");
    console.error(`WhatsApp media upload failed (${upload.status}): ${body}`);
    return;
  }
  const { id } = (await upload.json()) as { id: string };

  await postMessage(creds.accessToken, creds.phoneNumberId, { to: toPhone, type: "audio", audio: { id } });
}

/** Downloads inbound media (e.g. a voice note) by the media id Meta sends in
 * the webhook payload. Two hops: resolve the id to a short-lived URL, then
 * fetch the bytes with the same bearer token. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ bytes: Buffer; mimeType: string }> {
  const creds = credentials();
  if (!creds) throw new Error("WhatsApp not configured");

  const headers = { Authorization: `Bearer ${creds.accessToken}` };

  const lookup = await fetch(`${GRAPH_BASE}/${mediaId}`, { headers });
  if (!lookup.ok) throw new Error(`WhatsApp media lookup failed (${lookup.status})`);
  const { url, mime_type } = (await lookup.json()) as { url: string; mime_type: string };

  const download = await fetch(url, { headers });
  if (!download.ok) throw new Error(`WhatsApp media download failed (${download.status})`);

  return { bytes: Buffer.from(await download.arrayBuffer()), mimeType: mime_type };
}
