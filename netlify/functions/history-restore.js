// netlify/functions/history-restore.js
import { getVersion, setVersion, getSnapshot, getLatestSnapshot, putSnapshot } from "./_lib/history.js";

const API_URL   = process.env.SPACES_API_URL;   // required
const API_TOKEN = process.env.SPACES_API_TOKEN; // optional

async function pushToCurrent(building, floor, features){
  if (!API_URL) throw new Error("SPACES_API_URL not configured");
  const r = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(API_TOKEN ? { "authorization": `Bearer ${API_TOKEN}` } : {})
    },
    body: JSON.stringify({ building, floor, features })
  });
  if (!r.ok) {
    const txt = await r.text().catch(()=> "");
    throw new Error(`pushToCurrent failed: ${r.status} ${txt}`);
  }
}

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const url = new URL(event.rawUrl);
    const building = url.searchParams.get("building") || "";
    const floor = url.searchParams.get("floor") || "";
    const at = url.searchParams.get("at"); // optional

    if (!building || !floor) return { statusCode: 400, body: "missing building/floor" };

    const by   = event.headers["x-user"] || event.headers["X-User"] || "admin";
    const note = event.headers["x-commit-note"] || event.headers["X-Commit-Note"] || "restore";
    const ifMatch = Number(event.headers["if-match-version"] || event.headers["If-Match-Version"] || 0);

    // Concurrency check
    const cur = await getVersion(building, floor);
    if (cur.version_n !== ifMatch) {
      return { statusCode: 409, body: "version conflict" };
    }

    // Find snapshot
    const snap = at
      ? await getSnapshot(building, floor, at)
      : await getLatestSnapshot(building, floor);

    if (!snap) return { statusCode: 404, body: "snapshot not found" };

    const features = snap?.data?.features || [];
    // 1) Write these features back to the "current" store (your existing API)
    await pushToCurrent(building, floor, features);

    // 2) Create a new snapshot that represents the "post-restore" state
    const next = cur.version_n + 1;
    const created_at = new Date().toISOString();
    const rec = {
      building, floor,
      version_n: next,
      created_at,
      created_by: by,
      note: `[restore] ${note} (source ${snap.created_at})`,
      size: Array.isArray(features) ? features.length : 0,
      data: { key: `${building}|${floor}`, features }
    };
    await putSnapshot(building, floor, rec);

    // 3) Bump version
    await setVersion(building, floor, next);

    return { statusCode: 200, body: JSON.stringify({ nextVersion: next }) };
  } catch (e) {
    return { statusCode: 500, body: `restore: ${String(e?.message || e)}` };
  }
}
