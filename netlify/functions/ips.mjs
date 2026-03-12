import { getStore } from "@netlify/blobs";

export default async (request) => {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.ADMIN_API_TOKEN;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
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
