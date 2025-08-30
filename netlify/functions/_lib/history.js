// netlify/functions/_lib/history.js
import { getStore } from "@netlify/blobs";

const SNAPSHOTS = "snapshots"; // blob store for snapshots
const VERSIONS  = "versions";  // blob store for per-floor version counters

function vKey(building, floor) {
  return `${building}|${floor}`; // e.g. "A|R+2"
}
function sKey(building, floor, atISO) {
  return `${building}|${floor}|${atISO}`; // unique snapshot key
}

/** Return current version { version_n } (0 if none yet) */
export async function getVersion(building, floor) {
  const store = await getStore(VERSIONS);
  const raw = await store.get(vKey(building, floor));
  const v = raw ? JSON.parse(raw) : { version_n: 0 };
  if (typeof v.version_n !== "number") v.version_n = 0;
  return v;
}

/** Set version number (overwrite) */
export async function setVersion(building, floor, nextVersion) {
  const store = await getStore(VERSIONS);
  await store.set(vKey(building, floor), JSON.stringify({ version_n: nextVersion }));
  return { version_n: nextVersion };
}

/** Put a snapshot record */
export async function putSnapshot(building, floor, rec) {
  const store = await getStore(SNAPSHOTS);
  const key = sKey(building, floor, rec.created_at);
  await store.set(key, JSON.stringify(rec));
  return key;
}

/** Get snapshot by exact ISO timestamp */
export async function getSnapshot(building, floor, atISO) {
  const store = await getStore(SNAPSHOTS);
  const raw = await store.get(sKey(building, floor, atISO));
  return raw ? JSON.parse(raw) : null;
}

/** List snapshots for a floor (newest first) */
export async function listSnapshots(building, floor) {
  const store = await getStore(SNAPSHOTS);
  const prefix = `${building}|${floor}|`;
  const keys = await store.list({ prefix }); // returns [{key, size, uploaded_at}, ...]
  // Fetch and parse records
  const recs = [];
  for (const k of keys) {
    const raw = await store.get(k.key);
    if (!raw) continue;
    try { recs.push(JSON.parse(raw)); } catch {}
  }
  // newest first
  recs.sort((a, b) => (new Date(b.created_at) - new Date(a.created_at)));
  return recs;
}

/** Get the latest snapshot (or null) */
export async function getLatestSnapshot(building, floor) {
  const list = await listSnapshots(building, floor);
  return list[0] || null;
}
