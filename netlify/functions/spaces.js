// netlify/functions/spaces.js
const { Client } = require('pg');

function getConnString() {
  return (
    process.env.NETLIFY_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DB_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED
  );
}

exports.handler = async (event) => {
  const url = new URL(event.rawUrl);
  const isBatch = url.pathname.endsWith('/batch'); // /api/spaces/batch

  const client = new Client({
    connectionString: getConnString(),
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    // === GET /api/spaces?building=A&floor=RDJ
    if (event.httpMethod === 'GET') {
      const building = url.searchParams.get('building');
      const floor = url.searchParams.get('floor');
      if (!building || !floor) {
        return { statusCode: 400, body: 'Missing building/floor' };
      }

      const r = await client.query(
        `SELECT id, building, floor, code, tenant, label, geom
           FROM spaces
          WHERE building = $1 AND floor = $2
          ORDER BY id`,
        [building, floor]
      );

      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: r.rows }),
      };
    }

    // === POST /api/spaces/batch   { building, floor, features: [...] }
    if (event.httpMethod === 'POST' && isBatch) {
      let payload;
      try { payload = JSON.parse(event.body || '{}'); }
      catch { return { statusCode: 400, body: 'Invalid JSON' }; }

      const { building, floor, features } = payload || {};
      if (!building || !floor || !Array.isArray(features)) {
        return { statusCode: 400, body: 'Missing data' };
      }

      await client.query('BEGIN');
      await client.query('DELETE FROM spaces WHERE building=$1 AND floor=$2', [building, floor]);

      const insertSQL = `
        INSERT INTO spaces (id, building, floor, geom, code, tenant, label)
        VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4, $5, $6)
      `;

      let count = 0;
      for (const f of features) {
        const ep = (f.options && f.options.ep) || {};
        const geom = JSON.stringify(f); // on stocke l'objet tel quel
        await client.query(insertSQL, [
          building,
          floor,
          geom,
          ep.code ?? null,
          ep.tenant ?? null,
          ep.label ?? null,
        ]);
        count++;
      }

      await client.query('COMMIT');
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, count }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (e) {
    console.error(e);
    try { await client.query('ROLLBACK'); } catch {}
    return { statusCode: 500, body: 'Server error' };
  } finally {
    try { await client.end(); } catch {}
  }
};
