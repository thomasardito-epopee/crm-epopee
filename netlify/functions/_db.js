// _db.js
const { Pool } = require('pg');

const CONN =
  process.env.DATABASE_URL ||
  process.env.NEON_DB_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED;

const pool = new Pool({
  connectionString: CONN,
  ssl: { rejectUnauthorized: false } // safe avec Neon (sslmode=require)
});

module.exports = { pool };
