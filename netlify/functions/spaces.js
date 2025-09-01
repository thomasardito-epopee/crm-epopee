// netlify/functions/spaces.js
const { Client } = require('pg');

function getConnString() {
  // Essaie plusieurs noms d’ENV possibles (Neon/Netlify)
  return (
    process.env.NEON_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED
  );
}

exports.handler = async (event) => {
  let client;
  try {
    const url = new URL(event.rawUrl);
    const isBatch = url.pathname.endsWith('/batch'); // /api/spaces/batch → même function

    client = new Client({
      connectionString: getConnString(),
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();

    // === GET /api/spaces?building=A&floor=RDC
    if (event.httpMethod === 'GET' && !isBatch) {
      const building = url.searchParams.get('building');
      const floor = url.searchParams.get('floor');
      if (!building || !floor) {
        return { statusCode: 400, body: 'missing building/floor' };
      }

      const { rows } = await client.query(
        `SELECT geom
           FROM public.spaces
          WHERE building = $1 AND floor = $2
          ORDER BY code NULLS LAST, id ASC`,
        [building, floor]
      );

      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: rows }),
      };
    }

    // === POST /api/spaces/batch  (le front envoie {building,floor,features})
    if (event.httpMethod === 'POST' && isBatch) {
      const { building, floor, features } = JSON.parse(event.body || '{}');

      if (!building || !floor || !Array.isArray(features)) {
        return { statusCode: 400, body: 'missing building/floor/features' };
      }

      await client.query('BEGIN');

      // 1) Remplacement total : on efface tout l'existant
      await client.query(
        'DELETE FROM public.spaces WHERE building = $1 AND floor = $2',
        [building, floor]
      );

      // 2) Réinsertion de l’état courant (peut être vide)
      if (features.length) {
        const sql = `
          INSERT INTO public.spaces (id, building, floor, geom, code)
          VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4)
        `;
        for (const f of features) {
          const code =
            (f && f.options && f.options.ep && f.options.ep.code)
              ? String(f.options.ep.code)
              : null;

          await client.query(sql, [
            building,
            floor,
            JSON.stringify(f), // on stocke l'objet tel quel
            code,
          ]);
        }
      }

      await client.query('COMMIT');

      return {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true, replaced: features.length }),
      };
    }

    return { statusCode: 405, body: 'Method Not Allowed' };
  } catch (err) {
    try { if (client) await client.query('ROLLBACK'); } catch {}
    console.error('spaces error:', err);
    return { statusCode: 500, body: 'Server error: ' + (err?.message || String(err)) };
  } finally {
    try { if (client) await client.end(); } catch {}
  }
};
