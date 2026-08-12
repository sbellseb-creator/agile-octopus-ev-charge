/**
 * Offline-first cloud synchronisation for charge sessions and work trips.
 *
 * Model
 *  - localStorage stays the *working copy* so recording works with no
 *    connectivity. Every write stamps `updated_at`.
 *  - The database is the *source of truth*. On every sync the local copy is
 *    replaced by the merged cloud state.
 *  - Deletes are recorded as tombstones so they replicate instead of being
 *    resurrected by the next pull.
 *  - Each cloud row keeps `local_id` (the original localStorage id). A unique
 *    index on (user_id, local_id) plus upsert-on-conflict makes importing the
 *    same record twice impossible, from any device.
 *  - Conflicts resolve last-write-wins on `updated_at`.
 */
import { supabase } from "@/integrations/supabase/client";
import { readJSON, readString, writeJSON, writeString } from "@/lib/safe-storage";

export type SyncState = "idle" | "syncing" | "offline" | "error" | "signed-out";

export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pendingLocalChanges: number;
  message?: string;
  /** Which entity failed, so the message is actionable on mobile. */
  failedTable?: string | null;
  /** Records that could not be pushed and are being skipped (kept locally). */
  quarantined?: number;
}

interface Tombstone {
  local_id: string;
  deleted_at: string;
}

export interface SyncedRecord {
  id: string;
  updated_at?: string;
}

const DEVICE_KEY = "sync-device-id";
const LAST_SYNC_KEY = "sync-last-completed";

export function deviceId(): string {
  let id = readString(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    writeString(DEVICE_KEY, id);
  }
  return id;
}

export function nowIso() {
  return new Date().toISOString();
}

/* ---------------------------------------------------------------- tombstones */

const tombKey = (storageKey: string) => `${storageKey}.tombstones`;

export function recordTombstone(storageKey: string, localId: string) {
  const list = readJSON<Tombstone[]>(tombKey(storageKey), [], Array.isArray);
  if (!list.some((t) => t.local_id === localId)) {
    list.push({ local_id: localId, deleted_at: nowIso() });
    writeJSON(tombKey(storageKey), list);
  }
}

function readTombstones(storageKey: string): Tombstone[] {
  return readJSON<Tombstone[]>(tombKey(storageKey), [], Array.isArray);
}

function clearTombstones(storageKey: string, ids: string[]) {
  const remaining = readTombstones(storageKey).filter((t) => !ids.includes(t.local_id));
  writeJSON(tombKey(storageKey), remaining);
}

/* ------------------------------------------------------------------- backups */

/** One-time safety copy of the pre-migration local data. Never overwritten. */
export function ensureBackup(storageKey: string) {
  const backupKey = `${storageKey}.backup.pre-cloud`;
  if (readString(backupKey) !== null) return;
  const raw = readString(storageKey);
  if (raw && raw !== "[]") {
    writeString(backupKey, raw);
    writeString(`${backupKey}.at`, nowIso());
  }
}

/** Restore the pre-migration snapshot (rollback). Returns true when restored. */
export function restoreBackup(storageKey: string): boolean {
  const raw = readString(`${storageKey}.backup.pre-cloud`);
  if (!raw) return false;
  return writeString(storageKey, raw);
}

/* -------------------------------------------------------------- sync engine */

export interface EntitySync<TLocal extends SyncedRecord, TRow> {
  table: "charge_sessions" | "work_cost_trips";
  storageKey: string;
  /** local record -> database row (without user_id) */
  toRow: (local: TLocal) => Record<string, unknown>;
  /** database row -> local record */
  toLocal: (row: TRow) => TLocal;
  /** sort applied to the merged local list */
  sort: (a: TLocal, b: TLocal) => number;
}

/** Error carrying the entity that failed so the UI can explain it. */
export class SyncError extends Error {
  table: string;
  constructor(message: string, table: string) {
    super(message);
    this.name = "SyncError";
    this.table = table;
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

function isOnline() {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

async function syncEntity<TLocal extends SyncedRecord, TRow extends { local_id: string | null; updated_at: string }>(
  cfg: EntitySync<TLocal, TRow>,
  userId: string,
): Promise<number> {
  const { storageKey, table } = cfg;
  ensureBackup(storageKey);

  // 1. Replicate local deletions to a persistent cloud tombstone table.
  // Tombstones must survive beyond one browser/device; otherwise a stale
  // device can see a missing cloud row and upload the deleted record again.
  const tombs = readTombstones(storageKey);

  if (tombs.length) {
    const cloudTombs = tombs.map((t) => ({
      user_id: userId,
      table_name: table,
      local_id: t.local_id,
      deleted_at: t.deleted_at,
    }));

    const { error: tombErr } = await (supabase as any)
      .from("sync_tombstones")
      .upsert(cloudTombs, {
        onConflict: "user_id,table_name,local_id",
      });

    if (tombErr) {
      throw new SyncError(
        `${table} tombstone: ${tombErr.message}`,
        table,
      );
    }

    const ids = tombs.map((t) => t.local_id);

    const { error } = await (supabase as any)
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("local_id", ids);

    if (error) {
      throw new SyncError(`${table} delete: ${error.message}`, table);
    }
  }

  // Read every deletion known to any device.
  const { data: cloudTombRows, error: cloudTombErr } =
    await (supabase as any)
      .from("sync_tombstones")
      .select("local_id,deleted_at")
      .eq("user_id", userId)
      .eq("table_name", table);

  if (cloudTombErr) {
    throw new SyncError(
      `${table} tombstone read: ${cloudTombErr.message}`,
      table,
    );
  }

  const deletedIds = new Set<string>(
    (cloudTombRows ?? []).map(
      (t: { local_id: string }) => t.local_id,
    ),
  );

  // Local tombstones can now be cleared because their durable copies exist
  // in Supabase and will be seen by every signed-in device.
  if (tombs.length) {
    clearTombstones(
      storageKey,
      tombs.map((t) => t.local_id),
    );
  }

  // 2. Pull remote state.
  const { data: remoteRows, error: pullErr } = await (supabase as any).from(table).select("*").eq("user_id", userId);
  if (pullErr) throw new SyncError(`${table} read: ${pullErr.message}`, table);
  const remote = (remoteRows ?? []) as unknown as TRow[];
  const remoteByLocalId = new Map<string, TRow>();
  for (const r of remote) if (r.local_id) remoteByLocalId.set(r.local_id, r);

  // 3. Push local records that are new or newer than their remote twin.
  const local = readJSON<TLocal[]>(storageKey, [], Array.isArray).filter(
    (r): r is TLocal => !!r && typeof r === "object" && typeof (r as TLocal).id === "string",
  );
  const toPush = local.filter((l) => {
    if (deletedIds.has(l.id)) return false;
    const r = remoteByLocalId.get(l.id);
    if (!r) return true;
    return new Date(l.updated_at ?? 0).getTime() > new Date(r.updated_at).getTime();
  });

  let skipped = 0;
  if (toPush.length) {
    const rows = toPush.map((l) => ({ ...cfg.toRow(l), user_id: userId, local_id: l.id, source_device: deviceId() }));
    // onConflict on (user_id, local_id) makes repeated imports idempotent.
    const { error } = await (supabase as any).from(table).upsert(rows as never, { onConflict: "user_id,local_id" });
    if (error) {
      // One bad legacy record must not block the whole device from syncing.
      // Retry record by record and quarantine only the offenders.
      const failures: string[] = [];
      for (const row of rows) {
        const { error: rowErr } = await (supabase as any)
          .from(table)
          .upsert([row] as never, { onConflict: "user_id,local_id" });
        if (rowErr) failures.push(`${row.local_id}: ${rowErr.message}`);
      }
      if (failures.length === rows.length) {
        // Nothing got through — this is a real connectivity/permission failure.
        throw new SyncError(`${table}: ${error.message}`, table);
      }
      skipped = failures.length;
      console.warn(`[sync] ${table}: skipped ${failures.length} record(s)`, failures);
    }
  }

  // 4. Re-read the authoritative state and mirror it locally.
  const { data: finalRows, error: finalErr } = await (supabase as any).from(table).select("*").eq("user_id", userId);
  if (finalErr) throw new SyncError(`${table} read: ${finalErr.message}`, table);
  const merged = ((finalRows ?? []) as unknown as TRow[])
    .filter((row) => !row.local_id || !deletedIds.has(row.local_id))
    .map(cfg.toLocal)
    .sort(cfg.sort);

  writeJSON(storageKey, merged);
  return skipped;
}

/* ---------------------------------------------------------- public interface */

type Listener = (status: SyncStatus) => void;

const listeners = new Set<Listener>();
let status: SyncStatus = { state: "idle", lastSyncedAt: readString(LAST_SYNC_KEY), pendingLocalChanges: 0 };
let running = false;
let rerun = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: EntitySync<any, any>[] = [];

function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l(status));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSync(fn: Listener): () => void {
  listeners.add(fn);
  fn(status);
  return () => listeners.delete(fn);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerEntity(cfg: EntitySync<any, any>) {
  if (!registry.some((r) => r.table === cfg.table)) registry.push(cfg);
}

/** Data changed locally — reflect it in the UI and try to push it. */
export function markDirty() {
  setStatus({ pendingLocalChanges: status.pendingLocalChanges + 1 });
  void syncNow();
}

export async function syncNow(): Promise<SyncStatus> {
  if (running) {
    rerun = true;
    return status;
  }
  const userId = await currentUserId();
  if (!userId) {
    setStatus({ state: "signed-out" });
    return status;
  }
  if (!isOnline()) {
    setStatus({ state: "offline", message: "Saved on this device — will sync when back online" });
    return status;
  }

  running = true;
  setStatus({ state: "syncing", message: undefined, failedTable: null });
  try {
    let quarantined = 0;
    for (const cfg of registry) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      quarantined += await syncEntity(cfg as any, userId);
    }
    const at = nowIso();
    writeString(LAST_SYNC_KEY, at);
    // A successful run always clears the warning.
    setStatus({
      state: "idle",
      lastSyncedAt: at,
      pendingLocalChanges: 0,
      message: undefined,
      failedTable: null,
      quarantined,
    });
    window.dispatchEvent(new CustomEvent("cloud-sync:updated"));
  } catch (e) {
    setStatus({
      state: "error",
      message: e instanceof Error ? e.message : "Sync failed",
      failedTable: e instanceof SyncError ? e.table : null,
    });
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      void syncNow();
    }
  }
  return status;
}

/**
 * Rollback: restore the pre-migration localStorage snapshots for both data
 * sets. Exposed on `window.evRollbackLocalData()` so it can be triggered from
 * the browser console without a deploy.
 */
export function rollbackToLocalBackups(): string {
  const keys = registry.map((r) => r.storageKey);
  const restored = keys.filter((k) => restoreBackup(k));
  return restored.length
    ? `Restored local backup for: ${restored.join(", ")}. Reload the page.`
    : "No pre-migration backup found.";
}

let wired = false;

/** Start automatic synchronisation: on load, on reconnect, on focus, hourly. */
export function startAutoSync(): () => void {
  void syncNow();
  if (wired) return () => {};
  wired = true;

  (window as unknown as Record<string, unknown>).evRollbackLocalData = rollbackToLocalBackups;

  const onOnline = () => void syncNow();
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncNow();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", () => setStatus({ state: "offline" }));
  document.addEventListener("visibilitychange", onVisible);
  const timer = window.setInterval(() => void syncNow(), 5 * 60_000);

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(timer);
    wired = false;
  };
}
