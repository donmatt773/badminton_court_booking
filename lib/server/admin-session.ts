import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { graphQLEnv } from "@/lib/server/graphql/config/env";

const SESSION_COOKIE = "admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type AdminSessionPayload = {
  userId: string;
  role: "ADMIN" | "RECEPTIONIST";
  exp: number;
};

function sign(value: string): string {
  return createHmac("sha256", graphQLEnv.ADMIN_KEY).update(value).digest("base64url");
}

function encode(payload: AdminSessionPayload): string {
  const raw = JSON.stringify(payload);
  const body = Buffer.from(raw, "utf8").toString("base64url");
  const signature = sign(body);
  return `${body}.${signature}`;
}

function decode(token: string): AdminSessionPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = sign(body);
  const sigA = Buffer.from(signature);
  const sigB = Buffer.from(expected);

  if (sigA.length !== sigB.length || !timingSafeEqual(sigA, sigB)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AdminSessionPayload;
    if (!payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function createAdminSession(userId: string, role: "ADMIN" | "RECEPTIONIST"): Promise<void> {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const token = encode({ userId, role, exp });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getAdminSession(): Promise<AdminSessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  return decode(token);
}
