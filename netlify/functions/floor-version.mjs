import { neon } from '@neondatabase/serverless';

// GET /api/floor-version?building=A&floor=RDC
export async function handler(event) {
  try {
    const q = event.queryStringParameters || {};
    const b = q.building;
    const f = q.floor;
    if (!b || !f) {
      return { statusCode: 400, body: 'Missing building/floor' };
    }

    const sql = neon(process.env.DATABASE_URL);

    // Crée la ligne si absente (version 0)
    await sql`
      INSERT INTO floor_state (building, floor, version_n)
      VALUES (${b}, ${f}, 0)
      ON CONFLICT (building, floor) DO NOTHING
    `;

    const rows = await sql`
      SELECT version_n FROM floor_state WHERE building=${b} AND floor=${f}
    `;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version_n: rows?.[0]?.version_n ?? 0 })
    };
  } catch (err) {
    console.error('floor-version error:', err);
    return { statusCode: 500, body: 'Server error' };
  }
}
