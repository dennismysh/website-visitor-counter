import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("visitors");
  const data = (await store.get("data", { type: "json" })) || {
    count: 0,
    visitors: [],
  };

  // Support both old format ({ ips }) and new format ({ visitors })
  const visitors = data.visitors ?? data.ips?.map((id) => ({ id, crystal: "" })) ?? [];

  return Response.json({ count: data.count, visitors });
};

export const config = {
  path: "/api/ips",
};
