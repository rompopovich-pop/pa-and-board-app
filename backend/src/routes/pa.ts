import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Message } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { handleIncomingMessage } from "../services/conversationEngine";
import { isSttConfigured, transcribeAudio } from "../services/voice";
import { extensionForMime, mimeForPath, readAudio, saveAudio } from "../services/storage";
import { discardPendingDraft, sendPendingDraft } from "../services/googleTools";
import { confirmResearchOption, dismissResearchSession } from "../services/researchTools";

const router = Router();
router.use(requireAuth);

const HISTORY_LIMIT = 100;
const MAX_VOICE_NOTE_BYTES = 15 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_VOICE_NOTE_BYTES } });

function toPublicMessage(message: Message) {
  return {
    id: message.id,
    role: message.role,
    channel: message.channel,
    modality: message.modality,
    content: message.content,
    audioUrl: message.audioPath ? `/pa/messages/${message.id}/audio` : null,
    metadata: message.metadata,
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

  const { userMessage, assistantMessage } = await handleIncomingMessage(req.userId as string, parsed.data.text, "app");
  res.status(201).json({ userMessage: toPublicMessage(userMessage), assistantMessage: toPublicMessage(assistantMessage) });
});

// A voice note from the app: transcribe -> same engine -> spoken reply
// (spec section 5). The transcript is what lands in the conversation log.
router.post("/messages/voice", upload.single("audio"), async (req, res) => {
  if (!isSttConfigured()) {
    return res.status(503).json({ error: "Voice notes aren't set up on this server yet - please type for now." });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Missing audio file" });
  }

  const extension = extensionForMime(file.mimetype);
  const transcript = await transcribeAudio(file.buffer, file.mimetype, `voice.${extension}`);
  if (!transcript) {
    return res.status(400).json({ error: "I couldn't make out any words in that - want to try again?" });
  }

  const audioPath = await saveAudio(file.buffer, extension);
  const { userMessage, assistantMessage } = await handleIncomingMessage(req.userId as string, transcript, "app", {
    modality: "voice",
    audioPath,
    replyWithVoice: true,
  });
  res.status(201).json({ userMessage: toPublicMessage(userMessage), assistantMessage: toPublicMessage(assistantMessage) });
});

router.get("/messages/:id/audio", async (req, res) => {
  const message = await prisma.message.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!message?.audioPath) {
    return res.status(404).json({ error: "No audio for this message" });
  }
  const bytes = await readAudio(message.audioPath);
  res.setHeader("Content-Type", mimeForPath(message.audioPath));
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.send(bytes);
});

// The app's confirmation-card buttons for a pending email draft. WhatsApp
// users do the same thing conversationally ("send it") via the send_draft tool.
router.post("/drafts/:id/send", async (req, res) => {
  const userId = req.userId as string;
  const draft = await sendPendingDraft(userId, req.params.id).catch((error) => {
    console.error("Draft send failed:", error);
    return undefined;
  });
  if (draft === undefined) return res.status(502).json({ error: "Couldn't send through Gmail right now" });
  if (draft === null) return res.status(404).json({ error: "That draft is no longer pending" });

  const assistantMessage = await prisma.message.create({
    data: { userId, role: "assistant", channel: "app", content: `Done - sent to ${draft.to}.` },
  });
  res.json({ assistantMessage: toPublicMessage(assistantMessage) });
});

// The app's options card. The pick is recorded deterministically first (so
// nothing depends on the model), then the user's choice runs through the
// engine as a normal turn so the PA can hand over the link and offer a
// calendar event or reminder in the user's own language. WhatsApp users do
// the same by replying with a number (the confirm_option tool).
const confirmResearchSchema = z.object({
  optionId: z.string().min(1),
  text: z.string().trim().min(1).optional(),
});

router.post("/research/:id/confirm", async (req, res) => {
  const parsed = confirmResearchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const userId = req.userId as string;
  const result = await confirmResearchOption(userId, { sessionId: req.params.id, optionId: parsed.data.optionId });
  if (!result) return res.status(404).json({ error: "Those options are no longer open" });

  const text = parsed.data.text ?? `I'll go with option ${result.number}: ${result.option.title}`;
  const { userMessage, assistantMessage } = await handleIncomingMessage(userId, text, "app");
  res.json({ userMessage: toPublicMessage(userMessage), assistantMessage: toPublicMessage(assistantMessage) });
});

const dismissResearchSchema = z.object({ text: z.string().trim().min(1).optional() });

router.post("/research/:id/dismiss", async (req, res) => {
  const parsed = dismissResearchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
  }
  const userId = req.userId as string;
  const session = await dismissResearchSession(userId, req.params.id);
  if (!session) return res.status(404).json({ error: "Those options are no longer open" });

  const text = parsed.data.text ?? "None of these work for me.";
  const { userMessage, assistantMessage } = await handleIncomingMessage(userId, text, "app");
  res.json({ userMessage: toPublicMessage(userMessage), assistantMessage: toPublicMessage(assistantMessage) });
});

router.post("/drafts/:id/discard", async (req, res) => {
  const userId = req.userId as string;
  const draft = await discardPendingDraft(userId, req.params.id);
  if (!draft) return res.status(404).json({ error: "That draft is no longer pending" });

  const assistantMessage = await prisma.message.create({
    data: { userId, role: "assistant", channel: "app", content: "Okay, I've discarded that draft. Tell me what to change if you'd like another go." },
  });
  res.json({ assistantMessage: toPublicMessage(assistantMessage) });
});

export default router;
