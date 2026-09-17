import { ActivityLog, Board, BoardField, Business, Client, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { BoardStatus, FollowUpRule, GeneratedBoard, generateBoardSchema } from "./boardGeneration";
import { readClientFields } from "./boardFields";

// Persistence for the Board data layer. One board per account in v1
// (business-board-spec.md section 7, "multi-board owners" - also what the
// free tier allows), so every lookup is "the board for this user".

export type BoardWithFields = Board & { fields: BoardField[]; business: Business; _count: { clients: number } };

const boardInclude = {
  fields: { orderBy: { position: "asc" as const } },
  business: true,
  _count: { select: { clients: true } },
} satisfies Prisma.BoardInclude;

export async function getBoardForUser(userId: string): Promise<BoardWithFields | null> {
  return prisma.board.findFirst({
    where: { business: { ownerId: userId } },
    include: boardInclude,
    orderBy: { createdAt: "desc" },
  });
}

export class BoardHasClientsError extends Error {
  constructor() {
    super("This board already has clients on it. Remove them first if you want to start over.");
    this.name = "BoardHasClientsError";
  }
}

/**
 * Generates a board from the description and stores it. Replacing an empty
 * board is allowed (the owner is still setting up); a board with clients on
 * it is never silently discarded.
 */
export async function createBoardForUser(userId: string, description: string): Promise<BoardWithFields> {
  const existing = await getBoardForUser(userId);
  if (existing && existing._count.clients > 0) {
    throw new BoardHasClientsError();
  }

  const generated = await generateBoardSchema(description);
  return persistGeneratedBoard(userId, description, generated, existing?.businessId);
}

export async function persistGeneratedBoard(
  userId: string,
  description: string,
  generated: GeneratedBoard,
  replaceBusinessId?: string,
): Promise<BoardWithFields> {
  return prisma.$transaction(async (tx) => {
    if (replaceBusinessId) {
      await tx.business.delete({ where: { id: replaceBusinessId } });
    }
    const business = await tx.business.create({
      data: {
        ownerId: userId,
        name: generated.businessName,
        description,
        businessType: generated.businessType,
        language: generated.language,
      },
    });
    const board = await tx.board.create({
      data: {
        businessId: business.id,
        name: generated.boardName,
        clientNoun: generated.clientNoun,
        clientNounPlural: generated.clientNounPlural,
        sessionNoun: generated.sessionNoun,
        statuses: generated.statuses as unknown as Prisma.InputJsonArray,
        followUpRule: generated.followUpRule as unknown as Prisma.InputJsonObject,
        summary: generated.summary,
        assumptions: generated.assumptions,
        fields: {
          create: generated.fields.map((field, position) => ({
            key: field.key,
            label: field.label,
            type: field.type,
            options: field.options,
            required: field.required,
            hint: field.hint,
            isSystem: field.isSystem,
            position,
          })),
        },
      },
      include: boardInclude,
    });
    return board;
  });
}

export function statusesOf(board: Board): BoardStatus[] {
  return Array.isArray(board.statuses) ? (board.statuses as unknown as BoardStatus[]) : [];
}

export function followUpRuleOf(board: Board): FollowUpRule | null {
  const rule = board.followUpRule;
  return rule && typeof rule === "object" && !Array.isArray(rule) ? (rule as unknown as FollowUpRule) : null;
}

export function defaultStatusKey(board: Board): string {
  const statuses = statusesOf(board);
  return (statuses.find((s) => s.tone === "new") ?? statuses[0])?.key ?? "new";
}

export function toPublicBoard(board: BoardWithFields) {
  return {
    id: board.id,
    name: board.name,
    clientNoun: board.clientNoun,
    clientNounPlural: board.clientNounPlural,
    sessionNoun: board.sessionNoun,
    statuses: statusesOf(board),
    followUpRule: followUpRuleOf(board),
    summary: board.summary,
    assumptions: board.assumptions,
    fields: board.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      options: field.options,
      required: field.required,
      hint: field.hint,
      isSystem: field.isSystem,
    })),
    business: {
      id: board.business.id,
      name: board.business.name,
      description: board.business.description,
      businessType: board.business.businessType,
      language: board.business.language,
    },
    clientCount: board._count.clients,
    createdAt: board.createdAt,
  };
}

export function toPublicClient(client: Client) {
  return {
    id: client.id,
    name: client.name,
    status: client.status,
    fields: readClientFields(client.fields),
    lastActivityAt: client.lastActivityAt,
    lastSessionAt: client.lastSessionAt,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export function toPublicActivity(activity: ActivityLog) {
  return {
    id: activity.id,
    kind: activity.kind,
    text: activity.text,
    createdAt: activity.createdAt,
  };
}
