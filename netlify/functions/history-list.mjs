// netlify/functions/history-list.js
import { listSnapshots } from "./_lib/history.js";

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get("building") || "";
    const floor = url.searchParams.get("floor") || "";
    if (!building || !floor) return { statusCode: 400, body: "missing building/floor" };

    const list = await listSnapshots(building, floor);
    // Light payload for the UI list
    const ui = list.map(it => ({
      building: it.building,
      floor: it.floor,
      created_at: it.created_at,
      created_by: it.created_by,
      note: it.note || "",
      size: it.size || 0,
      version_n: it.version_n
    }));
    return { statusCode: 200, body: JSON.stringify(ui) };
  } catch (e) {
    return { statusCode: 500, body: `history-list: ${String(e?.message || e)}` };
  }
}
