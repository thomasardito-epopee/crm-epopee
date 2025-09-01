// netlify/functions/spaces.js
const { Client } = require('pg');

function getConnString() {
  // Accepte NEON_DB_URL ou DATABASE_URL (peu importe lequel tu as mis côté Netlify)
  return process.env.NEON_DB_URL || process.env.DATABASE_URL;
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const isBatch = url.pathname.endsWith('/batch'); // /api/spaces/batch → même function

    const client = new Client({
      connectionString: getConnString(),
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();

    // === GET /api/spaces?building=A&floor=RDC
    if (event.httpMethod === 'GET' && !isBatch) {
      const building = url.searchParams.get('building');
      const floor    = url.searchParams.get('floor');
      if (!building || !floor) {
        await client.end();
        return { statusCode: 400, body: 'missing building/floor' };
      }
      const { rows } = await client.query(
        `SELECT geom
           FROM public.spaces
          WHERE building=$1 AND floor=$2
          ORDER BY code NULLS LAST`,
        [building, floor]
      );
      await client.end();
      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: rows })
      };
    }

    // === POST /api/spaces/batch  (le front envoie {building,floor,features})
    if (event.httpMethod === 'POST' && isBatch) {
      const body = JSON.parse(event.body || '{}');
      const building = body.building;
      const floor    = body.floor;
      const features = Array.isArray(body.features) ? body.features : [];
      if (!building || !floor) {
        await client.end();
        return { statusCode: 400, body: 'missing building/floor' };
      }

      await client.query('BEGIN');
      await client.query(
        'DELETE FROM public.spaces WHERE building=$1 AND floor=$2',
        [building, floor]
      );

      const sql = `
        INSERT INTO public.spaces (id, building, floor, geom, code)
        VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4)
      `;
      for (const f of features) {
        const code =
          (f?.options?.ep?.code) ||
          (f?.code) || null;
        await client.query(sql, [
          building,
          floor,
          JSON.stringify(f), // on stocke l'objet tel quel
          code
        ]);
      }
      await client.query('COMMIT');
      await client.end();

      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, count: features.length })
      };
    }

    await client.end();
    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (err) {
    console.error('spaces error:', err);
    return { statusCode: 500, body: 'Server error: ' + (err?.message || String(err)) };
  }
};
