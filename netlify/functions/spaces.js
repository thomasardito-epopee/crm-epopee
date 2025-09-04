import { Pool } from 'pg';

const connectionString =
  process.env.NEON_DB_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

const json = (status, data) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(data),
});

export async function handler(event) {
  // (utile si un jour il y a un preflight)
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204 };

  // POST /api/spaces/batch
  if (event.httpMethod === 'POST' && /\/batch$/.test(event.path)) {
    let items = [];
    try {
      ({ items = [] } = JSON.parse(event.body || '{}'));
    } catch {
      return json(400, { error: 'Bad JSON body' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upsertSql = `
        INSERT INTO spaces
          (building, floor, code, label, status, rent, area, posts, color, geom)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (building, floor, code) DO UPDATE
        SET label  = EXCLUDED.label,
            status = EXCLUDED.status,
            rent   = EXCLUDED.rent,
            area   = EXCLUDED.area,
            posts  = EXCLUDED.posts,
            color  = EXCLUDED.color,
            geom   = EXCLUDED.geom
        RETURNING building, floor, code, updated_at, created_at;
      `;

      const results = [];

      for (const it of items) {
        const action = String(it.action || '').toLowerCase();
        // Supporte {action:'upsert', space:{...}} et {action:'upsert', ...}
        const s = it.space || it;

        if (action === 'upsert') {
          const params = [
            s.building,
            s.floor,
            s.code,
            s.label ?? null,
            s.status ?? null,
            Number(s.rent) || 0,
            Number(s.area) || 0,
            Number(s.posts) || 0,
            s.color ?? null,
            s.geom ?? null, // texte/JSON si pas de PostGIS
          ];
          const { rows } = await client.query(upsertSql, params);
          results.push(rows[0]);
        } else if (action === 'delete') {
          await client.query(
            'DELETE FROM spaces WHERE building=$1 AND floor=$2 AND code=$3',
            [s.building, s.floor, s.code]
          );
        }
      }

      await client.query('COMMIT');
      return json(200, { items: results });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch {}
      return json(500, { error: e.message });
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
       LIMIT 500`,
      [building, floor]
    );
    return json(200, { items: rows });
  }

  return json(405, { error: 'Method Not Allowed' });
}
