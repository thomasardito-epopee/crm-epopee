// netlify/functions/spaces.js
const { Pool } = require('pg');

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.NEON_DB_URL ||
  process.env.NETLIFY_DATABASE_URL;

const pool = new Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }, // Neon
});

// util
const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

exports.handler = async (event) => {
  // CORS simple si besoin
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'access-control-allow-origin': '*' } };
  }

  const client = await pool.connect();
  try {
    // Assure la table (idempotent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id BIGSERIAL PRIMARY KEY,
        building TEXT NOT NULL,
        floor    TEXT NOT NULL,
        geom     JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);

    // ----- READ (GET /api/spaces?building=&floor=)
    if (event.httpMethod === 'GET') {
      const { building, floor } = event.queryStringParameters || {};
      if (!building || !floor) return json(400, { error: 'building & floor requis' });

      const { rows } = await client.query(
        'SELECT id, geom FROM spaces WHERE building=$1 AND floor=$2 ORDER BY id ASC',
        [building, floor]
      );
      return json(200, { items: rows });
    }

    // ----- WRITE (POST /api/spaces/batch)
    if (event.httpMethod === 'POST') {
      // Auth simple par jeton
      const hdr = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
      const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : '';
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return json(401, { error: 'Unauthorized' });
      }

      let payload;
      try { payload = JSON.parse(event.body || '{}'); }
      catch { return json(400, { error: 'JSON invalide' }); }

      const { building, floor, features } = payload || {};
      if (!building || !floor || !Array.isArray(features)) {
        return json(400, { error: 'building, floor et features[] requis' });
      }

      await client.query('BEGIN');
      await client.query('DELETE FROM spaces WHERE building=$1 AND floor=$2', [building, floor]);
      for (const fe of features) {
        await client.query(
          'INSERT INTO spaces (building, floor, geom) VALUES ($1,$2,$3::jsonb)',
          [building, floor, JSON.stringify(fe)]
        );
      }
      await client.query('COMMIT');
      return json(200, { ok: true, count: features.length });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('Function error:', err);
    try { await client.query('ROLLBACK'); } catch {}
    // 500 (Netlify renverra 502 si rien n’est renvoyé)
    return json(500, { error: 'server_error', detail: String(err && err.message || err) });
  } finally {
    client.release();
  }
};
