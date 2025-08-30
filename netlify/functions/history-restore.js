const { Client } = require('pg');

// POST /api/history-restore?building=A&floor=RDC[&at=...]
// Headers requis : If-Match-Version: <n>
// Optionnel : X-Commit-Note, X-User
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const q = event.queryStringParameters || {};
  const b = q.building, f = q.floor, at = q.at || null;
  if (!b || !f) return { statusCode: 400, body: 'Missing building/floor' };

  const ifMatch = parseInt(event.headers['if-match-version'] || 'NaN', 10);
  if (!Number.isFinite(ifMatch)) {
    return { statusCode: 400, body: 'Missing If-Match-Version header' };
  }

  const note = event.headers['x-commit-note'] || '[restore]';
  const createdBy = event.headers['x-user'] || 'admin';

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('BEGIN');

    // 1) Verrou optimiste : n'incrémente que si la version correspond
    const up = await client.query(
      `UPDATE floor_state
         SET version_n = version_n + 1
       WHERE building = $1 AND floor = $2 AND version_n = $3`,
      [b, f, ifMatch]
    );
    if (up.rowCount !== 1) {
      await client.query('ROLLBACK');
      return { statusCode: 409, body: 'Conflict: version has changed' };
    }

    // 2) Récupération du snapshot à restaurer
    const snap = at
      ? await client.query(
          `SELECT data, created_at
             FROM space_versions
            WHERE building=$1 AND floor=$2 AND created_at=$3
            LIMIT 1`,
          [b, f, at]
        )
      : await client.query(
          `SELECT data, created_at
             FROM space_versions
            WHERE building=$1 AND floor=$2
            ORDER BY created_at DESC
            LIMIT 1`,
          [b, f]
        );

    if (snap.rowCount === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 404, body: 'Snapshot not found' };
    }

    const features = snap.rows[0].data || [];

    // 3) On remplace l'étage courant par les features du snapshot
    await client.query(
      `DELETE FROM spaces WHERE building=$1 AND floor=$2`,
      [b, f]
    );

    const insertSQL = `
      INSERT INTO spaces (id, building, floor, geom, code, tenant, label)
      VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4::jsonb, $5, $6, $7)
    `;
    for (const x of features) {
      await client.query(insertSQL, [
        x.id ?? null,
        b,
        f,
        JSON.stringify(x.geom ?? {}),
        x.code ?? null,
        x.tenant ?? null,
        x.label ?? null
      ]);
    }

    // 4) On crée un snapshot "restore" (optionnel mais recommandé)
    await client.query(
      `INSERT INTO space_versions (building, floor, data, created_by, note)
       SELECT $1, $2, $3::jsonb[], $4, $5`,
      [b, f, JSON.stringify(features), createdBy, note]
    );

    // 5) Version après restore
    const v = await client.query(
      `SELECT version_n FROM floor_state WHERE building=$1 AND floor=$2`,
      [b, f]
    );

    await client.query('COMMIT');

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        restoredFrom: snap.rows[0].created_at,
        nextVersion: v.rows[0]?.version_n ?? null
      })
    };
  } catch (e) {
    console.error('history-restore error', e);
    try { await client.query('ROLLBACK'); } catch {}
    return { statusCode: 500, body: 'Server error' };
  } finally {
    await client.end();
  }
};
