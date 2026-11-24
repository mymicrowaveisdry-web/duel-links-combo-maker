// Custom card editor (guide §8.6). Everything here is entered by the author, and the
// result is stored and displayed as a custom card, never as a dataset entry.
import { ImagePlus, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CardDefinition } from "../data/catalog";
import {
  attributes,
  buildCustomCard,
  draftOf,
  emptyDraft,
  importCardImage,
  monsterFrames,
  spellIcons,
  trapIcons,
} from "../data/custom-cards";
import type { CustomCardDraft } from "../data/custom-cards";

export function CustomCardDialog({
  open,
  card,
  newId,
  onSave,
  onDelete,
  onClose,
}: {
  open: boolean;
  /** The custom card being edited, or undefined for a new one. */
  card?: CardDefinition;
  newId: () => number;
  onSave: (card: CardDefinition) => void;
  onDelete: (card: CardDefinition) => void;
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
      className="settings-dialog custom-card-dialog"
      aria-labelledby="custom-card-title"
      onClose={onClose}
    >
      {open && (
        <CustomCardForm
          card={card}
          newId={newId}
          onSave={onSave}
          onDelete={onDelete}
          onCancel={() => dialog.current?.close()}
        />
      )}
    </dialog>
  );
}

function CustomCardForm({
  card,
  newId,
  onSave,
  onDelete,
  onCancel,
}: {
  card?: CardDefinition;
  newId: () => number;
  onSave: (card: CardDefinition) => void;
  onDelete: (card: CardDefinition) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CustomCardDraft>(() =>
    card ? draftOf(card) : emptyDraft,
  );
  const [error, setError] = useState("");
  const [imageState, setImageState] = useState<"idle" | "reading">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const hint = useId();
  const monster = draft.category === "Monster";
  const stats = monster || draft.category === "Token";
  const link = monster && draft.frame === "Link";
  const xyz = monster && draft.frame === "Xyz";
  const extraFrame = monster && !["Normal", "Effect"].includes(draft.frame);
  const icons = draft.category === "Spell" ? spellIcons : trapIcons;

  function set<Key extends keyof CustomCardDraft>(
    key: Key,
    value: CustomCardDraft[Key],
  ) {
    setDraft((existing) => ({ ...existing, [key]: value }));
    setError("");
  }

  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setImageState("reading");
    try {
      const image = await importCardImage(file);
      setDraft((existing) => ({ ...existing, image }));
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The image failed.",
      );
    } finally {
      setImageState("idle");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildCustomCard(draft, card?.id ?? newId());
    if (!result.ok) return setError(result.error);
    onSave(result.card);
  }

  return (
    <form onSubmit={save} autoComplete="off" noValidate>
      <div className="dialog-title">
        <h2 id="custom-card-title">
          {card ? "Edit Custom Card" : "New Custom Card"}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close custom card editor"
          onClick={onCancel}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <p className="dialog-hint" id={hint}>
        For cards missing from the dataset. The card is saved in this browser,
        marked as custom everywhere, and included in JSON backups of combos that
        use it.
      </p>
      <div className="custom-card-layout">
        <div className="custom-image">
          <span className="custom-image-frame">
            {draft.image ? (
              <img src={draft.image} alt="" width={168} height={246} />
            ) : (
              <span>No image</span>
            )}
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            hidden
            aria-label="Card image file"
            onChange={(event) => void chooseImage(event.target.files?.[0])}
          />
          <button
            type="button"
            className="subtle-button"
            disabled={imageState === "reading"}
            onClick={() => fileInput.current?.click()}
          >
            <ImagePlus size={15} aria-hidden="true" />
            {imageState === "reading"
              ? "Reading…"
              : draft.image
                ? "Replace Image"
                : "Add Image"}
          </button>
          {draft.image && (
            <button
              type="button"
              className="text-button"
              onClick={() => set("image", undefined)}
            >
              Remove Image
            </button>
          )}
        </div>
        <div className="settings-fields custom-fields">
          <label className="wide-field">
            Name
            <input
              name="custom-name"
              required
              maxLength={120}
              aria-describedby={hint}
              value={draft.name}
              onChange={(event) => set("name", event.target.value)}
            />
          </label>
          <label>
            Card type
            <select
              name="custom-category"
              value={draft.category}
              onChange={(event) =>
                set(
                  "category",
                  event.target.value as CustomCardDraft["category"],
                )
              }
            >
              <option>Monster</option>
              <option>Spell</option>
              <option>Trap</option>
              <option>Token</option>
            </select>
          </label>
          {monster && (
            <label>
              Monster card
              <select
                name="custom-frame"
                value={draft.frame}
                onChange={(event) =>
                  set("frame", event.target.value as CustomCardDraft["frame"])
                }
              >
                {monsterFrames.map((frame) => (
                  <option key={frame}>{frame}</option>
                ))}
              </select>
            </label>
          )}
          {(draft.category === "Spell" || draft.category === "Trap") && (
            <label>
              {draft.category} type
              <select
                name="custom-icon"
                value={
                  icons.includes(draft.icon as never) ? draft.icon : "Normal"
                }
                onChange={(event) => set("icon", event.target.value)}
              >
                {icons.map((icon) => (
                  <option key={icon}>{icon}</option>
                ))}
              </select>
            </label>
          )}
          {monster && (
            <fieldset className="wide-field custom-flags">
              <legend className="sr-only">Monster abilities</legend>
              {extraFrame && (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.effect}
                    onChange={(event) => set("effect", event.target.checked)}
                  />
                  Effect
                </label>
              )}
              {!link && (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.pendulum}
                    onChange={(event) => set("pendulum", event.target.checked)}
                  />
                  Pendulum
                </label>
              )}
              <label>
                <input
                  type="checkbox"
                  checked={draft.tuner}
                  onChange={(event) => set("tuner", event.target.checked)}
                />
                Tuner
              </label>
            </fieldset>
          )}
          {stats && (
            <>
              <label>
                Attribute
                <select
                  name="custom-attribute"
                  value={draft.attribute}
                  onChange={(event) => set("attribute", event.target.value)}
                >
                  <option value="">Not specified</option>
                  {attributes.map((attribute) => (
                    <option key={attribute}>{attribute}</option>
                  ))}
                </select>
              </label>
              <label>
                Monster type
                <input
                  name="custom-race"
                  maxLength={40}
                  placeholder="e.g. Spellcaster…"
                  value={draft.race}
                  onChange={(event) => set("race", event.target.value)}
                />
              </label>
              <label>
                {link ? "Link Rating" : xyz ? "Rank" : "Level"}
                <input
                  name="custom-rating"
                  inputMode="numeric"
                  value={draft.rating}
                  onChange={(event) => set("rating", event.target.value)}
                />
              </label>
              {monster && draft.pendulum && !link && (
                <label>
                  Pendulum Scale
                  <input
                    name="custom-scale"
                    inputMode="numeric"
                    value={draft.scale}
                    onChange={(event) => set("scale", event.target.value)}
                  />
                </label>
              )}
              <label>
                ATK
                <input
                  name="custom-atk"
                  inputMode="numeric"
                  placeholder="? allowed"
                  value={draft.attack}
                  onChange={(event) => set("attack", event.target.value)}
                />
              </label>
              {!link && (
                <label>
                  DEF
                  <input
                    name="custom-def"
                    inputMode="numeric"
                    placeholder="? allowed"
                    value={draft.defense}
                    onChange={(event) => set("defense", event.target.value)}
                  />
                </label>
              )}
            </>
          )}
          <label className="wide-field">
            Card text
            <textarea
              name="custom-description"
              rows={4}
              maxLength={5000}
              value={draft.description}
              onChange={(event) => set("description", event.target.value)}
            />
          </label>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        {card &&
          (confirmDelete ? (
            <span className="confirm-delete" role="group">
              <span>Delete from your library?</span>
              <button
                type="button"
                className="danger-button"
                onClick={() => onDelete(card)}
              >
                Delete
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="text-button delete-custom"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} aria-hidden="true" />
              Delete Card
            </button>
          ))}
        <button type="button" className="subtle-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-button"
          disabled={imageState === "reading"}
        >
          {card ? "Save Changes" : "Create Card"}
        </button>
      </div>
    </form>
  );
}
