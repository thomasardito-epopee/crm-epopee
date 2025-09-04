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
  const url = new URL(event.rawUrl);
  const qBuilding = url.searchParams.get('building');
  const qFloor = url.searchParams.get('floor');

  // ----- READ (public) -----
  if (event.httpMethod === 'GET') {
    if (!qBuilding || !qFloor) return err(400, 'Missing building/floor');
    const { rows } = await pool.query(
      `SELECT layout FROM floors WHERE building=$1 AND floor=$2`,
      [qBuilding, qFloor]
    );
    return ok({ layout: rows[0]?.layout ?? null });
  }

  // ----- SAVE (admin) -----
  if (event.httpMethod === 'POST') {
    const token = event.headers['x-admin-token']
      || (event.headers['authorization'] || '').replace(/^Bearer\s+/,'');
    if (!token || token !== process.env.ADMIN_TOKEN) return err(401, 'Unauthorized');

    const body = JSON.parse(event.body || '{}');
    const building = body.building ?? qBuilding;
    const floor = body.floor ?? qFloor;
    const layout = body.layout ?? body; // tolérant

    if (!building || !floor || !layout) return err(400, 'Missing data');

    await pool.query(
      `INSERT INTO floors (building,floor,layout)
       VALUES ($1,$2,$3)
       ON CONFLICT (building,floor)
       DO UPDATE SET layout=EXCLUDED.layout, updated_at=now()`,
      [building, floor, layout]
    );
    return ok({ saved: true });
  }

  if (event.httpMethod === 'OPTIONS') return ok({});
  return err(405, 'Method Not Allowed');
}
