// netlify/functions/_lib/history.js
// -> Version "propre" 100% Netlify Blobs (aucun createClient)

import { getStore } from "@netlify/blobs";

// 2 “stores” (espaces de clés) : un pour les snapshots, un pour les compteurs de version
const SNAPSHOTS = "snapshots";
const VERSIONS  = "versions";

// Si Blobs n’est pas “activé” côté projet, on le force via siteID + token
// (sinon Netlify utilise la config auto)
const opts =
  process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN
    ? { siteId: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_AUTH_TOKEN }
    : undefined;

// Helpers de clés
const vKey = (building, floor)        => `${building}|${floor}`;
const sKey = (building, floor, atISO) => `${building}|${floor}|${atISO}`;

// ---------- Versions ----------
export async function getVersion(building, floor) {
  const store = await getStore(VERSIONS, opts);
  const raw = await store.get(vKey(building, floor));
  const v = raw ? JSON.parse(raw) : { version_n: 0 };
  if (typeof v.version_n !== "number") v.version_n = 0;
  return v;
}

export async function setVersion(building, floor, nextVersion) {
  const store = await getStore(VERSIONS, opts);
  await store.set(vKey(building, floor), JSON.stringify({ version_n: nextVersion }));
  return { version_n: nextVersion };
}

// ---------- Snapshots ----------
export async function putSnapshot(building, floor, rec) {
  const store = await getStore(SNAPSHOTS, opts);
  const key = sKey(building, floor, rec.created_at);
  await store.set(key, JSON.stringify(rec));
  return key;
}

export async function getSnapshot(building, floor, atISO) {
  const store = await getStore(SNAPSHOTS, opts);
  const raw = await store.get(sKey(building, floor, atISO));
  return raw ? JSON.parse(raw) : null;
}

export async function listSnapshots(building, floor) {
  const store = await getStore(SNAPSHOTS, opts);
  const prefix = `${building}|${floor}|`;
  const keys = await store.list({ prefix }); // [{ key, size, uploaded_at }, ...] selon Netlify
  const recs = [];
  for (const k of keys) {
    const raw = await store.get(k.key);
    if (!raw) continue;
    try { recs.push(JSON.parse(raw)); } catch {}
  }
  // tri du plus récent au plus ancien
  recs.sort((a, b) => (new Date(b.created_at) - new Date(a.created_at)));
  return recs;
}

export async function getLatestSnapshot(building, floor) {
  const list = await listSnapshots(building, floor);
  return list[0] || null;
}
