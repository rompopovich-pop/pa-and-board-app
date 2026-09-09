import crypto from "crypto";
import { Router } from "express";
import { config } from "../config";
import { prisma } from "../db";
import { normalizePhone } from "../utils/phone";
import { handleIncomingMessage } from "../services/conversationEngine";
import { sendWhatsAppMessage } from "../services/whatsapp";

const router = Router();

// Meta's webhook verification handshake - see pa-whatsapp-spec.md section 4.2.
// Meta calls this once when you register the webhook URL in the App Dashboard.
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && config.whatsapp.verifyToken && token === config.whatsapp.verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

function isValidSignature(req: import("express").Request): boolean {
  const { appSecret } = config.whatsapp;
  if (!appSecret) {
    // No secret configured (e.g. local dev) - can't verify, so don't block.
    return true;
  }
  const header = req.get("X-Hub-Signature-256");
  if (!header || !req.rawBody) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex");

  const headerBuf = Buffer.from(header);
  const expectedBuf = Buffer.from(expected);
  return headerBuf.length === expectedBuf.length && crypto.timingSafeEqual(headerBuf, expectedBuf);
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

// Incoming WhatsApp messages. Meta also posts delivery/read "statuses"
// payloads to this same URL - those carry no `messages` array and are
// silently ignored below.
router.post("/", async (req, res) => {
  if (!isValidSignature(req)) {
    return res.sendStatus(401);
  }

  // Ack immediately - webhook processing shouldn't block Meta's retry logic,
  // and a slow/failed downstream step shouldn't surface as a webhook error.
  res.sendStatus(200);

  try {
    const payload = req.body as WhatsAppWebhookPayload;
    const messages = payload.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

    for (const message of messages) {
      if (message.type !== "text" || !message.text?.body) continue;

      const phone = normalizePhone(message.from);

      // Click-to-chat onboarding: an unknown phone number becomes a new
      // user record with no email/password yet - pa-whatsapp-spec.md
      // section 2, "Via WhatsApp".
      const user = await prisma.user.upsert({
        where: { phone },
        update: {},
        create: { phone },
      });

      const reply = await handleIncomingMessage(user.id, message.text.body, "whatsapp");
      await sendWhatsAppMessage(phone, reply);
    }
  } catch (error) {
    console.error("Error processing WhatsApp webhook:", error);
  }
});

export default router;
