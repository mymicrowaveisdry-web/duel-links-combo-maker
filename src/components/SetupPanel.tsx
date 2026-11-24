import {
  ArrowUpRight,
  ClipboardList,
  Layers2,
  Move,
  Plus,
  Trash2,
} from "lucide-react";
import type { CardDefinition } from "../data/catalog";
import type { buildCardAction } from "../domain/actions";
import { cardsIn, getZone, materialsOf, zoneName } from "../domain/board";
import type { ActionKind } from "../domain/combo";
import type { ReactNode } from "react";
import type { Mode } from "../store";
import { CardActions } from "./CardActions";
import type {
  Board,
  CardInstance,
  Placement,
  Position,
  ZoneId,
} from "../domain/board";
import { CardFace, formatStat } from "./cards";

export type Selection = Placement | { kind: "zone"; zone: ZoneId };

export function SetupPanel({
  active,
  mode,
  tabs,
  deckTools,
  onRecordCard,
  board,
  selected,
  card,
  instance,
  pending,
  library,
  placementError,
  onSelect,
  onPlace,
  onPick,
  onCancel,
  onPose,
  onRemove,
}: {
  active: boolean;
  mode: Mode;
  tabs: ReactNode;
  deckTools: ReactNode;
  onRecordCard: (
    kind: ActionKind,
    options?: Parameters<typeof buildCardAction>[3],
  ) => void;
  board: Board;
  selected: Selection | null;
  card?: CardDefinition;
  instance?: CardInstance;
  pending: Placement | null;
  library: ReadonlyMap<number, CardDefinition>;
  placementError: (source: Placement, zone: ZoneId) => string | undefined;
  onSelect: (selection: Selection) => void;
  onPlace: (source: Placement, zone: ZoneId) => void;
  onPick: (source: Placement) => void;
  onCancel: () => void;
  onPose: (position: Position, faceUp: boolean) => void;
  onRemove: () => void;
}) {
  const zone = selected?.kind === "zone" ? getZone(selected.zone) : undefined;
  const instanceZone = instance ? getZone(instance.zone) : undefined;
  const selectedPlacement =
    selected?.kind === "catalog" || selected?.kind === "instance"
      ? selected
      : undefined;
  const monsterSlot =
    instanceZone?.kind === "monster" || instanceZone?.kind === "extra-monster";
  const link = card?.kinds.includes("Link");
  const recording = mode === "recording";
  const setup = mode === "setup";
  const materials = instance ? materialsOf(board, instance.id) : [];
  const stats = card
    ? ([
        ["ATK", card.attack],
        ["DEF", card.defense],
        ["Level", card.level],
        ["Rank", card.rank],
        ["Link", card.linkRating],
        ["Scale", card.scale],
      ] as const)
    : [];
  const summary = [
    ["player-hand", "Opening Hand"],
    ["player-deck", "Main Deck"],
    ["player-extra-deck", "Extra Deck"],
  ] as const;

  return (
    <aside
      className={`panel side-panel setup-panel ${active ? "mobile-active" : ""}`}
      aria-labelledby="setup-title"
    >
      {tabs}
      <div className="panel-heading">
        <h2 id="setup-title" tabIndex={-1}>
          {card ? "Card Details" : zone ? "Zone Details" : "Setup"}
        </h2>
        <span className="panel-heading-symbol">
          <ClipboardList size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="setup-scroll">
        {pending && (
          <div className="placement-callout" role="status">
            <Move size={17} aria-hidden="true" />
            <span>Choose a highlighted zone.</span>
            <button type="button" className="text-button" onClick={onCancel}>
              Cancel
            </button>
          </div>
        )}
        {card && selectedPlacement ? (
          <article className="inspector">
            <div className="inspect-heading">
              <div className="inspect-face">
                <CardFace card={card} instance={instance} />
              </div>
              <div>
                <h3>{card.name}</h3>
                <p>
                  {card.type}
                  {card.attribute ? ` · ${card.attribute}` : ""}
                </p>
                {instanceZone && (
                  <small>
                    Copy {instance?.id} · {zoneName(instanceZone)}
                  </small>
                )}
              </div>
            </div>
            {stats.some(([, value]) => value !== undefined) && (
              <dl className="card-stats">
                {stats.map(([label, value]) =>
                  value === undefined ? null : (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{formatStat(value)}</dd>
                    </div>
                  ),
                )}
              </dl>
            )}
            {instance &&
              (instance.markers?.length ||
                instance.counters ||
                instance.stats) && (
                <ul className="status-chips" aria-label="Card status">
                  {instance.markers?.map((marker) => (
                    <li key={marker}>{marker}</li>
                  ))}
                  {Object.entries(instance.counters ?? {}).map(
                    ([name, count]) => (
                      <li key={name}>
                        {count} {name} Counter{count === 1 ? "" : "s"}
                      </li>
                    ),
                  )}
                  {Object.entries(instance.stats ?? {}).map(([stat, value]) => (
                    <li key={stat}>
                      {stat === "attack"
                        ? "ATK"
                        : stat === "defense"
                          ? "DEF"
                          : stat[0]!.toUpperCase() + stat.slice(1)}{" "}
                      {value}
                    </li>
                  ))}
                </ul>
              )}
            {materials.length > 0 && (
              <div className="material-list">
                <h4>Xyz Materials ({materials.length})</h4>
                <ul>
                  {materials.map((row) => (
                    <li key={row.id}>
                      <span>
                        {library.get(row.definitionId)?.name ?? "Unknown card"}
                      </span>
                      {recording && (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            onRecordCard("detach-material", {
                              material: row.id,
                            })
                          }
                        >
                          Detach
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {card.description && (
              <p className="card-description">{card.description}</p>
            )}
            <div className="inspector-actions">
              {selectedPlacement.kind === "catalog" && (
                <>
                  <button
                    type="button"
                    className="primary-button full"
                    onClick={() => onPlace(selectedPlacement, "player-hand")}
                  >
                    <Plus size={16} aria-hidden="true" /> Add to Hand
                  </button>
                  <div className="deck-actions">
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() => onPlace(selectedPlacement, "player-deck")}
                    >
                      Main Deck
                    </button>
                    {!placementError(
                      selectedPlacement,
                      "player-extra-deck",
                    ) && (
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() =>
                          onPlace(selectedPlacement, "player-extra-deck")
                        }
                      >
                        Extra Deck
                      </button>
                    )}
                  </div>
                </>
              )}
              <button
                type="button"
                className={
                  selectedPlacement.kind === "instance"
                    ? "primary-button full"
                    : "subtle-button full"
                }
                onClick={() => onPick(selectedPlacement)}
              >
                <Move size={16} aria-hidden="true" />{" "}
                {instance ? "Move Card" : "Place on Board"}
              </button>
              {recording && instance && instanceZone && (
                <CardActions
                  instance={instance}
                  zone={instanceZone}
                  link={Boolean(link)}
                  onRecord={onRecordCard}
                />
              )}
              {setup &&
                instanceZone?.single &&
                instance &&
                !(monsterSlot && link) && (
                  <div className="deck-actions">
                    <button
                      type="button"
                      className="subtle-button"
                      onClick={() =>
                        onPose(instance.position, !instance.faceUp)
                      }
                    >
                      {instance.faceUp ? "Set Face-down" : "Flip Face-up"}
                    </button>
                    {monsterSlot && (
                      <button
                        type="button"
                        className="subtle-button"
                        onClick={() =>
                          onPose(
                            instance.position === "attack"
                              ? "defense"
                              : "attack",
                            instance.faceUp,
                          )
                        }
                      >
                        {instance.position === "attack" ? "Defense" : "Attack"}
                      </button>
                    )}
                  </div>
                )}
              {instance && mode !== "replay" && (
                <button
                  type="button"
                  className="remove-button"
                  onClick={onRemove}
                >
                  <Trash2 size={15} aria-hidden="true" />{" "}
                  {recording ? "Remove from the Duel" : "Remove Card"}
                </button>
              )}
            </div>
          </article>
        ) : zone ? (
          <div className="zone-inspector">
            <h3>{zoneName(zone)}</h3>
            {cardsIn(board, zone.id).length === 0 && (
              <p className="empty-zone-copy">This zone is empty.</p>
            )}
            {cardsIn(board, zone.id).map((row) => {
              const definition = library.get(row.definitionId);
              return (
                definition && (
                  <button
                    type="button"
                    key={row.id}
                    onClick={() =>
                      onSelect({ kind: "instance", instanceId: row.id })
                    }
                  >
                    <span>{definition.name}</span>
                    <small>Copy {row.id}</small>
                  </button>
                )
              );
            })}
          </div>
        ) : (
          <div className="inspect-empty">
            <span>
              <Layers2 size={23} aria-hidden="true" />
            </span>
            <p>Select a card to view its details or drag it onto the field.</p>
          </div>
        )}
        <div className="setup-summary">
          <h3>Starting State</h3>
          {summary.map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() => onSelect({ kind: "zone", zone: id })}
            >
              <span>{label}</span>
              <strong>{cardsIn(board, id).length}</strong>
              <ArrowUpRight size={15} aria-hidden="true" />
            </button>
          ))}
          {deckTools}
        </div>
      </div>
    </aside>
  );
}
