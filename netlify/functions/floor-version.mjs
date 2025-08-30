// netlify/functions/floor-version.js
import { getVersion } from "./_lib/history.js";

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const building = url.searchParams.get("building") || "";
    const floor = url.searchParams.get("floor") || "";
    if (!building || !floor) return { statusCode: 400, body: "missing building/floor" };

    const v = await getVersion(building, floor);
    return { statusCode: 200, body: JSON.stringify(v) };
  } catch (e) {
    return { statusCode: 500, body: String(e?.message || e) };
  }
}
