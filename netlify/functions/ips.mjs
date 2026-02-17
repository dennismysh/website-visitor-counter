import { getStore } from "@netlify/blobs";

export default async () => {
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
