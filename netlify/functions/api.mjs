// netlify/functions/api.mjs
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

export default async (event) => {
  const { httpMethod, path, queryStringParameters, body, headers } = event;
  const seg = (path || "").split("/").filter(Boolean);
  const i = seg.indexOf("api");
  const rest = seg.slice(i + 1); // e.g. ["spaces","batch"]

  try {
    // CORS (pré-vol)
    if (httpMethod === "OPTIONS") return cors(200);

    if (rest[0] === "spaces") {
      if (httpMethod === "GET") {
        // /api/spaces?building=A&floor=RDC
        const building = queryStringParameters?.building;
        const floor = queryStringParameters?.floor;
        if (!building || !floor) return json(400, { error: "building and floor are required" });

        const rows = await sql`
          select id, building, floor, geom, code, tenant, label, status, color,
                 area, posts, rent, pax_sit, pax_stand, day_price, updated_at
          from spaces
          where building = ${building} and floor = ${floor}
          order by updated_at desc;
        `;
        return json(200, { items: rows });
      }

      // --- Écriture : nécessite le jeton admin ---
      const token = headers['authorization']?.replace(/^Bearer\s+/i, '') || "";
      if (token !== ADMIN_TOKEN) return json(401, { error: "Unauthorized" });

      if (httpMethod === "POST" && rest[1] === "batch") {
        // Body: { building, floor, features:[{type,latlngs,options:{ep:...}}] }
        const payload = safeParse(body);
        const { building, floor, features } = payload || {};
        if (!building || !floor || !Array.isArray(features))
          return json(400, { error: "Invalid payload" });

        await sql`begin`;
        try {
          await sql`delete from spaces where building=${building} and floor=${floor}`;
          for (const fe of features) {
            const ep = fe?.options?.ep || {};
            await sql`
              insert into spaces
                (building, floor, geom, code, tenant, label, status, color,
                 area, posts, rent, pax_sit, pax_stand, day_price)
              values
                (${building}, ${floor}, ${fe},
                 ${ep.code||null}, ${ep.tenant||null}, ${ep.label||null}, ${ep.status||null}, ${ep.color||null},
                 ${num(ep.area)}, ${int(ep.posts)}, ${num(ep.rent)},
                 ${int(ep.paxSit)}, ${int(ep.paxStand)}, ${num(ep.dayPrice)})
            `;
          }
          await sql`commit`;
        } catch (e) {
          await sql`rollback`;
          throw e;
        }
        return json(200, { ok: true, count: features.length });
      }

      if (httpMethod === "PUT" && rest[1]) {
        const id = rest[1];
        const payload = safeParse(body);
        const ep = payload?.options?.ep || {};
        const geom = payload?.geom || null;

        const rows = await sql`
          update spaces set
            geom=${geom},
            code=${ep.code||null}, tenant=${ep.tenant||null}, label=${ep.label||null}, status=${ep.status||null},
            color=${ep.color||null}, area=${num(ep.area)}, posts=${int(ep.posts)}, rent=${num(ep.rent)},
            pax_sit=${int(ep.paxSit)}, pax_stand=${int(ep.paxStand)}, day_price=${num(ep.dayPrice)},
            updated_at=now()
          where id=${id}
          returning *;
        `;
        return json(200, { item: rows[0] || null });
      }

      if (httpMethod === "DELETE" && rest[1]) {
        const id = rest[1];
        await sql`delete from spaces where id=${id}`;
        return json(200, { ok: true });
      }
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return json(500, { error: "Server error", detail: String(err?.message || err) });
  }
};

// Helpers
const json = (status, data) => ({
  statusCode: status,
  headers: {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  },
  body: JSON.stringify(data)
});
const cors = (status) => ({
  statusCode: status,
  headers: {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  },
  body: ""
});

const num = (v) => (v==null || isNaN(+v) ? null : +v);
const int = (v) => (v==null || isNaN(parseInt(v)) ? null : parseInt(v));
const safeParse = (b) => { try { return JSON.parse(b||"{}"); } catch { return {}; } };
