/**
 * Checks whether two region code strings refer to the same Philippine
 * administrative region.
 *
 * The backend stores PSGC 10-digit codes (e.g. "0100000000").
 * UI / GeoJSON may use short codes ("01", "NCR", "CAR") or PSGC codes.
 *
 * Rules (evaluated in order):
 *  1. Exact string match.
 *  2. Case-insensitive exact match (for named codes like "NCR").
 *  3. Both are 10-digit PSGC codes whose first two digits match
 *     (PSGC region identifier is encoded in the first two digits).
 */
export function matchesPsgcRegion(a: string, b: string): boolean {
  if (!a || !b) return false;

  // 1. Exact match
  if (a === b) return true;

  // 2. Case-insensitive (covers "NCR" === "ncr", "CAR" === "car", etc.)
  if (a.toUpperCase() === b.toUpperCase()) return true;

  // 3. Both are 10-digit PSGC codes: compare region prefix (first 2 digits)
  if (
    a.length === 10 &&
    b.length === 10 &&
    /^\d{10}$/.test(a) &&
    /^\d{10}$/.test(b) &&
    a.slice(0, 2) === b.slice(0, 2)
  ) {
    return true;
  }

  return false;
}
