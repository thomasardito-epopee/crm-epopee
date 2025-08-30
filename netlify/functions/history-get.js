// netlify/functions/history-get.js
import { getSnapshot } from "./_lib/history.js";

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get("building") || "";
    const floor = url.searchParams.get("floor") || "";
    const at = url.searchParams.get("at") || ""; // ISO string
    if (!building || !floor || !at) return { statusCode: 400, body: "missing building/floor/at" };

    const snap = await getSnapshot(building, floor, at);
    if (!snap) return { statusCode: 404, body: "not found" };

    // You can trim the features if you only need metadata; UI sometimes wants size only.
    return { statusCode: 200, body: JSON.stringify({ size: snap.size, note: snap.note, at: snap.created_at }) };
  } catch (e) {
    return { statusCode: 500, body: `history-get: ${String(e?.message || e)}` };
  }
}
