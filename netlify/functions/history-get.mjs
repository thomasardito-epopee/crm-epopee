import { neon } from '@neondatabase/serverless';

// GET /api/history-get?building=A&floor=RDC[&at=2025-08-30T10:01:22.664Z]
export async function handler(event) {
  const q = event.queryStringParameters || {};
  const b = q.building, f = q.floor, at = q.at;
  if (!b || !f) return { statusCode: 400, body: 'Missing building/floor' };

  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = at
      ? await sql/* sql */`
          SELECT building, floor, size, created_at, created_by, note, data
          FROM space_versions
          WHERE building=${b} AND floor=${f} AND created_at = ${at}
          LIMIT 1
        `
      : await sql/* sql */`
          SELECT building, floor, size, created_at, created_by, note, data
          FROM space_versions
          WHERE building=${b} AND floor=${f}
          ORDER BY created_at DESC
          LIMIT 1
        `;

    if (!rows[0]) return { statusCode: 404, body: 'Snapshot not found' };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rows[0])
    };
  } catch (e) {
    console.error('history-get error', e);
    return { statusCode: 500, body: 'Server error' };
  }
}
