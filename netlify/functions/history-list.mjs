import { neon } from '@neondatabase/serverless';

// GET /api/history-list?building=A&floor=RDC
export async function handler(event) {
  const q = event.queryStringParameters || {};
  const b = q.building, f = q.floor;
  if (!b || !f) return { statusCode: 400, body: 'Missing building/floor' };

  try {
    const sql = neon(process.env.DATABASE_URL);

    // On liste du plus récent au plus ancien
    const rows = await sql/* sql */`
      SELECT building, floor, size, created_at, created_by, note
      FROM space_versions
      WHERE building = ${b} AND floor = ${f}
      ORDER BY created_at DESC
      LIMIT 200
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows)
    };
  } catch (e) {
    console.error('history-list error', e);
    return { statusCode: 500, body: 'Server error' };
  }
}
