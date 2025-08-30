// netlify/functions/_lib/history.js
import pkg from 'pg';
const { Client } = pkg;

const CONN = process.env.NEON_DB_URL;

async function withClient(run) {
  const client = new Client({ connectionString: CONN });
  await client.connect();
  try { return await run(client); }
  finally { await client.end(); }
}

export async function getVersion(building, floor) {
  return withClient(async c => {
    const r = await c.query(
      'select coalesce(max(version_n),0) as v from floor_history where building=$1 and floor=$2',
      [building, floor]
    );
    return { version_n: Number(r.rows?.[0]?.v ?? 0) };
  });
}

// (gardé pour compat, on ne force rien côté DB)
export async function setVersion(_b, _f, nextVersion) {
  return { version_n: nextVersion };
}

export async function putSnapshot(building, floor, rec) {
  return withClient(async c => {
    await c.query(
      `insert into floor_history(building, floor, version_n, created_at, created_by, note, size, data)
       values ($1,$2,$3,$4::timestamptz,$5,$6,$7,$8)`,
      [
        building, floor, rec.version_n, rec.created_at,
        rec.created_by, rec.note ?? null, rec.size ?? 0, rec.data ?? {}
      ]
    );
    return `${building}|${floor}|${rec.created_at}`;
  });
}

export async function getSnapshot(building, floor, atISO) {
  return withClient(async c => {
    const r = await c.query(
      `select building,floor,version_n,created_at,created_by,note,size,data
         from floor_history
        where building=$1 and floor=$2 and created_at=$3::timestamptz
        limit 1`,
      [building, floor, atISO]
    );
    return r.rows?.[0] ?? null;
  });
}

export async function listSnapshots(building, floor) {
  return withClient(async c => {
    const r = await c.query(
      `select building,floor,version_n,created_at,created_by,note,size
         from floor_history
        where building=$1 and floor=$2
        order by created_at desc
        limit 200`,
      [building, floor]
    );
    return r.rows || [];
  });
}

export async function getLatestSnapshot(building, floor) {
  return withClient(async c => {
    const r = await c.query(
      `select building,floor,version_n,created_at,created_by,note,size,data
         from floor_history
        where building=$1 and floor=$2
        order by version_n desc, created_at desc
        limit 1`,
      [building, floor]
    );
    return r.rows?.[0] ?? null;
  });
}
