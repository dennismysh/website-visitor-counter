import { getStore } from "@netlify/blobs";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function getClientIP(request) {
  return (
    request.headers.get("x-nf-client-connection-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

export default async (request) => {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.ADMIN_API_TOKEN;
  const clientIP = getClientIP(request);

  const rateLimitStore = getStore("rate-limits");
  const key = `auth-fail:${clientIP}`;
  const now = Date.now();

  // Check rate limit before validating token
  const record = await rateLimitStore.get(key, { type: "json" }).catch(() => null);
  if (record) {
    // Filter to only attempts within the window
    const recentAttempts = record.attempts.filter((t) => now - t < WINDOW_MS);
    if (recentAttempts.length >= MAX_ATTEMPTS) {
      return new Response(JSON.stringify({ error: "Too many failed attempts. Try again later." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    // Record failed attempt
    const existing = record
      ? record.attempts.filter((t) => now - t < WINDOW_MS)
      : [];
    existing.push(now);
    await rateLimitStore.setJSON(key, { attempts: existing });

    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Successful auth — clear any failed attempts for this IP
  if (record) {
    await rateLimitStore.delete(key);
  }

  const store = getStore("visitors");
  const data = (await store.get("data", { type: "json" })) || {
    count: 0,
    ips: [],
  };

  return Response.json({ count: data.count, ips: data.ips });
};

export const config = {
  path: "/api/ips",
};
