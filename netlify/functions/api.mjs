// netlify/functions/api.mjs — Netlify Functions v2 (Response API)
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

// --- utilitaires réponse / CORS
const baseHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: baseHeaders });
const cors = (status = 200) => new Response("", { status, headers: baseHeaders });

const num = (v) => (v == null || isNaN(+v) ? null : +v);
const int = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const safeParse = async (req) => {
  try {
    const txt = await req.text();
    return JSON.parse(txt || "{}");
  } catch {
    return {};
  }
};

export default async (request) => {
  const url = new URL(request.url);
  const method = request.method;
  const parts = url.pathname.split("/").filter(Boolean);
  const iApi = parts.indexOf("api");
  const rest = iApi >= 0 ? parts.slice(iApi + 1) : [];

  // Pré-vol CORS
  if (method === "OPTIONS") return cors(200);

  try {
    // -------------------- /api/spaces --------------------
    if (rest[0] === "spaces") {
      // GET /api/spaces?building=A&floor=RDC
      if (method === "GET") {
        const building = url.searchParams.get("building");
        const floor = url.searchParams.get("floor");
        if (!building || !floor) {
          return json({ error: "building and floor are required" }, 400);
        }

        const rows = await sql`
          select id, building, floor, geom,
                 code, tenant, label, status, color,
                 area, posts, rent, pax_sit, pax_stand, day_price,
                 updated_at
          from spaces
          where building = ${building} and floor = ${floor}
          order by updated_at desc;
        `;
        return json({ items: rows }, 200);
      }

      // Toutes les écritures exigent le token admin
      const auth = request.headers.get("authorization") || "";
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token !== ADMIN_TOKEN) {
        return json({ error: "Unauthorized" }, 401);
      }

      // POST /api/spaces/batch  -> remplace toutes les formes d'un (building,floor)
      if (method === "POST" && rest[1] === "batch") {
        // Body attendu : { building, floor, features: [ { type, ... , options:{ep:{...}} } ] }
        const payload = await safeParse(request);
        const { building, floor, features } = payload || {};
        if (!building || !floor || !Array.isArray(features)) {
          return json({ error: "Invalid payload" }, 400);
        }

        await sql`begin`;
        try {
          // on supprime tout l'état précédent de l'étage
          await sql`delete from spaces where building=${building} and floor=${floor}`;

          // puis on insère l'état courant
          for (const fe of features) {
            const ep = fe?.options?.ep || {};
            await sql`
              insert into spaces
                (building, floor, geom,
                 code, tenant, label, status, color,
                 area, posts, rent, pax_sit, pax_stand, day_price)
              values
                (${building}, ${floor}, ${fe},
                 ${ep.code || null}, ${ep.tenant || null}, ${ep.label || null}, ${ep.status || null},
                 ${ep.color || null}, ${num(ep.area)}, ${int(ep.posts)}, ${num(ep.rent)},
                 ${int(ep.paxSit)}, ${int(ep.paxStand)}, ${num(ep.dayPrice)})
            `;
          }

          await sql`commit`;
          return json({ ok: true, count: features.length }, 200);
        } catch (e) {
          await sql`rollback`;
          throw e;
        }
      }

      // PUT /api/spaces/:id   -> met à jour un item
      if (method === "PUT" && rest[1]) {
        const id = rest[1];
        const payload = await safeParse(request);
        const ep = payload?.options?.ep || {};
        const geom = payload?.geom || null;

        const rows = await sql`
          update spaces set
            geom=${geom},
            code=${ep.code || null},
            tenant=${ep.tenant || null},
            label=${ep.label || null},
            status=${ep.status || null},
            color=${ep.color || null},
            area=${num(ep.area)},
            posts=${int(ep.posts)},
            rent=${num(ep.rent)},
            pax_sit=${int(ep.paxSit)},
            pax_stand=${int(ep.paxStand)},
            day_price=${num(ep.dayPrice)},
            updated_at=now()
          where id=${id}
          returning *;
        `;
        return json({ item: rows[0] || null }, 200);
      }

      // DELETE /api/spaces/:id -> supprime un item
      if (method === "DELETE" && rest[1]) {
        const id = rest[1];
        await sql`delete from spaces where id=${id}`;
        return json({ ok: true }, 200);
      }
    }

    // Route inconnue
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return json(
      { error: "Server error", detail: String(err?.message || err) },
      500
    );
  }
};
