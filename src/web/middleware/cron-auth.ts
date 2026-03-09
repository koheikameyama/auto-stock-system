/**
 * cron-job.org 認証ミドルウェア
 *
 * Authorization: Bearer <CRON_SECRET> で認証。
 */

import type { Context, Next } from "hono";

export async function cronAuthMiddleware(c: Context, next: Next) {
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return c.json({ error: "CRON_SECRET is not configured" }, 500);
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7);
  if (token !== expected) {
    return c.json({ error: "Invalid token" }, 401);
  }

  await next();
}
