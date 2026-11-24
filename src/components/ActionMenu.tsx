import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { CardDefinition } from "../data/catalog";
import {
  buildMoveAction,
  describeAction,
  kindInfo,
  materialCandidates,
  suggestActions,
} from "../domain/actions";
import { getZone, zoneName } from "../domain/board";
import type { Board, Placement, ZoneId } from "../domain/board";
import { applyAction, withCards } from "../domain/combo";
import type { ActionKind, CardBook, ComboAction } from "../domain/combo";

export interface ActionRequest {
  source: Placement;
  card: CardDefinition;
  destination: ZoneId;
}

/**
 * Asks what a card movement means while recording. The same menu serves drag and
 * drop and the select-then-choose-zone flow, so neither path infers game semantics.
 */
/** In deck-aware mode a card from the browser can only enter play from outside the Deck. */
const outsideKinds: ReadonlySet<ActionKind> = new Set([
  "add-from-outside",
  "special-summon",
  "activate-card",
  "set-spell-trap",
  "custom",
]);

export function ActionMenu({
  request,
  board,
  cards,
  deckAware,
  onRecord,
  onCancel,
}: {
  request: ActionRequest | null;
  board: Board;
  cards: CardBook;
  deckAware: boolean;
  onRecord: (action: ComboAction, newCards: CardDefinition[]) => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (request && element && !element.open) element.showModal();
    if (!request && element?.open) element.close();
  }, [request]);

  return (
    <dialog
      ref={dialog}
      className="settings-dialog action-dialog"
      aria-labelledby="action-title"
      onClose={onCancel}
    >
      {request && (
        <ActionForm
          // A new request starts a fresh form.
          key={`${request.source.kind}-${request.source.kind === "catalog" ? request.source.definitionId : request.source.instanceId}-${request.destination}`}
          request={request}
          board={board}
          cards={cards}
          deckAware={deckAware}
          onRecord={onRecord}
          onCancel={() => dialog.current?.close()}
        />
      )}
    </dialog>
  );
}

function ActionForm({
  request,
  board,
  cards,
  deckAware,
  onRecord,
  onCancel,
}: {
  request: ActionRequest;
  board: Board;
  cards: CardBook;
  deckAware: boolean;
  onRecord: (action: ComboAction, newCards: CardDefinition[]) => void;
  onCancel: () => void;
}) {
  const { source, card, destination } = request;
  const book = useMemo(() => withCards(cards, [card]), [cards, card]);
  const options = useMemo(() => {
    const all = suggestActions(board, source, card, destination, book);
    return deckAware && source.kind === "catalog"
      ? all.filter((kind) => outsideKinds.has(kind))
      : all;
  }, [board, source, card, destination, book, deckAware]);
  const [kind, setKind] = useState<ActionKind>(options[0] ?? "custom");
  const [materials, setMaterials] = useState<number[]>([]);
  const [detail, setDetail] = useState("");
  const detailId = useId();
  const zone = getZone(destination);
  const handling = kindInfo[kind].materials;
  const sourceId = source.kind === "instance" ? source.instanceId : undefined;
  const candidates = handling
    ? materialCandidates(board, zone.side ?? board.active, sourceId)
    : [];

  const built = buildMoveAction({
    board,
    source,
    card,
    destination,
    kind,
    materials: handling ? materials : [],
    detail: kind === "custom" ? detail : undefined,
  });
  const result = built.ok
    ? applyAction(board, built.action, withCards(book, built.newCards))
    : built;
  const preview =
    built.ok && result.ok ? describeAction(built.action, board, book) : "";

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (built.ok && result.ok) onRecord(built.action, built.newCards);
  }

  return (
    <form onSubmit={submit} autoComplete="off">
      <div className="dialog-title">
        <div>
          <h2 id="action-title">Record Action</h2>
          <p className="dialog-subtitle">
            {card.name} → {zoneName(zone)}
          </p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cancel action"
          onClick={onCancel}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <fieldset className="choice-list">
        <legend>Action</legend>
        {options.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="action-kind"
              value={option}
              checked={kind === option}
              onChange={() => {
                setKind(option);
                setMaterials([]);
              }}
            />
            {kindInfo[option].label}
          </label>
        ))}
      </fieldset>
      {handling && (
        <fieldset className="choice-list">
          <legend>
            {handling === "attach"
              ? "Materials to attach"
              : "Materials sent to the Graveyard"}
          </legend>
          {candidates.length === 0 && (
            <p className="choice-empty">No cards available as materials.</p>
          )}
          {candidates.map((row) => (
            <label key={row.id}>
              <input
                type="checkbox"
                checked={materials.includes(row.id)}
                onChange={(event) =>
                  setMaterials(
                    event.target.checked
                      ? [...materials, row.id]
                      : materials.filter((id) => id !== row.id),
                  )
                }
              />
              <span>
                {book[String(row.definitionId)]?.name ?? "Unknown card"}
                <small>{zoneName(getZone(row.zone))}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {kind === "custom" && (
        <div className="settings-fields single">
          <label htmlFor={detailId}>
            Step description (optional)
            <input
              id={detailId}
              value={detail}
              maxLength={200}
              onChange={(event) => setDetail(event.target.value)}
            />
          </label>
        </div>
      )}
      {preview && (
        <p className="step-preview">
          <span>Step preview</span> {preview}
        </p>
      )}
      {!result.ok && (
        <p className="form-error" role="alert">
          {result.message}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="subtle-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary-button"
          disabled={!built.ok || !result.ok}
        >
          Record Step
        </button>
      </div>
    </form>
  );
}
