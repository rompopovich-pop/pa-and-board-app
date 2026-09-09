import { Prisma } from "@prisma/client";
import { prisma } from "../db";

/** Patches the `metadata` of every message that carries a given key/value -
 * e.g. the chat message showing a draft or a set of options as a
 * confirmation card - so the card reflects the new status on both channels. */
export async function patchMessageMetadata(
  userId: string,
  key: string,
  value: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const carriers = await prisma.message.findMany({
    where: { userId, metadata: { path: [key], equals: value } },
  });
  for (const carrier of carriers) {
    const metadata = (carrier.metadata ?? {}) as Prisma.InputJsonObject;
    await prisma.message.update({
      where: { id: carrier.id },
      data: { metadata: { ...metadata, ...patch } as Prisma.InputJsonObject },
    });
  }
}
