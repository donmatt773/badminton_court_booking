import Pusher from "pusher";
import { REALTIME_CHANNELS, REALTIME_EVENTS } from "@/lib/shared/realtime-events";

let pusherServer: Pusher | null | undefined;

function getPusherServer(): Pusher | null {
  if (pusherServer !== undefined) {
    return pusherServer;
  }

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    pusherServer = null;
    return pusherServer;
  }

  pusherServer = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherServer;
}

async function trigger(channel: string, event: string, payload: Record<string, unknown>): Promise<void> {
  const server = getPusherServer();
  if (!server) {
    return;
  }

  try {
    await server.trigger(channel, event, payload);
  } catch (error) {
    console.warn("Failed to publish Pusher event", error);
  }
}

export async function triggerBookingsUpdated(payload: Record<string, unknown> = {}): Promise<void> {
  await trigger(REALTIME_CHANNELS.bookings, REALTIME_EVENTS.updated, {
    ts: Date.now(),
    ...payload,
  });
}

export async function triggerCourtsUpdated(payload: Record<string, unknown> = {}): Promise<void> {
  await trigger(REALTIME_CHANNELS.courts, REALTIME_EVENTS.updated, {
    ts: Date.now(),
    ...payload,
  });
}

export async function triggerBlockedSlotsUpdated(payload: Record<string, unknown> = {}): Promise<void> {
  await trigger(REALTIME_CHANNELS.blockedSlots, REALTIME_EVENTS.updated, {
    ts: Date.now(),
    ...payload,
  });
}
