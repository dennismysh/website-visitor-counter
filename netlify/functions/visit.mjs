import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("visitors");
  const data = (await store.get("data", { type: "json" })) || {
    count: 0,
    ips: [],
  };

  const ip = req.headers.get("x-nf-client-connection-ip");

  if (ip && !data.ips.includes(ip)) {
    data.ips.push(ip);
    data.count++;
    await store.setJSON("data", data);
  }

  return Response.json({ count: data.count });
};

export const config = {
  path: "/api/visit",
};
