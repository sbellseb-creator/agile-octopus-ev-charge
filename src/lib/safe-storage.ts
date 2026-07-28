/**
 * Defensive localStorage helpers.
 *
 * Every read is guarded against:
 *  - localStorage being unavailable (private mode / SSR / blocked cookies)
 *  - malformed or truncated JSON
 *  - a value of the wrong shape (e.g. an object where an array is expected)
 *
 * A corrupted value never crashes the app: it is quarantined under
 * `<key>.corrupt` (best effort) so nothing is silently destroyed, and the
 * caller receives its fallback.
 */

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  const s = storage();
  if (!s) return null;
  try {
    return s.getItem(key);
  } catch {
    return null;
  }
}

export function writeString(key: string, value: string): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[storage] failed to write "${key}"`, err);
    return false;
  }
}

function quarantine(key: string, raw: string) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(`${key}.corrupt`, raw);
    s.removeItem(key);
  } catch {
    /* nothing else we can do */
  }
}

/**
 * Parse a JSON value from localStorage.
 * @param validate optional shape guard; when it returns false the stored value
 *                 is treated as corrupt and the fallback is returned.
 */
export function readJSON<T>(key: string, fallback: T, validate?: (v: unknown) => boolean): T {
  const raw = readString(key);
  if (raw === null || raw === "") return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] corrupt JSON in "${key}" – quarantined`, err);
    quarantine(key, raw);
    return fallback;
  }
  if (parsed === null || parsed === undefined) return fallback;
  if (validate && !validate(parsed)) {
    console.warn(`[storage] unexpected shape in "${key}" – quarantined`);
    quarantine(key, raw);
    return fallback;
  }
  return parsed as T;
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    return writeString(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[storage] failed to serialise "${key}"`, err);
    return false;
  }
}

/** Read a finite number, falling back when missing or malformed. */
export function readNumber(key: string, fallback: number): number {
  const raw = readString(key);
  if (raw === null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}
