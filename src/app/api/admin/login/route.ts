import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  createAdminSessionToken,
  isAdminPasswordConfigured,
  verifyAdminPassword,
} from "@/lib/admin-auth";

const attempts = new Map<string, { count: number; resetAt: number }>();
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export async function POST(request: NextRequest) {
  if (!isAdminPasswordConfigured()) {
    return NextResponse.json(
      { error: "ADMIN_PASSWORD is not configured in .env.local." },
      { status: 500 },
    );
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const key = forwarded?.trim() || "local";
  const now = Date.now();
  const previous = attempts.get(key);
  const entry =
    previous && previous.resetAt > now
      ? previous
      : { count: 0, resetAt: now + ATTEMPT_WINDOW };

  if (entry.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };
  if (!verifyAdminPassword(body.password ?? "")) {
    entry.count += 1;
    attempts.set(key, entry);
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  attempts.delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return response;
}
