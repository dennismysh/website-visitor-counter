import { getStore } from "@netlify/blobs";
import { anonymizeIp, drawSnowflake } from "./ip-anonymizer.mjs";

// Migrate data from the old format { count, ips: string[] } to the new format
// { count, visitors: { id, crystal }[] }.  Raw IPs are anonymized on the fly;
// already-anonymized IDs (digits only) are wrapped without a crystal string.
function migrateIfNeeded(data) {
  if (!data.visitors && Array.isArray(data.ips)) {
    const visitors = [];
    for (const entry of data.ips) {
      if (entry.includes(".") || entry.includes(":")) {
        // Old raw IP — run it through the full pipeline now
        const { anonymizedId, snowflake } = anonymizeIp(entry);
        visitors.push({ id: anonymizedId, crystal: drawSnowflake(snowflake) });
      } else {
        // Already an anonymized ID (no snowflake available)
        visitors.push({ id: entry, crystal: "" });
      }
    }
    return { count: data.count, visitors };
  }
  return data;
}

export default async (req) => {
  const store = getStore("visitors");
  let data = migrateIfNeeded(
    (await store.get("data", { type: "json" })) || { count: 0, visitors: [] }
  );

  const rawIp = req.headers.get("x-nf-client-connection-ip");

  if (rawIp) {
    const { anonymizedId, snowflake } = anonymizeIp(rawIp);
    const alreadySeen = data.visitors.some((v) => v.id === anonymizedId);

    if (!alreadySeen) {
      data.visitors.push({ id: anonymizedId, crystal: drawSnowflake(snowflake) });
      data.count++;
      await store.setJSON("data", data);
    }
  }

  return Response.json({ count: data.count });
};

export const config = {
  path: "/api/visit",
};
