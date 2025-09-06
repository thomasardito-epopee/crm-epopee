// history-save.js
const { pool } = require('./_db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'POST only' };
  }
  try {
    const { building, floor, note = '' } = event.queryStringParameters || {};
    if (!building || !floor) {
      return { statusCode: 400, body: JSON.stringify({ error: 'building & floor requis' }) };
    }

    // On capture les features actuelles du plan depuis "spaces"
    const { rows } = await pool.query(
      `select geom from spaces where building = $1 and floor = $2 order by id`,
      [building, floor]
    );
    const features = rows.map(r => r.geom);

    await pool.query(
      `insert into history_snapshots (building, floor, features, note) values ($1, $2, $3::jsonb, $4)`,
      [building, floor, JSON.stringify(features), note]
    );

    return { statusCode: 200, body: JSON.stringify({ ok: true, count: features.length }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: 'history save failed' }) };
  }
};
