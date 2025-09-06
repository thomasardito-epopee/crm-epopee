// history.js
const { pool } = require('./_db');

exports.handler = async (event) => {
  try {
    const { building, floor } = event.queryStringParameters || {};
    if (!building || !floor) {
      return { statusCode: 400, body: JSON.stringify({ error: 'building & floor requis' }) };
    }

    const { rows } = await pool.query(
      `select at, note, jsonb_array_length(features) as count
         from history_snapshots
        where building = $1 and floor = $2
        order by at desc
        limit 50`,
      [building, floor]
    );

    return { statusCode: 200, body: JSON.stringify(rows) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: 'history list failed' }) };
  }
};
