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

// extraction robuste des dates éventuelles dans le feature (string "YYYY-MM-DD")
function pickDateFromFeature(f, key) {
  // priorité: options.ep.key -> properties.key
  const fromEp = f?.options?.ep?.[key];
  const fromProps = f?.properties?.[key];
  const v = (fromEp ?? fromProps ?? '').toString().trim();
  // tolère '' -> null
  if (!v) return null;
  // (optionnel) validation simple YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
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

    // === GET
