import { getStore } from "@netlify/blobs";

const MAX_STORED_IPS = 10000;

export default async (req) => {
  const store = getStore("visitors");
  const data = (await store.get("data", { type: "json" })) || {
    count: 0,
    ips: [],
  };

  const ip = req.headers.get("x-nf-client-connection-ip");

  if (ip && !data.ips.includes(ip)) {
    data.count++;
    if (data.ips.length < MAX_STORED_IPS) {
      data.ips.push(ip);
    }
    await store.setJSON("data", data);
  }

  return Response.json({ count: data.count });
};

export const config = {
  path: "/api/visit",
};
