import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.NEON_DB_URL, // URL "pooled"
  ssl: { rejectUnauthorized: false }
});

export async function handler(event) {
  if (event.httpMethod === 'POST' && event.path.endsWith('/batch')) {
    const { items = [] } = JSON.parse(event.body || '{}');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const text = `
        INSERT INTO spaces
          (building, floor, code, label, status, rent, area, posts, color, geom)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (building, floor, code) DO UPDATE SET
          label  = EXCLUDED.label,
          status = EXCLUDED.status,
          rent   = EXCLUDED.rent,
          area   = EXCLUDED.area,
          posts  = EXCLUDED.posts,
          color  = EXCLUDED.color,
          geom   = EXCLUDED.geom
        RETURNING building,floor,code,updated_at,created_at;
      `;

      const results = [];
      for (const it of items) {
        if (it.action === 'upsert') {
          const s = it.space || {};
          const params = [
            s.building, s.floor, s.code,
            s.label ?? null, s.status ?? null,
            s.rent ?? 0, s.area ?? 0, s.posts ?? 0,
            s.color ?? null, s.geom ?? null // texte/JSON si pas de PostGIS
          ];
          const { rows } = await client.query(text, params);
          results.push(rows[0]);
        } else if (it.action === 'delete') {
          await client.query(
            'DELETE FROM spaces WHERE building=$1 AND floor=$2 AND code=$3',
            [it.building, it.floor, it.code]
          );
        }
      }
      await client.query('COMMIT');
      return { statusCode: 200, body: JSON.stringify({ items: results }) };
    } catch (e) {
      await client.query('ROLLBACK');
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    } finally {
      client.release();
    }
  }

  // GET /api/spaces?building=A&floor=RDJ
  if (event.httpMethod === 'GET') {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get('building');
    const floor = url.searchParams.get('floor');

    const { rows } = await pool.query(
      `SELECT code,label,status,rent,area,posts,color,geom,updated_at,created_at
       FROM spaces
       WHERE building=$1 AND floor=$2
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 200`,
      [building, floor]
    );
    return { statusCode: 200, body: JSON.stringify({ items: rows }) };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
}
