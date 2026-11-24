import { useDroppable } from "@dnd-kit/core";
import {
  Ban,
  Box,
  ChevronDown,
  ChevronUp,
  Crown,
  Layers2,
  Settings2,
  Shield,
  Swords,
  Triangle,
} from "lucide-react";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { CardDefinition } from "../data/catalog";
import {
  cardsIn,
  getZone,
  materialsOf,
  sharedZones,
  zoneName,
} from "../domain/board";
import type { Board, Side, Zone, ZoneId } from "../domain/board";
import { BoardCard } from "./cards";

export interface BoardPanelProps {
  board: Board;
  library: ReadonlyMap<number, CardDefinition>;
  active: boolean;
  selectedZone?: ZoneId;
  selectedInstance?: number;
  placement: boolean;
  eligibility: ReadonlyMap<ZoneId, string | undefined>;
  onChoose: (zone: ZoneId, instance?: number) => void;
  onSettings: () => void;
  /** While recording, the hand shows the current hand rather than the opening hand. */
  recording: boolean;
}

const zoneIcons: Partial<Record<Zone["kind"], typeof Triangle>> = {
  "extra-deck": Layers2,
  deck: Box,
  field: Crown,
  graveyard: Shield,
  banished: Ban,
  hand: Layers2,
};

function DropZone({
  zone,
  board,
  library,
  selectedZone,
  selectedInstance,
  placement,
  eligibility,
  onChoose,
  compact = false,
}: {
  zone: Zone;
  compact?: boolean;
} & Pick<
  BoardPanelProps,
  | "board"
  | "library"
  | "selectedZone"
  | "selectedInstance"
  | "placement"
  | "eligibility"
  | "onChoose"
>) {
  const items = cardsIn(board, zone.id);
  const top = items.at(-1);
  const card = top ? library.get(top.definitionId) : undefined;
  const { setNodeRef, isOver } = useDroppable({
    id: zone.id,
    data: { zone: zone.id },
  });
  const eligible = placement && !eligibility.get(zone.id);
  const highlighted = selectedZone === zone.id;
  const Glyph = zoneIcons[zone.kind] ?? Triangle;

  return (
    <div
      className={`drop-zone ${compact ? "pile-zone" : "slot-zone"} ${eligible ? "target-ready" : ""} ${isOver ? (eligible ? "target-over" : "target-invalid") : ""} ${highlighted ? "zone-selected" : ""}`}
      ref={setNodeRef}
      data-zone={zone.id}
    >
      {zone.single && top && card ? (
        <>
          <BoardCard
            card={card}
            instance={top}
            selected={selectedInstance === top.id}
            onSelect={() => onChoose(zone.id, top.id)}
            materials={materialsOf(board, top.id).length}
          />
          <span className="occupied-label" aria-hidden="true">
            {zone.label}
          </span>
        </>
      ) : (
        <button
          type="button"
          className="zone-button"
          aria-label={zoneName(zone)}
          aria-description={zone.single ? undefined : `${items.length} cards`}
          aria-pressed={highlighted}
          onClick={() => onChoose(zone.id)}
        >
          {compact && <Glyph size={15} aria-hidden="true" />}
          <span>{zone.label.replace("/", "/​")}</span>
          {(!zone.single || zone.kind === "extra-monster") && (
            <small aria-hidden="true">
              {zone.single ? "Shared" : items.length}
            </small>
          )}
        </button>
      )}
    </div>
  );
}

type SlotRenderer = (zoneId: ZoneId, pile?: boolean) => ReactNode;

function SeatCaption({
  side,
  board,
  children,
}: {
  side: Side;
  board: Board;
  children?: ReactNode;
}) {
  return (
    <div className={`seat-caption ${side}-caption`}>
      <span className="seat-name">
        <i aria-hidden="true" />
        {side === "opponent" ? "Opponent" : "Player"}
        {board.active === side && <span className="active-mark">Active</span>}
      </span>
      {children}
      <div className="seat-life">
        <span>LP</span> <strong>{board.life[side].toLocaleString("en")}</strong>
      </div>
    </div>
  );
}

/**
 * Speed Duel mat order, seen from the player's seat. Field Zone and Extra Deck sit
 * left, the three Main Monster Zones over the three Spell & Trap Zones, and
 * Graveyard over Deck on the right with Banished above the Graveyard. The opponent's
 * half is the same mat turned 180°, so its zone 1 is on the player's right.
 */
function OpponentRows({
  slot,
  pendulum,
}: {
  slot: SlotRenderer;
  pendulum: boolean;
}) {
  return (
    <div className="field-group" role="group" aria-label="Opponent field">
      {pendulum && (
        <>
          {slot("opponent-pendulum-2", true)}
          <span className="field-spacer" aria-hidden="true" />
          {slot("opponent-pendulum-1", true)}
        </>
      )}
      {slot("opponent-deck", true)}
      {slot("opponent-spell-3")}
      {slot("opponent-spell-2")}
      {slot("opponent-spell-1")}
      {slot("opponent-extra-deck", true)}
      {slot("opponent-graveyard", true)}
      {slot("opponent-monster-3")}
      {slot("opponent-monster-2")}
      {slot("opponent-monster-1")}
      {slot("opponent-field", true)}
    </div>
  );
}

function PlayerRows({
  slot,
  pendulum,
}: {
  slot: SlotRenderer;
  pendulum: boolean;
}) {
  return (
    <div className="field-group" role="group" aria-label="Player field">
      {slot("player-field", true)}
      {slot("player-monster-1")}
      {slot("player-monster-2")}
      {slot("player-monster-3")}
      {slot("player-graveyard", true)}
      {slot("player-extra-deck", true)}
      {slot("player-spell-1")}
      {slot("player-spell-2")}
      {slot("player-spell-3")}
      {slot("player-deck", true)}
      {pendulum && (
        <>
          {slot("player-pendulum-1", true)}
          <span className="field-spacer" aria-hidden="true" />
          {slot("player-pendulum-2", true)}
        </>
      )}
    </div>
  );
}

function Hand({ props }: { props: BoardPanelProps }) {
  const { board, library, placement, eligibility, selectedInstance, onChoose } =
    props;
  const hand = cardsIn(board, "player-hand");
  const { setNodeRef, isOver } = useDroppable({
    id: "player-hand",
    data: { zone: "player-hand" },
  });
  const eligible = placement && !eligibility.get("player-hand");
  return (
    <section
      className={`hand-strip ${eligible ? "target-ready" : ""} ${isOver ? (eligible ? "target-over" : "target-invalid") : ""}`}
      ref={setNodeRef}
      data-zone="player-hand"
    >
      <div className="hand-heading">
        <button
          type="button"
          onClick={() => onChoose("player-hand")}
          className="hand-title"
          aria-label="Player Hand"
        >
          <Layers2 size={17} aria-hidden="true" />{" "}
          {props.recording ? "Hand" : "Opening Hand"}
        </button>
        <span>
          {props.recording
            ? `${hand.length} card${hand.length === 1 ? "" : "s"}`
            : `${hand.length} / ${board.handSize} cards`}
        </span>
      </div>
      <div className="hand-cards">
        {hand.map((instance) => {
          const card = library.get(instance.definitionId);
          return (
            card && (
              <BoardCard
                key={instance.id}
                card={card}
                instance={instance}
                selected={selectedInstance === instance.id}
                onSelect={() => onChoose("player-hand", instance.id)}
                compact
              />
            )
          );
        })}
        {Array.from(
          {
            length: props.recording
              ? 0
              : Math.max(0, Math.min(6, board.handSize - hand.length)),
          },
          (_, index) => (
            <span className="hand-empty" aria-hidden="true" key={index}>
              <Layers2 size={17} />
            </span>
          ),
        )}
        {!hand.length && !board.handSize && (
          <span className="hand-no-cards">Empty</span>
        )}
      </div>
    </section>
  );
}

export function BoardPanel(props: BoardPanelProps) {
  const [opponentVisible, setOpponentVisible] = useState(true);
  const { active, board, onSettings } = props;
  // Visible mat rows, so the card size can fit the whole mat in the viewport.
  const rows =
    3 +
    Number(board.pendulum.player) +
    (opponentVisible ? 2 + Number(board.pendulum.opponent) : 0);
  const slot: SlotRenderer = (zoneId, pile = false) => (
    <DropZone key={zoneId} {...props} zone={getZone(zoneId)} compact={pile} />
  );
  return (
    <section
      className={`board-panel ${active ? "mobile-active" : ""}`}
      aria-labelledby="board-title"
    >
      <div className="board-heading">
        <div className="board-heading-text">
          <span className="board-heading-icon">
            <Swords size={19} aria-hidden="true" />
          </span>
          <div>
            <h2 id="board-title" tabIndex={-1}>
              Duel Field
            </h2>
            <p>
              Turn {board.turn} · {board.phase} Phase
            </p>
          </div>
        </div>
        <div className="board-heading-controls">
          <button
            type="button"
            className="subtle-button"
            aria-expanded={opponentVisible}
            onClick={() => setOpponentVisible(!opponentVisible)}
          >
            {opponentVisible ? (
              <ChevronUp size={15} aria-hidden="true" />
            ) : (
              <ChevronDown size={15} aria-hidden="true" />
            )}
            {opponentVisible ? "Hide Opponent" : "Show Opponent"}
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Board settings"
            onClick={onSettings}
          >
            <Settings2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="playmat" style={{ "--rows": rows } as CSSProperties}>
        {opponentVisible && (
          <SeatCaption side="opponent" board={board}>
            <div className="opponent-hand">{slot("opponent-hand", true)}</div>
          </SeatCaption>
        )}
        <div className="field-grid">
          {opponentVisible && (
            <OpponentRows slot={slot} pendulum={board.pendulum.opponent} />
          )}
          {opponentVisible ? (
            slot("opponent-banished", true)
          ) : (
            <span className="field-spacer-cell" aria-hidden="true" />
          )}
          <div
            className="extra-monster-zones"
            role="group"
            aria-label="Shared Extra Monster Zones"
          >
            {sharedZones.map((zone) => (
              <DropZone key={zone.id} {...props} zone={zone} />
            ))}
          </div>
          {slot("player-banished", true)}
          <PlayerRows slot={slot} pendulum={board.pendulum.player} />
        </div>
        <SeatCaption side="player" board={board} />
      </div>
      <Hand props={props} />
    </section>
  );
}
