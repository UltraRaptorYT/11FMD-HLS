import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE_NAME = "hls_admin_session";
export const ADMIN_SESSION_MAX_AGE = 12 * 60 * 60;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD?.trim() ?? "";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function isAdminPasswordConfigured() {
  return Boolean(getAdminPassword());
}

export function verifyAdminPassword(candidate: string) {
  const password = getAdminPassword();
  if (!password) return false;

  return timingSafeEqual(digest(candidate), digest(password));
}

export function createAdminSessionToken() {
  const password = getAdminPassword();
  if (!password) throw new Error("ADMIN_PASSWORD is not configured");

  return createHmac("sha256", password)
    .update("hls-admin-session-v1")
    .digest("base64url");
}

export function verifyAdminSessionToken(candidate?: string) {
  if (!candidate || !isAdminPasswordConfigured()) return false;

  return timingSafeEqual(digest(candidate), digest(createAdminSessionToken()));
}

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}
