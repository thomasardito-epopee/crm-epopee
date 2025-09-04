import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.NEON_DB_URL,
  ssl: { rejectUnauthorized: false }
});

const ok = (data) => ({
  statusCode: 200,
  headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  body: JSON.stringify(data)
});
const err = (code, msg) => ({ statusCode: code, body: msg });

export async function handler(event) {
  // ----- LIST (public) -----
  if (event.httpMethod === 'GET') {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get('building');
    const floor = url.searchParams.get('floor');
    if (!building || !floor) return err(400, 'Missing building/floor');

    const { rows } = await pool.query(
      `SELECT code,label,status,rent,area,posts,color,geom,updated_at,created_at
       FROM spaces
       WHERE building=$1 AND floor=$2
       ORDER BY updated_at DESC NULLS LAST, created_at DESC
       LIMIT 200`,
      [building, floor]
    );
    return ok({ items: rows });
  }

  // ----- UPSERT/DELETE BATCH (admin) -----
  if (event.httpMethod === 'POST' && event.path.endsWith('/batch')) {
    const token = event.headers['x-admin-token']
      || (event.headers['authorization'] || '').replace(/^Bearer\s+/,'');
    if (!token || token !== process.env.ADMIN_TOKEN) return err(401, 'Unauthorized');

    const { items = [] } = JSON.parse(event.body || '{}');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const text = `
        INSERT INTO spaces (building,floor,code,label,status,rent,area,posts,color,geom)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (building,floor,code) DO UPDATE SET
          label=EXCLUDED.label, status=EXCLUDED.status, rent=EXCLUDED.rent,
          area=EXCLUDED.area, posts=EXCLUDED.posts, color=EXCLUDED.color,
          geom=EXCLUDED.geom, updated_at=now()
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
            s.color ?? null, s.geom ?? null
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
      return ok({ items: results });
    } catch (e) {
      await client.query('ROLLBACK');
      return err(500, e.message);
    } finally {
      client.release();
    }
  }

  if (event.httpMethod === 'OPTIONS') return ok({}); // préflight éventuel
  return err(405, 'Method Not Allowed');
}
