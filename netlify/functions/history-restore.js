// netlify/functions/history-restore.js
import pkg from 'pg';
const { Client } = pkg;

import {
  getVersion, setVersion,
  getSnapshot, getLatestSnapshot, putSnapshot
} from "./_lib/history.js";

const CONN = process.env.NEON_DB_URL;

// Applique le snapshot sur la table courante "spaces" (sans passer par une API HTTP)
async function applyToCurrent(building, floor, features) {
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try {
    await client.query('BEGIN');

    // Remplace l'étage courant
    await client.query('DELETE FROM spaces WHERE building=$1 AND floor=$2', [building, floor]);

    const insertSQL = `
      INSERT INTO spaces (id, building, floor, geom, code, tenant, label)
      VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4::jsonb, $5, $6, $7)
    `;
    for (const f of (features || [])) {
      const ep = (f?.options?.ep) || {};
      await client.query(insertSQL, [
        f.id || null,
        building,
        floor,
        JSON.stringify(f.geom || f), // compat : certains snapshots stockent {type,latlngs|bounds,options}
        ep.code ?? null,
        ep.tenant ?? null,
        ep.label ?? null,
      ]);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const url = new URL(event.rawUrl);
    const building = url.searchParams.get("building") || "";
    const floor    = url.searchParams.get("floor") || "";
    const at       = url.searchParams.get("at") || "";   // optionnel

    if (!building || !floor) return { statusCode: 400, body: "missing building/floor" };

    const by      = event.headers["x-user"] || "admin";
    const noteHdr = event.headers["x-commit-note"] || "restore";
    const ifMatch = Number(event.headers["if-match-version"] || 0);

    // 1) Concurrence
    const cur = await getVersion(building, floor);
    if (cur.version_n !== ifMatch) {
      return { statusCode: 409, body: "version conflict" };
    }

    // 2) Trouver le snapshot à restaurer
    const snap = at
      ? await getSnapshot(building, floor, at)
      : await getLatestSnapshot(building, floor);

    if (!snap) return { statusCode: 404, body: "snapshot not found" };

    const features =
      Array.isArray(snap?.data?.features) ? snap.data.features
      : Array.isArray(snap?.data)         ? snap.data
      : [];

    // 3) Appliquer sur l'état courant (table "spaces")
    await applyToCurrent(building, floor, features);

    // 4) Créer un nouveau snapshot "post-restore"
    const next = cur.version_n + 1;
    const created_at = new Date().toISOString();
    const rec = {
      building, floor,
      version_n: next,
      created_at,
      created_by: by,
      note: `[restore] ${noteHdr} (source ${snap.created_at})`,
      size: Array.isArray(features) ? features.length : 0,
      data: { key: `${building}|${floor}`, features }
    };
    await putSnapshot(building, floor, rec);
    await setVersion(building, floor, next); // no-op logique (la version = max(version_n))

    return {
      statusCode: 200,
      body: JSON.stringify({ nextVersion: next })
    };
  } catch (e) {
    console.error("history-restore error:", e);
    return { statusCode: 500, body: `restore: ${e?.message || e}` };
  }
}
