import { Copy, Download, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ComboDocument, ReplayResult } from "../domain/combo";
import {
  copyText,
  downloadBlob,
  downloadText,
  readPreference,
  writePreference,
} from "../exports/browser";
import { serializeCombo } from "../exports/json";
import { buildExportModel, fileSlug } from "../exports/model";
import {
  defaultPngOptions,
  loadImages,
  modelCards,
  renderPng,
} from "../exports/png";
import type { PngOptions } from "../exports/png";
import { comboText, defaultTextOptions } from "../exports/text";
import type { TextOptions } from "../exports/text";

type Tab = "png" | "text" | "json";
const pngKey = "dlcm.pngOptions";
const textKey = "dlcm.textOptions";

/** Export preview and downloads. Rendering never uses the editor's screen layout. */
export function ExportDialog({
  open,
  doc,
  replayed,
  artworkUrl,
  details,
  onClose,
}: {
  open: boolean;
  doc: ComboDocument;
  replayed: ReplayResult;
  artworkUrl: (cardId: number) => string | undefined;
  /** Title and description fields shared with the combos dialog. */
  details: ReactNode;
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
      className="settings-dialog export-dialog"
      aria-labelledby="export-title"
      onClose={onClose}
    >
      {open && (
        <ExportBody
          doc={doc}
          replayed={replayed}
          artworkUrl={artworkUrl}
          details={details}
          onClose={() => dialog.current?.close()}
        />
      )}
    </dialog>
  );
}

function ExportBody({
  doc,
  replayed,
  artworkUrl,
  details,
  onClose,
}: {
  doc: ComboDocument;
  replayed: ReplayResult;
  artworkUrl: (cardId: number) => string | undefined;
  details: ReactNode;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("png");
  const model = useMemo(() => buildExportModel(doc, replayed), [doc, replayed]);
  const slug = fileSlug(doc.title);
  return (
    <div className="export-body">
      <div className="dialog-title">
        <h2 id="export-title">Export Combo</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close export"
          onClick={onClose}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      {details}
      <div className="export-tabs" role="group" aria-label="Export format">
        {(
          [
            ["png", "PNG image"],
            ["text", "Text"],
            ["json", "JSON backup"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {model.warning && (
        <p className="form-error" role="alert">
          {model.warning}
        </p>
      )}
      {tab === "png" && (
        <PngTab model={model} slug={slug} artworkUrl={artworkUrl} />
      )}
      {tab === "text" && <TextTab model={model} slug={slug} />}
      {tab === "json" && (
        <div className="export-json">
          <p>
            A JSON backup keeps everything needed to edit the combo later: the
            starting board, every step, notes, card snapshots and the Skill
            text. Open it with <strong>Open → Import JSON</strong>.
          </p>
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              downloadText(
                serializeCombo(doc, new Date().toISOString()),
                `${slug}.json`,
                "application/json",
              )
            }
          >
            <Download size={16} aria-hidden="true" /> Download {slug}.json
          </button>
        </div>
      )}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-check">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

interface Preview {
  urls: string[];
  blobs: Blob[];
  sizes: Array<{ width: number; height: number }>;
}

function PngTab({
  model,
  slug,
  artworkUrl,
}: {
  model: ReturnType<typeof buildExportModel>;
  slug: string;
  artworkUrl: (cardId: number) => string | undefined;
}) {
  const [options, setOptions] = useState<PngOptions>(() =>
    readPreference(pngKey, defaultPngOptions),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const ids = {
    layout: useId(),
    theme: useId(),
    scale: useId(),
    thumb: useId(),
  };

  function update(change: Partial<PngOptions>) {
    const next = { ...options, ...change };
    setOptions(next);
    writePreference(pngKey, next);
  }

  // Regenerate after option changes. Stale renders are discarded and their URLs freed.
  useEffect(() => {
    let live = true;
    let created: string[] = [];
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      loadImages(modelCards(model), artworkUrl)
        .then((images) => renderPng(model, options, images))
        .then((pages) => {
          if (!live) return;
          created = pages.map((page) => URL.createObjectURL(page.blob));
          setPreview({
            urls: created,
            blobs: pages.map((page) => page.blob),
            sizes: pages.map(({ width, height }) => ({ width, height })),
          });
        })
        .catch((reason: unknown) => {
          if (live)
            setError(
              reason instanceof Error
                ? `The image could not be generated: ${reason.message}`
                : "The image could not be generated.",
            );
        })
        .finally(() => live && setBusy(false));
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [model, options, artworkUrl]);

  const pages = preview?.urls.length ?? 0;
  const name = (index: number) =>
    pages > 1 ? `${slug}-${index + 1}-of-${pages}.png` : `${slug}.png`;

  return (
    <div className="export-png">
      <form
        className="export-options"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="settings-fields">
          <label htmlFor={ids.layout}>
            Layout
            <select
              id={ids.layout}
              value={options.layout}
              onChange={(event) =>
                update({ layout: event.target.value as PngOptions["layout"] })
              }
            >
              <option value="vertical">Vertical guide</option>
              <option value="horizontal">Horizontal guide</option>
              <option value="endboard">Endboard only</option>
            </select>
          </label>
          <label htmlFor={ids.theme}>
            Theme
            <select
              id={ids.theme}
              value={options.theme}
              onChange={(event) =>
                update({ theme: event.target.value as PngOptions["theme"] })
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label htmlFor={ids.scale}>
            Resolution
            <select
              id={ids.scale}
              value={options.scale}
              onChange={(event) =>
                update({
                  scale: Number(event.target.value) as PngOptions["scale"],
                })
              }
            >
              <option value={2}>High (2×)</option>
              <option value={1}>Standard (1×)</option>
            </select>
          </label>
          <label htmlFor={ids.thumb}>
            Card size
            <select
              id={ids.thumb}
              value={options.thumb}
              onChange={(event) =>
                update({ thumb: event.target.value as PngOptions["thumb"] })
              }
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
        </div>
        <fieldset className="check-grid">
          <legend>Include</legend>
          {options.layout !== "endboard" && (
            <>
              <Check
                label="Starting hand"
                checked={options.startingHand}
                onChange={(startingHand) => update({ startingHand })}
              />
              <Check
                label="Step notes"
                checked={options.notes}
                onChange={(notes) => update({ notes })}
              />
              <Check
                label="Endboard"
                checked={options.endboard}
                onChange={(endboard) => update({ endboard })}
              />
            </>
          )}
          <Check
            label="Skill text"
            checked={options.skillText}
            onChange={(skillText) => update({ skillText })}
          />
          <Check
            label="Graveyard"
            checked={options.graveyard}
            onChange={(graveyard) => update({ graveyard })}
          />
          <Check
            label="Banished cards"
            checked={options.banished}
            onChange={(banished) => update({ banished })}
          />
          <Check
            label="Attribution"
            checked={options.attribution}
            onChange={(attribution) => update({ attribution })}
          />
        </fieldset>
      </form>
      <div className="export-preview">
        <p className="choice-empty" role="status">
          {busy
            ? "Generating preview…"
            : error
              ? ""
              : pages > 1
                ? `The combo is long, so it is split into ${pages} numbered images.`
                : "Preview ready."}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="preview-pages">
          {preview?.urls.map((url, index) => (
            <img
              key={url}
              src={url}
              width={preview.sizes[index]?.width}
              height={preview.sizes[index]?.height}
              alt={`Combo guide preview${pages > 1 ? `, image ${index + 1} of ${pages}` : ""}`}
            />
          ))}
        </div>
        <div className="dialog-actions">
          {preview?.blobs.map((blob, index) => (
            <button
              key={index}
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => downloadBlob(blob, name(index))}
            >
              <Download size={16} aria-hidden="true" />{" "}
              {pages > 1 ? `Image ${index + 1}` : "Download PNG"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TextTab({
  model,
  slug,
}: {
  model: ReturnType<typeof buildExportModel>;
  slug: string;
}) {
  const [options, setOptions] = useState<TextOptions>(() =>
    readPreference(textKey, defaultTextOptions),
  );
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const text = useMemo(() => comboText(model, options), [model, options]);
  const areaId = useId();

  function update(change: Partial<TextOptions>) {
    const next = { ...options, ...change };
    setOptions(next);
    writePreference(textKey, next);
    setStatus(null);
  }

  return (
    <div className="export-text">
      <fieldset className="check-grid">
        <legend>Options</legend>
        <Check
          label="Step notes"
          checked={options.notes}
          onChange={(notes) => update({ notes })}
        />
        <Check
          label="Compact"
          checked={options.compact}
          onChange={(compact) => update({ compact })}
        />
        <Check
          label="Discord formatting"
          checked={options.discord}
          onChange={(discord) => update({ discord })}
        />
        <Check
          label="Attribution"
          checked={options.attribution}
          onChange={(attribution) => update({ attribution })}
        />
      </fieldset>
      <label htmlFor={areaId} className="visually-hidden">
        Text export
      </label>
      <textarea
        id={areaId}
        className="text-preview"
        readOnly
        value={text}
        rows={14}
      />
      <p
        className={status && !status.ok ? "form-error" : "choice-empty"}
        role="status"
      >
        {status?.message ?? ""}
      </p>
      <div className="dialog-actions">
        <button
          type="button"
          className="subtle-button"
          onClick={async () => setStatus(await copyText(text))}
        >
          <Copy size={16} aria-hidden="true" /> Copy Text
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => downloadText(text, `${slug}.txt`, "text/plain")}
        >
          <Download size={16} aria-hidden="true" /> Download TXT
        </button>
      </div>
    </div>
  );
}
