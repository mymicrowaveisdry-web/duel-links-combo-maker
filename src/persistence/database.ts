// Browser-local persistence with IndexedDB. Nothing leaves the device. Every stored
// document is revalidated on load, so a damaged record cannot corrupt the editor.
import type { ComboDocument } from "../domain/combo";
import { validateComboDocument } from "../exports/json";

const databaseName = "duel-links-combo-maker";
const databaseVersion = 1;
const comboStore = "combos";
const draftStore = "drafts";
const draftKey = "current";

export interface SavedComboSummary {
  id: string;
  title: string;
  steps: number;
  updatedAt: string;
}

interface StoredCombo {
  id: string;
  savedAt: string;
  doc: unknown;
}

let opening: Promise<IDBDatabase> | null = null;

/** Turns storage failures into messages a person can act on. */
export function storageMessage(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "QuotaExceededError")
    return "Browser storage is full. Delete saved combos or export JSON backups.";
  if (name === "InvalidStateError" || name === "SecurityError")
    return "This browser blocks local storage here, for example in a private window.";
  return error instanceof Error && error.message
    ? `Local storage failed: ${error.message}`
    : "Local storage failed.";
}

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function database() {
  if (!globalThis.indexedDB)
    return Promise.reject(
      new Error("IndexedDB is unavailable in this browser."),
    );
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(databaseName, databaseVersion);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(comboStore))
        db.createObjectStore(comboStore, { keyPath: "id" });
      if (!db.objectStoreNames.contains(draftStore))
        db.createObjectStore(draftStore, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
    req.onblocked = () => {
      opening = null;
      reject(new Error("Close other tabs of the app and try again."));
    };
  });
  return opening;
}

async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (objects: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  const tx = db.transaction(store, mode);
  const result = request(run(tx.objectStore(store)));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error ?? new Error("Storage transaction aborted."));
  });
  return result;
}

function toDocument(record: StoredCombo | undefined): ComboDocument | null {
  if (!record) return null;
  const result = validateComboDocument(record.doc);
  return result.ok ? result.doc : null;
}

export async function saveCombo(doc: ComboDocument, savedAt: string) {
  const record: StoredCombo = { id: doc.id, savedAt, doc };
  await transact(comboStore, "readwrite", (store) => store.put(record));
}

export async function loadCombo(id: string) {
  return toDocument(
    await transact<StoredCombo | undefined>(comboStore, "readonly", (store) =>
      store.get(id),
    ),
  );
}

export async function deleteCombo(id: string) {
  await transact(comboStore, "readwrite", (store) => store.delete(id));
}

/** Lists saved combos, most recently changed first. Unreadable records are skipped. */
export async function listCombos(): Promise<SavedComboSummary[]> {
  const records = await transact<StoredCombo[]>(
    comboStore,
    "readonly",
    (store) => store.getAll(),
  );
  return records
    .flatMap((record): SavedComboSummary[] => {
      const doc = record.doc as Partial<ComboDocument> | undefined;
      if (!doc || typeof doc.title !== "string" || !Array.isArray(doc.steps))
        return [];
      return [
        {
          id: record.id,
          title: doc.title,
          steps: doc.steps.length,
          updatedAt:
            typeof doc.updatedAt === "string" ? doc.updatedAt : record.savedAt,
        },
      ];
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** The autosaved working copy, recovered after a refresh or crash. */
export async function saveDraft(doc: ComboDocument, savedAt: string) {
  await transact(draftStore, "readwrite", (store) =>
    store.put({ id: draftKey, savedAt, doc }),
  );
}

export async function loadDraft() {
  return toDocument(
    await transact<StoredCombo | undefined>(draftStore, "readonly", (store) =>
      store.get(draftKey),
    ),
  );
}
