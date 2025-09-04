// netlify/functions/save-floor.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.NEON_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const ok  = (data) => ({ statusCode: 200, headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(data) });
const err = (c, m)   => ({ statusCode: c, body: m });

export async function handler(event) {
  const url = new URL(event.rawUrl);
  const building = url.searchParams.get('building');
  const floor    = url.searchParams.get('floor');
  if (!building || !floor) return err(400, 'Missing building/floor');

  if (event.httpMethod === 'GET') {
    const { rows } = await pool.query(
      'SELECT layout FROM floor_layouts WHERE building=$1 AND floor=$2',
      [building, floor],
    );
    return ok({ layout: rows[0]?.layout ?? {} });
  }

  if (event.httpMethod === 'POST') {
    const token =
      event.headers['x-admin-token'] ||
      (event.headers['authorization'] || '').replace(/^Bearer\s+/,'');
    if (!token || token !== process.env.ADMIN_TOKEN) return err(401, 'Unauthorized');

    const { layout = {} } = JSON.parse(event.body || '{}');
    await pool.query(
      `INSERT INTO floor_layouts (building,floor,layout)
       VALUES ($1,$2,$3)
       ON CONFLICT (building,floor) DO UPDATE
       SET layout=EXCLUDED.layout, updated_at=now()`,
      [building, floor, layout],
    );
    return ok({ saved: true });
  }

  if (event.httpMethod === 'OPTIONS') return ok({});
  return err(405, 'Method Not Allowed');
}
