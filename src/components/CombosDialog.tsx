import { Copy, FolderOpen, Pencil, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import type { ComboDocument } from "../domain/combo";
import { parseComboFile, maximumImportBytes } from "../exports/json";
import {
  deleteCombo,
  listCombos,
  loadCombo,
  saveCombo,
  storageMessage,
} from "../persistence/database";
import type { SavedComboSummary } from "../persistence/database";

/** Title and description fields. Changes apply when a field loses focus. */
export function ComboDetails({
  title,
  description,
  onSave,
}: {
  title: string;
  description?: string;
  onSave: (value: { title: string; description: string }) => void;
}) {
  const [name, setName] = useState(title);
  const [text, setText] = useState(description ?? "");
  const ids = { title: useId(), description: useId() };
  const apply = () => {
    if (name.trim() !== title || text.trim() !== (description ?? ""))
      onSave({ title: name, description: text });
  };
  return (
    <div className="settings-fields combo-details">
      <label htmlFor={ids.title}>
        Combo title
        <input
          id={ids.title}
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          onBlur={apply}
          onKeyDown={(event) => event.key === "Enter" && apply()}
        />
      </label>
      <label htmlFor={ids.description} className="wide-field">
        Description (optional)
        <textarea
          id={ids.description}
          rows={2}
          maxLength={2000}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={apply}
        />
      </label>
    </div>
  );
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/** Saved combos in this browser, plus JSON backup import. */
export function CombosDialog({
  open,
  doc,
  dirty,
  details,
  onOpen,
  onSaved,
  onRenameOpen,
  onClose,
}: {
  open: boolean;
  doc: ComboDocument;
  /** The open combo has changes that are not in a manual save. */
  dirty: boolean;
  details: ReactNode;
  onOpen: (doc: ComboDocument, message: string) => void;
  onSaved: (doc: ComboDocument) => void;
  /** The open combo was renamed in the saved list. */
  onRenameOpen: (title: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog combos-dialog"
      aria-labelledby="combos-title"
      onClose={onClose}
    >
      {open && (
        <CombosBody
          doc={doc}
          dirty={dirty}
          details={details}
          onOpen={onOpen}
          onSaved={onSaved}
          onRenameOpen={onRenameOpen}
          onClose={() => dialog.current?.close()}
        />
      )}
    </dialog>
  );
}

function CombosBody({
  doc,
  dirty,
  details,
  onOpen,
  onSaved,
  onRenameOpen,
  onClose,
}: {
  doc: ComboDocument;
  dirty: boolean;
  details: ReactNode;
  onOpen: (doc: ComboDocument, message: string) => void;
  onSaved: (doc: ComboDocument) => void;
  onRenameOpen: (title: string) => void;
  onClose: () => void;
}) {
  const [saved, setSaved] = useState<SavedComboSummary[] | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const fileId = useId();

  const refresh = useCallback(() => {
    listCombos()
      .then(setSaved)
      .catch((error: unknown) => {
        setSaved([]);
        setStatus({ ok: false, message: storageMessage(error) });
      });
  }, []);
  useEffect(refresh, [refresh]);

  async function run(task: () => Promise<string>) {
    try {
      setStatus({ ok: true, message: await task() });
    } catch (error) {
      setStatus({ ok: false, message: storageMessage(error) });
    }
    setConfirm(null);
    refresh();
  }

  async function open(id: string) {
    const found = await loadCombo(id);
    if (!found) throw new Error("That saved combo could not be read.");
    onOpen(found, `Opened ${found.title}.`);
    onClose();
    return `Opened ${found.title}.`;
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > maximumImportBytes) {
      setStatus({ ok: false, message: "The file is larger than 5 MB." });
      return;
    }
    const result = parseComboFile(await file.text());
    if (!result.ok) {
      setStatus({ ok: false, message: `Import failed. ${result.error}` });
      return;
    }
    // Imports become a new combo, so they never overwrite a saved one.
    onOpen(
      { ...result.doc, id: newId() },
      `Imported ${result.doc.title} from ${file.name}.`,
    );
    onClose();
  }

  const discardNote = dirty ? " (unsaved changes will be lost)" : "";

  return (
    <div className="combos-body">
      <div className="dialog-title">
        <h2 id="combos-title">Combos</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close combos"
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      {details}
      <div className="dialog-actions start">
        <button
          type="button"
          className="primary-button"
          onClick={() =>
            run(async () => {
              await saveCombo(doc, new Date().toISOString());
              onSaved(doc);
              return `Saved ${doc.title} in this browser.`;
            })
          }
        >
          Save to This Browser
        </button>
        <label className="subtle-button file-button" htmlFor={fileId}>
          <Upload size={16} aria-hidden="true" /> Import JSON
        </label>
        <input
          id={fileId}
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={importFile}
        />
      </div>
      <p
        className={status && !status.ok ? "form-error" : "choice-empty"}
        role="status"
      >
        {status?.message ?? ""}
      </p>
      <h3 className="saved-heading">Saved in this browser</h3>
      {saved === null ? (
        <p className="choice-empty">Loading…</p>
      ) : saved.length === 0 ? (
        <p className="choice-empty">No saved combos yet.</p>
      ) : (
        <ul className="saved-list">
          {saved.map((item) => (
            <li key={item.id}>
              {renaming?.id === item.id ? (
                <form
                  className="rename-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const title = renaming.title.trim();
                    if (!title) return;
                    setRenaming(null);
                    void run(async () => {
                      const found = await loadCombo(item.id);
                      if (!found)
                        throw new Error("That saved combo could not be read.");
                      const now = new Date().toISOString();
                      await saveCombo({ ...found, title, updatedAt: now }, now);
                      if (found.id === doc.id) onRenameOpen(title);
                      return `Renamed to ${title}.`;
                    });
                  }}
                >
                  <label
                    className="visually-hidden"
                    htmlFor={`rename-${item.id}`}
                  >
                    New title
                  </label>
                  <input
                    id={`rename-${item.id}`}
                    value={renaming.title}
                    maxLength={120}
                    autoFocus
                    onChange={(event) =>
                      setRenaming({ id: item.id, title: event.target.value })
                    }
                  />
                  <button type="submit" className="subtle-button">
                    Rename
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setRenaming(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <>
                  <div className="saved-info">
                    <strong>
                      {item.title}
                      {item.id === doc.id && (
                        <small className="entry-tag">Open</small>
                      )}
                    </strong>
                    <small>
                      {item.steps} step{item.steps === 1 ? "" : "s"} · updated{" "}
                      {dateFormat.format(new Date(item.updatedAt))}
                    </small>
                  </div>
                  <div className="saved-actions">
                    {confirm === `open-${item.id}` ? (
                      <button
                        type="button"
                        className="remove-button"
                        onClick={() => run(() => open(item.id))}
                      >
                        Open{discardNote}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Open ${item.title}`}
                        title="Open"
                        onClick={() =>
                          dirty && item.id !== doc.id
                            ? setConfirm(`open-${item.id}`)
                            : run(() => open(item.id))
                        }
                      >
                        <FolderOpen size={16} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Duplicate ${item.title}`}
                      title="Duplicate"
                      onClick={() =>
                        run(async () => {
                          const found = await loadCombo(item.id);
                          if (!found)
                            throw new Error(
                              "That saved combo could not be read.",
                            );
                          const now = new Date().toISOString();
                          const title = `${found.title} (copy)`.slice(0, 120);
                          await saveCombo(
                            {
                              ...found,
                              id: newId(),
                              title,
                              createdAt: now,
                              updatedAt: now,
                            },
                            now,
                          );
                          return `Saved ${title}.`;
                        })
                      }
                    >
                      <Copy size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Rename ${item.title}`}
                      title="Rename"
                      onClick={() =>
                        setRenaming({ id: item.id, title: item.title })
                      }
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    {confirm === `delete-${item.id}` ? (
                      <button
                        type="button"
                        className="remove-button"
                        onClick={() =>
                          run(async () => {
                            await deleteCombo(item.id);
                            return `Deleted ${item.title}.`;
                          })
                        }
                      >
                        Confirm delete
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-button danger-icon"
                        aria-label={`Delete ${item.title}`}
                        title="Delete"
                        onClick={() => setConfirm(`delete-${item.id}`)}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="editor-hint storage-note">
        Combos are stored only in this browser. Clearing site data or using a
        private window can remove them, and nothing is backed up online. Export
        a JSON backup for combos you want to keep.
      </p>
    </div>
  );
}
