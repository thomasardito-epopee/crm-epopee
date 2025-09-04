// netlify/functions/floor-version.mjs
import pkg from 'pg';
const { Client } = pkg;

export async function handler(event) {
  try {
    const u = new URL(event.rawUrl);
    const building = u.searchParams.get('building');
    const floor    = u.searchParams.get('floor');
    if (!building || !floor) {
      return { statusCode: 400, body: 'building & floor requis' };
    }

    const client = new Client({ connectionString: process.env.NEON_DB_URL });
    await client.connect();

    const res = await client.query(
      'select coalesce(max(version_n),0) as v from floor_history where building=$1 and floor=$2',
      [building, floor]
    );

    await client.end();

    const version_n = Number(res?.rows?.[0]?.v ?? 0);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version_n })
    };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
}
