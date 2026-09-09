import { Reminder, ReminderRecurrence, User } from "@prisma/client";
import { prisma } from "../db";
import { config } from "../config";
import { sendWhatsAppMessage } from "./whatsapp";

const REMINDER_PREFIX = "⏰ Reminder: ";

function nextDueDate(current: Date, recurrence: Exclude<ReminderRecurrence, "none">): Date {
  const next = new Date(current);
  switch (recurrence) {
    case "daily":
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case "weekly":
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case "monthly":
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
  }
  return next;
}

async function deliverReminder(reminder: Reminder & { user: User }): Promise<void> {
  const content = `${REMINDER_PREFIX}${reminder.text}`;

  // Always land in the shared conversation log, regardless of which channel
  // the reminder fires on - so both WhatsApp and the app reflect the same
  // conversation per user (pa-whatsapp-spec.md section 3).
  await prisma.message.create({
    data: { userId: reminder.userId, role: "assistant", channel: reminder.channel, content },
  });

  if (reminder.channel === "whatsapp" && reminder.user.phone) {
    await sendWhatsAppMessage(reminder.user.phone, content);
  }
}

async function processDueReminders(): Promise<void> {
  const due = await prisma.reminder.findMany({
    where: { status: "pending", dueAt: { lte: new Date() } },
    include: { user: true },
    take: 50,
  });

  for (const reminder of due) {
    // Atomic claim so a due reminder is never delivered twice, even if two
    // scheduler ticks overlap.
    const claimed = await prisma.reminder.updateMany({
      where: { id: reminder.id, status: "pending" },
      data: { status: "sent" },
    });
    if (claimed.count === 0) continue;

    try {
      await deliverReminder(reminder);
    } catch (error) {
      console.error(`Failed to deliver reminder ${reminder.id}:`, error);
    }

    if (reminder.recurrence !== "none") {
      await prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: "pending", dueAt: nextDueDate(reminder.dueAt, reminder.recurrence) },
      });
    }
  }
}

let pollHandle: NodeJS.Timeout | undefined;

export function startReminderScheduler(): void {
  if (pollHandle) return;
  pollHandle = setInterval(() => {
    processDueReminders().catch((error) => console.error("Reminder scheduler tick failed:", error));
  }, config.reminderPollIntervalMs);
  console.log(`Reminder scheduler started (polling every ${config.reminderPollIntervalMs}ms)`);
}

export function stopReminderScheduler(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = undefined;
  }
}
