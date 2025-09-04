// netlify/functions/save-floor.js
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.NEON_DB_URL,
  ssl: { rejectUnauthorized: false }
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204 };

  // Auth simple
  const auth = event.headers.authorization?.replace(/^Bearer\s+/,'');
  if (process.env.ADMIN_TOKEN && auth !== process.env.ADMIN_TOKEN) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  if (event.httpMethod === 'POST') {
    const { building, floor, layout } = JSON.parse(event.body || '{}');
    if (!building || !floor) return { statusCode: 400, body: 'Missing building/floor' };

    const sql = `
      INSERT INTO floors (building, floor, layout, updated_at)
      VALUES ($1,$2,$3, now())
      ON CONFLICT (building, floor)
      DO UPDATE SET layout = EXCLUDED.layout, updated_at = now()
    `;
    await pool.query(sql, [building, floor, layout ?? {}]);
    return { statusCode: 200, body: 'ok' };
  }

  if (event.httpMethod === 'GET') {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get('building');
    const floor = url.searchParams.get('floor');
    const { rows } = await pool.query(
      'SELECT layout FROM floors WHERE building=$1 AND floor=$2',
      [building, floor]
    );
    return { statusCode: 200, body: JSON.stringify(rows[0]?.layout || {}) };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
}
