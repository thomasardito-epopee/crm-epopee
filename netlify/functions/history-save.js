// netlify/functions/history-save.js
import { Client } from 'pg';
import { putSnapshot } from './_lib/history.js';

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { building, floor, features, note } = JSON.parse(event.body || "{}");
    if (!building || !floor || !features) {
      return { statusCode: 400, body: "missing building/floor/features" };
    }

    const created_by = event.headers["x-user"] || "system";

    // 1) Connexion Neon
    const client = new Client({ connectionString: process.env.NEON_DB_URL });
    await client.connect();

    // 2) Lire version courante
    const res = await client.query(
      `select coalesce(max(version_n),0) as v
         from floor_history
        where building=$1 and floor=$2`,
      [building, floor]
    );
    const currentVersion = Number(res.rows?.[0]?.v ?? 0);

    // 3) Conflit optimiste (If-Match-Version)
    const ifMatch = event.headers["if-match-version"];
    if (ifMatch && Number(ifMatch) !== currentVersion) {
      await client.end();
      return { statusCode: 409, body: "Version conflict" };
    }

    const nextVersion = currentVersion + 1;
    const created_at = new Date().toISOString();

    // 4) Insérer dans la table historique (Neon)
    await client.query(
      `insert into floor_history
         (building, floor, version_n, created_at, created_by, note, size, data)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        building,
        floor,
        nextVersion,
        created_at,
        created_by,
        note || null,
        Array.isArray(features) ? features.length : 0,
        JSON.stringify(features),
      ]
    );

    await client.end();

    // 5) Écrire aussi le snapshot dans Netlify Blobs (clé = building|floor|created_at)
    await putSnapshot(building, floor, {
      building,
      floor,
      version_n: nextVersion,
      created_at,
      created_by,
      note: note || "",
      size: Array.isArray(features) ? features.length : 0,
      data: { key: `${building}|${floor}`, features },
    });

    // 6) Réponse
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, nextVersion, created_at }),
    };
  } catch (err) {
    console.error("history-save error", err);
    return { statusCode: 500, body: "Server error: " + err.message };
  }
}
