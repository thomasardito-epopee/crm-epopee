// history-restore.js
const { pool } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'POST only' };
  }
  try {
    const { building, floor, at } = event.queryStringParameters || {};
    if (!building || !floor || !at) {
      return { statusCode: 400, body: JSON.stringify({ error: 'building, floor & at requis' }) };
    }

    const snap = await pool.query(
      `select features from history_snapshots where building=$1 and floor=$2 and at = $3::timestamptz limit 1`,
      [building, floor, at]
    );
    if (!snap.rows[0]) {
      return { statusCode: 404, body: JSON.stringify({ error: 'snapshot introuvable' }) };
    }
    const features = snap.rows[0].features || [];

    await pool.query('BEGIN');
    await pool.query(`delete from spaces where building=$1 and floor=$2`, [building, floor]);
    for (const fe of features) {
      await pool.query(
        `insert into spaces (building, floor, geom) values ($1, $2, $3::jsonb)`,
        [building, floor, JSON.stringify(fe)]
      );
    }
    await pool.query('COMMIT');

    return { statusCode: 200, body: JSON.stringify({ ok: true, restored: features.length }) };
  } catch (e) {
    console.error(e);
    try { await pool.query('ROLLBACK'); } catch {}
    return { statusCode: 500, body: JSON.stringify({ error: 'history restore failed' }) };
  }
};
