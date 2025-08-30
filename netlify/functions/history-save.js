// netlify/functions/history-save.js
import { getVersion, setVersion, putSnapshot } from "./_lib/history.js";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const { building, floor, features, note } = JSON.parse(event.body || "{}");
    if (!building || !floor) return { statusCode: 400, body: "missing building/floor" };

    const ifMatch = Number(event.headers["if-match-version"] || event.headers["If-Match-Version"] || 0);
    const by = event.headers["x-user"] || event.headers["X-User"] || "system";

    // 1) Version check
    const cur = await getVersion(building, floor); // {version_n}
    if (cur.version_n !== ifMatch) {
      return { statusCode: 409, body: "version conflict" };
    }

    // 2) Next
    const next = cur.version_n + 1;

    // 3) Snapshot record
    const created_at = new Date().toISOString();
    const rec = {
      building, floor,
      version_n: next,
      created_at,
      created_by: by,
      note: note || "auto",
      size: Array.isArray(features) ? features.length : 0,
      data: { key: `${building}|${floor}`, features }
    };

    await putSnapshot(building, floor, rec);

    // 4) Persist new version
    await setVersion(building, floor, next);

    return { statusCode: 200, body: JSON.stringify({ nextVersion: next }) };
  } catch (e) {
    return { statusCode: 500, body: `history-save: ${String(e?.message || e)}` };
  }
}
