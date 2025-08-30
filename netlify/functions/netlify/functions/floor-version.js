const { Client } = require('pg');

exports.handler = async (event) => {
  const b = event.queryStringParameters?.building;
  const f = event.queryStringParameters?.floor;
  if (!b || !f) return { statusCode: 400, body: 'Missing building/floor' };

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // crée la ligne si absente (version 0)
    await client.query(
      `INSERT INTO floor_state (building, floor, version_n)
       VALUES ($1,$2,0)
       ON CONFLICT (building,floor) DO NOTHING`,
      [b, f]
    );

    const r = await client.query(
      'SELECT version_n FROM floor_state WHERE building=$1 AND floor=$2',
      [b, f]
    );
    return { statusCode: 200, body: JSON.stringify({ version_n: r.rows[0]?.version_n ?? 0 }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: 'Server error' };
  } finally {
    await client.end();
  }
};
