import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { handleIncomingMessage } from "../services/conversationEngine";

const router = Router();
router.use(requireAuth);

const HISTORY_LIMIT = 100;

function toPublicMessage(message: { id: string; role: string; channel: string; content: string; createdAt: Date }) {
  return {
    id: message.id,
    role: message.role,
    channel: message.channel,
    content: message.content,
    createdAt: message.createdAt,
  };
}

// Full conversation history for the "PA" mode chat UI - the same
// conversation WhatsApp reads/writes to, per pa-whatsapp-spec.md section 3.
router.get("/messages", async (req, res) => {
  const messages = await prisma.message.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
  });
  res.json({ messages: messages.map(toPublicMessage) });
});

const sendMessageSchema = z.object({
  text: z.string().trim().min(1, "Message can't be empty"),
});

router.post("/messages", async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  await handleIncomingMessage(req.userId as string, parsed.data.text, "app");

  // handleIncomingMessage persists both turns; re-read them so the response
  // carries the real rows (ids, timestamps) rather than reconstructing them.
  const [assistantMessage, userMessage] = await prisma.message.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  res.status(201).json({
    userMessage: toPublicMessage(userMessage),
    assistantMessage: toPublicMessage(assistantMessage),
  });
});

export default router;
