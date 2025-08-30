import { getSnapshot } from "./_lib/history.js";

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get("building") || "";
    const floor    = url.searchParams.get("floor") || "";
    const at       = url.searchParams.get("at") || "";   // ISO string
    const full     = url.searchParams.get("full") === "1";

    if (!building || !floor || !at) {
      return { statusCode: 400, body: "missing building/floor/at" };
    }

    const snap = await getSnapshot(building, floor, at);
    if (!snap) return { statusCode: 404, body: "not found" };

    const body = full
      ? { at: snap.created_at, note: snap.note, size: snap.size, data: snap.data } // includes features
      : { at: snap.created_at, note: snap.note, size: snap.size };

    return { statusCode: 200, headers: { "content-type":"application/json" }, body: JSON.stringify(body) };
  } catch (e) {
    return { statusCode: 500, body: `history-get: ${String(e?.message || e)}` };
  }
}
