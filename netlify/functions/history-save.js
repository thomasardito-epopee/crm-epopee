import { Client } from 'pg';

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { building, floor, features, note } = JSON.parse(event.body);

    // Connexion Neon (variable d'env NEON_DB_URL à définir dans Netlify)
    const client = new Client({ connectionString: process.env.NEON_DB_URL });
    await client.connect();

    // Lire la version courante
    const res = await client.query(
      `select coalesce(max(version_n),0) as v from floor_history where building=$1 and floor=$2`,
      [building, floor]
    );
    const currentVersion = res.rows[0].v;

    // Vérifier la version si If-Match-Version est envoyé
    const ifMatch = event.headers["if-match-version"];
    if (ifMatch && Number(ifMatch) !== currentVersion) {
      await client.end();
      return { statusCode: 409, body: "Version conflict" };
    }

    const nextVersion = currentVersion + 1;

    // Insérer le snapshot
    await client.query(
      `insert into floor_history(building, floor, version_n, created_at, created_by, note, size, data)
       values ($1,$2,$3,now(),$4,$5,$6,$7)`,
      [building, floor, nextVersion, event.headers["x-user"] || "system", note || null, features.length, JSON.stringify(features)]
    );

    await client.end();
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, nextVersion })
    };

  } catch (err) {
    console.error("history-save error", err);
    return { statusCode: 500, body: "Server error: " + err.message };
  }
}
