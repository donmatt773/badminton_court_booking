"use client";

import Pusher from "pusher-js";

let pusherClient: Pusher | null | undefined;

export function getPusherClient(): Pusher | null {
  if (pusherClient !== undefined) {
    return pusherClient;
  }

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    pusherClient = null;
    return pusherClient;
  }

  pusherClient = new Pusher(key, {
    cluster,
    forceTLS: true,
  });

  return pusherClient;
}
