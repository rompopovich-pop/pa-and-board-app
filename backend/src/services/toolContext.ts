import { MessageChannel, Prisma } from "@prisma/client";

/** Per-turn state shared between the conversation engine and tool executors.
 * Tools can attach `metadata` to the assistant message the turn produces -
 * e.g. a pending email draft the app renders as a confirmation card. */
export interface TurnContext {
  userId: string;
  channel: MessageChannel;
  metadata?: Prisma.InputJsonValue;
}
