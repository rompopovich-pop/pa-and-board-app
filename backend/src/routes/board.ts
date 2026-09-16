import { NextFunction, Request, Response, Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import {
  BoardHasClientsError,
  createBoardForUser,
  defaultStatusKey,
  getBoardForUser,
  statusesOf,
  toPublicActivity,
  toPublicBoard,
  toPublicClient,
} from "../services/boardService";
import { BoardGenerationError } from "../services/boardGeneration";
import { FieldValidationError, readClientFields, validateClientFields } from "../services/boardFields";

const router = Router();
router.use(requireAuth);

// Express 4 doesn't forward rejected promises to the error handler.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const wrap = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res).catch(next);
};

const MAX_CLIENTS_LISTED = 500;

// The owner's board (one per account in v1), or null before setup.
router.get(
  "/",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    res.json({ board: board ? toPublicBoard(board) : null });
  }),
);

const generateSchema = z.object({
  description: z
    .string()
    .trim()
    .min(10, "Tell me a little more about your business - a sentence or two is plenty.")
    .max(4000, "That's more than I can take in at once - could you shorten it a little?"),
});

// The "describe your business" box: free text in, a working board out.
router.post(
  "/generate",
  wrap(async (req, res) => {
    const parsed = generateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    }
    try {
      const board = await createBoardForUser(req.userId as string, parsed.data.description);
      res.status(201).json({ board: toPublicBoard(board) });
    } catch (error) {
      if (error instanceof BoardHasClientsError) return res.status(409).json({ error: error.message });
      if (error instanceof BoardGenerationError) return res.status(502).json({ error: error.message });
      throw error;
    }
  }),
);

const listSchema = z.object({
  status: z.string().trim().min(1).optional(),
  q: z.string().trim().min(1).optional(),
});

router.get(
  "/clients",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    if (!board) return res.status(404).json({ error: "No board yet" });
    const query = listSchema.safeParse(req.query);
    if (!query.success) return res.status(400).json({ error: "Invalid query" });

    const clients = await prisma.client.findMany({
      where: {
        boardId: board.id,
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.q ? { name: { contains: query.data.q, mode: "insensitive" } } : {}),
      },
      orderBy: [{ name: "asc" }],
      take: MAX_CLIENTS_LISTED,
    });
    res.json({ clients: clients.map(toPublicClient) });
  }),
);

const fieldsSchema = z.record(z.unknown());
const createClientSchema = z.object({
  status: z.string().trim().min(1).optional(),
  fields: fieldsSchema,
});

function resolveStatus(statuses: ReturnType<typeof statusesOf>, key: string | undefined, fallback: string) {
  if (!key) return fallback;
  return statuses.some((s) => s.key === key) ? key : null;
}

router.post(
  "/clients",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    if (!board) return res.status(404).json({ error: "No board yet" });
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

    const status = resolveStatus(statusesOf(board), parsed.data.status, defaultStatusKey(board));
    if (!status) return res.status(400).json({ error: "That status isn't on this board", key: "status" });

    let validated;
    try {
      validated = validateClientFields(board.fields, parsed.data.fields);
    } catch (error) {
      if (error instanceof FieldValidationError) return res.status(400).json({ error: error.message, key: error.key });
      throw error;
    }

    const client = await prisma.client.create({
      data: {
        boardId: board.id,
        name: validated.name,
        status,
        fields: validated.fields as Prisma.InputJsonObject,
        activities: { create: { kind: "created", text: "" } },
      },
    });
    res.status(201).json({ client: toPublicClient(client) });
  }),
);

router.get(
  "/clients/:id",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    if (!board) return res.status(404).json({ error: "No board yet" });
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, boardId: board.id },
      include: { activities: { orderBy: { createdAt: "desc" } } },
    });
    if (!client) return res.status(404).json({ error: "That record isn't on your board" });
    res.json({ client: toPublicClient(client), activities: client.activities.map(toPublicActivity) });
  }),
);

const updateClientSchema = z.object({
  status: z.string().trim().min(1).optional(),
  fields: fieldsSchema.optional(),
});

router.patch(
  "/clients/:id",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    if (!board) return res.status(404).json({ error: "No board yet" });
    const parsed = updateClientSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

    const existing = await prisma.client.findFirst({ where: { id: req.params.id, boardId: board.id } });
    if (!existing) return res.status(404).json({ error: "That record isn't on your board" });

    const statuses = statusesOf(board);
    const status = resolveStatus(statuses, parsed.data.status, existing.status);
    if (!status) return res.status(400).json({ error: "That status isn't on this board", key: "status" });

    let validated: { fields: Prisma.InputJsonObject; name: string } | undefined;
    if (parsed.data.fields) {
      try {
        const result = validateClientFields(board.fields, parsed.data.fields, readClientFields(existing.fields));
        validated = { fields: result.fields as Prisma.InputJsonObject, name: result.name };
      } catch (error) {
        if (error instanceof FieldValidationError) return res.status(400).json({ error: error.message, key: error.key });
        throw error;
      }
    }

    const statusChanged = status !== existing.status;
    const labelOf = (key: string) => statuses.find((s) => s.key === key)?.label ?? key;
    const now = new Date();
    const client = await prisma.client.update({
      where: { id: existing.id },
      data: {
        status,
        ...(validated ? { fields: validated.fields, name: validated.name } : {}),
        ...(statusChanged
          ? {
              lastActivityAt: now,
              activities: { create: { kind: "status_change", text: `${labelOf(existing.status)} → ${labelOf(status)}`, createdAt: now } },
            }
          : {}),
      },
    });
    res.json({ client: toPublicClient(client) });
  }),
);

router.delete(
  "/clients/:id",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    if (!board) return res.status(404).json({ error: "No board yet" });
    const deleted = await prisma.client.deleteMany({ where: { id: req.params.id, boardId: board.id } });
    if (deleted.count === 0) return res.status(404).json({ error: "That record isn't on your board" });
    res.status(204).end();
  }),
);

const activitySchema = z.object({
  kind: z.enum(["note", "session"]),
  text: z.string().trim().max(4000),
});

// The history log: a note, or a logged session (which also stamps
// last_session_at - what the Phase 2 follow-up rule will measure from).
router.post(
  "/clients/:id/activities",
  wrap(async (req, res) => {
    const board = await getBoardForUser(req.userId as string);
    if (!board) return res.status(404).json({ error: "No board yet" });
    const parsed = activitySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    if (parsed.data.kind === "note" && !parsed.data.text) return res.status(400).json({ error: "Write something first" });

    const existing = await prisma.client.findFirst({ where: { id: req.params.id, boardId: board.id } });
    if (!existing) return res.status(404).json({ error: "That record isn't on your board" });

    const now = new Date();
    const activity = await prisma.activityLog.create({
      data: { clientId: existing.id, kind: parsed.data.kind, text: parsed.data.text, createdAt: now },
    });
    const client = await prisma.client.update({
      where: { id: existing.id },
      data: { lastActivityAt: now, ...(parsed.data.kind === "session" ? { lastSessionAt: now } : {}) },
    });
    res.status(201).json({ activity: toPublicActivity(activity), client: toPublicClient(client) });
  }),
);

export default router;
