import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  Flag,
  Hand,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { CardDefinition } from "../data/catalog";
import { canDuplicate, describeAction } from "../domain/actions";
import { cardsIn, getZone, isMonsterZone } from "../domain/board";
import type { Board } from "../domain/board";
import type { ComboDocument, ComboStep, ReplayResult } from "../domain/combo";
import { CardThumb } from "./cards";

export interface TimelineHandlers {
  onView: (board: number) => void;
  onUpdate: (value: {
    id: string;
    customDescription?: string;
    notes?: string;
  }) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onTruncate: (index: number) => void;
}

function stepCard(
  step: ComboStep,
  before: Board | undefined,
  doc: ComboDocument,
): CardDefinition | undefined {
  const id = step.action.cards[0];
  if (id === undefined) return undefined;
  const definitionId =
    before?.instances.find((row) => row.id === id)?.definitionId ??
    step.action.operations.find(
      (operation): operation is Extract<typeof operation, { op: "create" }> =>
        operation.op === "create" && operation.id === id,
    )?.definitionId;
  return definitionId === undefined
    ? undefined
    : doc.cards[String(definitionId)];
}

/** The combo as a list: starting hand, numbered steps and the endboard. */
export function Timeline({
  active,
  tabs,
  doc,
  replayed,
  viewIndex,
  handlers,
}: {
  active: boolean;
  tabs: ReactNode;
  doc: ComboDocument;
  replayed: ReplayResult;
  /** Board being shown: 0 is the start, n is after step n. */
  viewIndex: number;
  handlers: TimelineHandlers;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmTruncate, setConfirmTruncate] = useState(false);
  const list = useRef<HTMLOListElement>(null);
  const failure = replayed.failure;
  const failIndex = failure && failure.index >= 0 ? failure.index : null;
  const start = doc.initialBoard;
  const final = replayed.boards.at(-1)!;
  const hand = cardsIn(start, "player-hand");

  // Keep the viewed entry visible, including newly recorded steps and playback.
  useEffect(() => {
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    list.current?.querySelector(`[data-board="${viewIndex}"]`)?.scrollIntoView({
      block: "nearest",
      behavior: reduce ? "auto" : "smooth",
    });
  }, [viewIndex, doc.steps.length]);

  const hiddenGroups = new Set(
    doc.steps
      .filter((step) => step.groupId && collapsed.has(step.groupId))
      .map(({ groupId }) => groupId!),
  );

  return (
    <aside
      className={`panel side-panel timeline-panel ${active ? "mobile-active" : ""}`}
      aria-labelledby="timeline-title"
    >
      {tabs}
      <div className="panel-heading">
        <h2 id="timeline-title" tabIndex={-1}>
          Combo Timeline
        </h2>
        <span className="panel-count">
          {doc.steps.length} step{doc.steps.length === 1 ? "" : "s"}
        </span>
      </div>
      {failIndex !== null && (
        <div className="repair-banner" role="alert">
          <p>
            <strong>Step {failIndex + 1} no longer applies.</strong>{" "}
            {failure!.message}
          </p>
          <div className="repair-actions">
            <button
              type="button"
              className="subtle-button"
              onClick={() => handlers.onDelete(doc.steps[failIndex]!.id)}
            >
              Delete step {failIndex + 1}
            </button>
            {confirmTruncate ? (
              <button
                type="button"
                className="remove-button"
                onClick={() => {
                  setConfirmTruncate(false);
                  handlers.onTruncate(failIndex);
                }}
              >
                Confirm: remove {doc.steps.length - failIndex} steps
              </button>
            ) : (
              <button
                type="button"
                className="subtle-button"
                onClick={() => setConfirmTruncate(true)}
              >
                Remove steps {failIndex + 1}–{doc.steps.length}
              </button>
            )}
          </div>
        </div>
      )}
      <ol className="timeline" ref={list}>
        <li data-board={0}>
          <button
            type="button"
            className="timeline-entry timeline-start"
            aria-current={viewIndex === 0 ? "step" : undefined}
            onClick={() => handlers.onView(0)}
          >
            <span className="entry-icon">
              <Hand size={16} aria-hidden="true" />
            </span>
            <span className="entry-body">
              <strong>Starting hand</strong>
              {hand.length ? (
                <span className="entry-thumbs">
                  {hand.map((row) => {
                    const card = doc.cards[String(row.definitionId)];
                    return card ? (
                      <CardThumb key={row.id} card={card} title={card.name} />
                    ) : null;
                  })}
                  <span className="visually-hidden">
                    {hand
                      .map(
                        (row) =>
                          doc.cards[String(row.definitionId)]?.name ??
                          "Unknown card",
                      )
                      .join(", ")}
                  </span>
                </span>
              ) : (
                <small>No cards in the opening hand.</small>
              )}
            </span>
          </button>
        </li>
        {doc.steps.map((step, index) => {
          const member = step.groupId && step.groupId !== step.id;
          if (member && hiddenGroups.has(step.groupId!)) return null;
          const head = step.groupId === step.id;
          const groupSize = head
            ? doc.steps.filter(({ groupId }) => groupId === step.id).length - 1
            : 0;
          const before = replayed.boards[index];
          const generated = before
            ? describeAction(step.action, before, doc.cards)
            : "Not replayed until the earlier step is repaired.";
          const text = step.customDescription ?? generated;
          const card = stepCard(step, before, doc);
          const selected = viewIndex === index + 1;
          const stale = failIndex !== null && index >= failIndex;
          return (
            <li
              key={step.id}
              data-board={index + 1}
              className={`${member ? "in-group" : ""} ${stale ? "stale" : ""}`}
            >
              <div className="timeline-row">
                {head && groupSize > 0 && (
                  <button
                    type="button"
                    className="group-toggle"
                    aria-expanded={!collapsed.has(step.id)}
                    aria-label={`${collapsed.has(step.id) ? "Expand" : "Collapse"} ${groupSize} grouped step${groupSize === 1 ? "" : "s"}`}
                    onClick={() => {
                      const next = new Set(collapsed);
                      if (next.has(step.id)) next.delete(step.id);
                      else next.add(step.id);
                      setCollapsed(next);
                    }}
                  >
                    {collapsed.has(step.id) ? (
                      <ChevronRight size={15} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={15} aria-hidden="true" />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  className="timeline-entry"
                  aria-current={selected ? "step" : undefined}
                  disabled={stale && failIndex !== index}
                  onClick={() => handlers.onView(index + 1)}
                >
                  <span className="step-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {step.action.kind === "activate-skill" ? (
                    <span className="entry-icon skill-icon">
                      <Sparkles size={16} aria-hidden="true" />
                    </span>
                  ) : card ? (
                    <CardThumb card={card} />
                  ) : (
                    <span className="entry-icon" aria-hidden="true" />
                  )}
                  <span className="entry-body">
                    <span>{text}</span>
                    {step.action.kind === "activate-skill" && (
                      <small className="entry-tag">Skill</small>
                    )}
                    {step.customDescription && (
                      <small className="entry-tag">Edited</small>
                    )}
                    {collapsed.has(step.id) && groupSize > 0 && (
                      <small className="entry-tag">+{groupSize} grouped</small>
                    )}
                    {stale && (
                      <small className="entry-tag entry-error">
                        {failIndex === index ? "Fails here" : "Needs repair"}
                      </small>
                    )}
                    {step.notes && (
                      <small className="entry-notes">{step.notes}</small>
                    )}
                  </span>
                </button>
              </div>
              {(selected || failIndex === index) && editing !== step.id && (
                <div
                  className="step-tools"
                  aria-label={`Step ${index + 1} tools`}
                  role="group"
                >
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Edit description and notes"
                    title="Edit description and notes"
                    onClick={() => setEditing(step.id)}
                  >
                    <Pencil size={15} aria-hidden="true" />
                  </button>
                  {canDuplicate(step.action) && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Duplicate step"
                      title="Duplicate step"
                      onClick={() => handlers.onDuplicate(step.id)}
                    >
                      <Copy size={15} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Move step up"
                    title="Move step up"
                    disabled={index === 0}
                    onClick={() => handlers.onMove(step.id, -1)}
                  >
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Move step down"
                    title="Move step down"
                    disabled={index === doc.steps.length - 1}
                    onClick={() => handlers.onMove(step.id, 1)}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label="Delete step"
                    title="Delete step"
                    onClick={() => handlers.onDelete(step.id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
              {editing === step.id && (
                <StepEditor
                  step={step}
                  generated={generated}
                  onSave={(value) => {
                    handlers.onUpdate({ id: step.id, ...value });
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="timeline-entry timeline-end"
            onClick={() => handlers.onView(replayed.boards.length - 1)}
          >
            <span className="entry-icon">
              <Flag size={16} aria-hidden="true" />
            </span>
            <span className="entry-body">
              <strong>Endboard</strong>
              <small>{endboardSummary(final)}</small>
            </span>
          </button>
        </li>
      </ol>
    </aside>
  );
}

function endboardSummary(board: Board) {
  const own = board.instances.filter(
    (row) => row.attachedTo === undefined && row.controller === "player",
  );
  const monsters = own.filter((row) => isMonsterZone(getZone(row.zone))).length;
  const backrow = own.filter((row) => {
    const kind = getZone(row.zone).kind;
    return kind === "spell" || kind === "field" || kind === "pendulum";
  }).length;
  const hand = cardsIn(board, "player-hand").length;
  const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? "" : "s"}`;
  return `${plural(monsters, "monster")}, ${plural(backrow, "Spell/Trap")}, ${plural(hand, "card")} in hand`;
}

function StepEditor({
  step,
  generated,
  onSave,
  onCancel,
}: {
  step: ComboStep;
  generated: string;
  onSave: (value: { customDescription?: string; notes?: string }) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(step.customDescription ?? "");
  const [notes, setNotes] = useState(step.notes ?? "");
  const ids = { description: useId(), notes: useId() };

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ customDescription: description, notes });
  }

  return (
    <form className="step-editor settings-fields single" onSubmit={submit}>
      <label htmlFor={ids.description}>
        Description
        <textarea
          id={ids.description}
          rows={2}
          maxLength={300}
          value={description}
          placeholder={generated}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <small className="editor-hint">
        Leave empty to use the generated text.
      </small>
      <label htmlFor={ids.notes}>
        Notes
        <textarea
          id={ids.notes}
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <div className="dialog-actions">
        <button type="button" className="subtle-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button">
          Save Step
        </button>
      </div>
    </form>
  );
}
