const { Client } = require('pg');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const building = event.queryStringParameters?.building;
  const floor    = event.queryStringParameters?.floor;
  if (!building || !floor) return { statusCode: 400, body: 'Missing building/floor' };

  const clientVersion = parseInt(event.headers['if-match-version'] || '0', 10);
  const commitNote    = event.headers['x-commit-note'] || '[save]';
  const createdBy     = event.headers['x-user'] || 'admin';

  let features = [];
  try { features = JSON.parse(event.body || '[]'); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO floor_state (building, floor, version_n)
       VALUES ($1,$2,0) ON CONFLICT (building,floor) DO NOTHING`,
      [building, floor]
    );

    const upd = await client.query(
      `UPDATE floor_state
         SET version_n = version_n + 1
       WHERE building=$1 AND floor=$2 AND version_n=$3`,
      [building, floor, isNaN(clientVersion) ? 0 : clientVersion]
    );
    if (upd.rowCount === 0) {
      const cur = await client.query(
        'SELECT version_n FROM floor_state WHERE building=$1 AND floor=$2',
        [building, floor]
      );
      await client.query('ROLLBACK');
      return {
        statusCode: 409,
        body: JSON.stringify({ message: 'Conflict', currentVersion: cur.rows[0]?.version_n ?? null })
      };
    }

    const snap = await client.query(
      `INSERT INTO space_versions (building, floor, data, created_by, note)
       SELECT $1, $2,
              COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.id), '[]'::jsonb),
              $3, $4
       FROM spaces s
       WHERE s.building=$1 AND s.floor=$2
       RETURNING version_id, created_at, size`,
      [building, floor, createdBy, commitNote]
    );

    await client.query('DELETE FROM spaces WHERE building=$1 AND floor=$2', [building, floor]);

    const insertSQL = `
      INSERT INTO spaces (id, building, floor, geom, code, tenant, label)
      VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4::jsonb, $5, $6, $7)
    `;
    for (const f of features) {
      await client.query(insertSQL, [
        f.id || null,
        building,
        floor,
        JSON.stringify(f.geom || {}),
        f.code ?? null,
        f.tenant ?? null,
        f.label ?? null
      ]);
    }

    const v = await client.query(
      'SELECT version_n FROM floor_state WHERE building=$1 AND floor=$2',
      [building, floor]
    );

    await client.query('COMMIT');
    return {
      statusCode: 201,
      body: JSON.stringify({
        ok: true,
        snapshot: snap.rows[0],
        nextVersion: v.rows[0].version_n
      })
    };
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    return { statusCode: 500, body: 'Server error' };
  } finally {
    await client.end();
  }
};
