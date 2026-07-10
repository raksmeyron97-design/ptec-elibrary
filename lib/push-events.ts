import { broadcastAllPush } from "@/lib/push";
import { safeInternalUrl, type PushPayload } from "@/lib/push-utils";

type NewBookEvent = {
  id: string;
  title: string;
  slug: string;
};

type AnnouncementEvent = {
  id: string;
  title: string;
  body?: string | null;
  url?: string | null;
};

function logPushDelivery(event: string, result: { sent: number; expired: number; failed: number }) {
  console.info(
    JSON.stringify({
      evt: "push_delivery",
      event,
      sent: result.sent,
      expired: result.expired,
      failed: result.failed,
    }),
  );
}

async function broadcastEvent(eventName: string, payload: PushPayload) {
  try {
    const result = await broadcastAllPush(payload);
    logPushDelivery(eventName, result);
  } catch (error) {
    console.error(
      JSON.stringify({
        evt: "push_delivery",
        event: eventName,
        code: "PUSH_SEND_FAILED",
        detail: error instanceof Error ? error.message : "unknown",
      }),
    );
  }
}

export async function notifyNewBookPublished(book: NewBookEvent): Promise<void> {
  const eventId = `book:${book.id}:published`;
  await broadcastEvent(eventId, {
    type: "NEW_BOOK",
    title: "New book available",
    body: book.title,
    url: `/books/${book.slug}`,
    tag: eventId,
    entityId: book.id,
    eventId,
  });
}

export async function notifyAnnouncementPublished(announcement: AnnouncementEvent): Promise<void> {
  const eventId = `announcement:${announcement.id}:published`;
  await broadcastEvent(eventId, {
    type: "NEW_ANNOUNCEMENT",
    title: announcement.title,
    body: announcement.body?.trim() || "A new announcement has been published by PTEC Library.",
    url: safeInternalUrl(announcement.url),
    tag: eventId,
    entityId: announcement.id,
    eventId,
  });
}
