// netlify/functions/_lib/history.js (CommonJS)
const { createClient } = require('@netlify/blobs');

const SNAPSHOTS = 'snapshots';
const VERSIONS  = 'versions';

const client = createClient({
  siteID: process.env.NETLIFY_SITE_ID,
  token:  process.env.NETLIFY_AUTH_TOKEN,
});

const vKey = (building, floor) => `${building}|${floor}`;
const sKey = (building, floor, atISO) => `${building}|${floor}|${atISO}`;

async function getVersion(building, floor) {
  const store = client.getStore(VERSIONS);
  const raw = await store.get(vKey(building, floor));
  const v = raw ? JSON.parse(raw) : { version_n: 0 };
  if (typeof v.version_n !== 'number') v.version_n = 0;
  return v;
}

async function setVersion(building, floor, nextVersion) {
  const store = client.getStore(VERSIONS);
  await store.set(vKey(building, floor), JSON.stringify({ version_n: nextVersion }));
  return { version_n: nextVersion };
}

async function putSnapshot(building, floor, rec) {
  const store = client.getStore(SNAPSHOTS);
  const key = sKey(building, floor, rec.created_at);
  await store.set(key, JSON.stringify(rec));
  return key;
}

async function getSnapshot(building, floor, atISO) {
  const store = client.getStore(SNAPSHOTS);
  const raw = await store.get(sKey(building, floor, atISO));
  return raw ? JSON.parse(raw) : null;
}

async function listSnapshots(building, floor) {
  const store = client.getStore(SNAPSHOTS);
  const prefix = `${building}|${floor}|`;
  const keys = await store.list({ prefix });
  const recs = [];
  for (const k of keys) {
    const raw = await store.get(k.key);
    if (!raw) continue;
    try { recs.push(JSON.parse(raw)); } catch {}
  }
  recs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return recs;
}

async function getLatestSnapshot(building, floor) {
  const list = await listSnapshots(building, floor);
  return list[0] || null;
}

module.exports = {
  getVersion,
  setVersion,
  putSnapshot,
  getSnapshot,
  listSnapshots,
  getLatestSnapshot,
};
