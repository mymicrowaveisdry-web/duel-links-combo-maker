import type { CardDefinition } from "../data/catalog";

export const sides = ["player", "opponent"] as const;
export type Side = (typeof sides)[number];
export const phases = ["Draw", "Standby", "Main", "Battle", "End"] as const;
export type Phase = (typeof phases)[number];
export type Position = "attack" | "defense";
type Slot = 1 | 2 | 3;
type Pair = 1 | 2;
type Pile = "hand" | "deck" | "extra-deck" | "graveyard" | "banished";
type PersonalZone =
  Pile | "field" | `monster-${Slot}` | `spell-${Slot}` | `pendulum-${Pair}`;
export type ZoneId = `${Side}-${PersonalZone}` | `shared-extra-${Pair}`;

type ZoneKind =
  Pile | "field" | "monster" | "spell" | "pendulum" | "extra-monster";
export interface Zone {
  id: ZoneId;
  label: string;
  kind: ZoneKind;
  side?: Side;
  single: boolean;
}

const piles: Array<[Pile, string]> = [
  ["hand", "Hand"],
  ["deck", "Main Deck"],
  ["extra-deck", "Extra Deck"],
  ["graveyard", "Graveyard"],
  ["banished", "Banished"],
];

export const sharedZones: Zone[] = ([1, 2] as const).map((slot) => ({
  id: `shared-extra-${slot}`,
  label: `Extra Monster ${slot}`,
  kind: "extra-monster",
  single: true,
}));
export const zones = [
  ...sides.flatMap((side): Zone[] => [
    ...piles.map(([kind, label]): Zone => ({
      id: `${side}-${kind}`,
      kind,
      label,
      side,
      single: false,
    })),
    {
      id: `${side}-field`,
      kind: "field",
      label: "Field Spell",
      side,
      single: true,
    },
    ...([1, 2, 3] as const).flatMap((slot): Zone[] => [
      {
        id: `${side}-monster-${slot}`,
        kind: "monster",
        label: `Monster ${slot}`,
        side,
        single: true,
      },
      {
        id: `${side}-spell-${slot}`,
        kind: "spell",
        label: `Spell/Trap ${slot}`,
        side,
        single: true,
      },
    ]),
    ...([1, 2] as const).map((slot): Zone => ({
      id: `${side}-pendulum-${slot}`,
      kind: "pendulum",
      label: `Pendulum ${slot}`,
      side,
      single: true,
    })),
  ]),
  ...sharedZones,
];

const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
export function getZone(id: ZoneId) {
  const zone = zoneById.get(id);
  if (!zone) throw new Error(`Unknown zone ${id}.`);
  return zone;
}

export function zoneName(zone: Zone) {
  return zone.side
    ? `${zone.side === "player" ? "Player" : "Opponent"} ${zone.label}`
    : `Shared ${zone.label}`;
}

export const statKeys = ["attack", "defense", "level", "rank"] as const;
export type StatKey = (typeof statKeys)[number];

export interface CardInstance {
  id: number;
  definitionId: number;
  owner: Side;
  controller: Side;
  zone: ZoneId;
  position: Position;
  faceUp: boolean;
  /** Parent instance when this card is an Xyz material. It shares the parent's zone. */
  attachedTo?: number;
  counters?: Record<string, number>;
  /** Manual stat values that replace the printed ones. */
  stats?: Partial<Record<StatKey, number>>;
  /** Manual status markers such as "Negated" or "Effect used". */
  markers?: string[];
}

export interface Board {
  instances: CardInstance[];
  nextId: number;
  handSize: number;
  life: Record<Side, number>;
  pendulum: Record<Side, boolean>;
  turn: number;
  active: Side;
  phase: Phase;
}

export function createBoard(): Board {
  return {
    instances: [],
    nextId: 1,
    handSize: 4,
    life: { player: 4000, opponent: 4000 },
    pendulum: { player: false, opponent: false },
    turn: 1,
    active: "player",
    phase: "Main",
  };
}

/** Cards in a zone in pile order (bottom first). Xyz materials are excluded. */
export function cardsIn(board: Board, zone: ZoneId) {
  return board.instances.filter(
    (instance) => instance.zone === zone && instance.attachedTo === undefined,
  );
}

/** Xyz materials attached to an instance, oldest first. */
export function materialsOf(board: Board, id: number) {
  return board.instances.filter(({ attachedTo }) => attachedTo === id);
}

export function isMonsterZone(zone: Zone) {
  return zone.kind === "monster" || zone.kind === "extra-monster";
}

export type Placement =
  | { kind: "catalog"; definitionId: number }
  | { kind: "instance"; instanceId: number };
export type BoardAction =
  | {
      type: "place";
      source: Placement;
      card: CardDefinition;
      destination: ZoneId;
    }
  | { type: "remove"; id: number }
  | {
      type: "pose";
      id: number;
      position: Position;
      faceUp: boolean;
      card: CardDefinition;
    }
  | {
      type: "settings";
      settings: Pick<
        Board,
        "life" | "turn" | "active" | "phase" | "handSize" | "pendulum"
      >;
    }
  | {
      /** Replaces the player's Main Deck and Extra Deck, as when importing a YDK file. */
      type: "load-deck";
      main: CardDefinition[];
      extra: CardDefinition[];
    }
  | { type: "reset" };

type Result =
  { ok: true; board: Board; message: string } | { ok: false; message: string };
const extraDeckKinds = ["Fusion", "Synchro", "Xyz", "Link", "Pendulum"];

export function canPlace(
  board: Board,
  source: Placement,
  card: CardDefinition,
  id: ZoneId,
): string | undefined {
  const zone = getZone(id);
  const instance =
    source.kind === "instance"
      ? board.instances.find(({ id }) => id === source.instanceId)
      : undefined;
  if (source.kind === "instance" && !instance)
    return "That card is no longer on the board.";
  if (
    (instance?.definitionId ??
      (source.kind === "catalog" ? source.definitionId : undefined)) !== card.id
  )
    return "The card definition does not match this selection.";
  if (instance?.zone === id && instance.attachedTo === undefined)
    return "The card is already in this zone.";
  if (zone.single && cardsIn(board, id).length)
    return `${zoneName(zone)} is occupied.`;
  return zoneRule(board, card, zone);
}

/** Card-type rules for a zone, independent of occupancy. */
export function zoneRule(
  board: Board,
  card: CardDefinition,
  zone: Zone,
): string | undefined {
  if (zone.kind === "pendulum" && zone.side && !board.pendulum[zone.side])
    return "Enable dedicated Pendulum Zones in board settings.";
  if (
    (zone.kind === "monster" || zone.kind === "extra-monster") &&
    card.category !== "Monster" &&
    card.category !== "Token"
  )
    return "Choose a Monster or Token for this zone.";
  if (
    zone.kind === "field" &&
    (card.category !== "Spell" || card.race !== "Field")
  )
    return "Choose a Field Spell for this zone.";
  if (zone.kind === "pendulum" && !card.kinds.includes("Pendulum"))
    return "Choose a Pendulum Monster for this zone.";
  if (
    zone.kind === "extra-deck" &&
    !extraDeckKinds.some((kind) => card.kinds.includes(kind))
  )
    return "Choose a Fusion, Synchro, Xyz, Link or Pendulum Monster.";
  return undefined;
}

export function applyBoardAction(board: Board, action: BoardAction): Result {
  switch (action.type) {
    case "place": {
      const { source, card, destination } = action;
      const reason = canPlace(board, source, card, destination);
      if (reason) return { ok: false, message: reason };
      const previous =
        source.kind === "instance"
          ? board.instances.find(({ id }) => id === source.instanceId)
          : undefined;
      const zone = getZone(destination);
      const previousZone = previous && getZone(previous.zone);
      const monsterKinds: ZoneKind[] = ["monster", "extra-monster"];
      const retainPose =
        zone.single &&
        previousZone &&
        (previousZone.kind === zone.kind ||
          (monsterKinds.includes(previousZone.kind) &&
            monsterKinds.includes(zone.kind)));
      const instance: CardInstance = {
        id: previous?.id ?? board.nextId,
        definitionId: card.id,
        owner: previous?.owner ?? zone.side ?? board.active,
        controller: zone.side ?? previous?.controller ?? board.active,
        zone: destination,
        position: retainPose && previous ? previous.position : "attack",
        faceUp: retainPose && previous ? previous.faceUp : true,
      };
      return {
        ok: true,
        board: {
          ...board,
          instances: [
            ...board.instances.filter(({ id }) => id !== instance.id),
            instance,
          ],
          nextId: board.nextId + (previous ? 0 : 1),
        },
        message: `${card.name} ${previous ? "moved to" : "added to"} ${zoneName(zone)}.`,
      };
    }
    case "remove": {
      // Removing a card also removes the materials attached to it.
      const instances = board.instances.filter(
        ({ id, attachedTo }) => id !== action.id && attachedTo !== action.id,
      );
      if (!board.instances.some(({ id }) => id === action.id))
        return { ok: false, message: "That card is no longer on the board." };
      return {
        ok: true,
        board: { ...board, instances },
        message: "Card removed.",
      };
    }
    case "pose": {
      const instance = board.instances.find(({ id }) => id === action.id);
      if (!instance || instance.definitionId !== action.card.id)
        return { ok: false, message: "Choose a card on the board." };
      const zone = getZone(instance.zone);
      const monsterZone =
        zone.kind === "monster" || zone.kind === "extra-monster";
      if (!zone.single || (action.position === "defense" && !monsterZone))
        return {
          ok: false,
          message: "That position is unavailable in this zone.",
        };
      if (
        monsterZone &&
        action.card.kinds.includes("Link") &&
        (action.position === "defense" || !action.faceUp)
      )
        return {
          ok: false,
          message: "Link Monsters stay face-up in Attack Position.",
        };
      const instances = board.instances.map((row) =>
        row.id === instance.id
          ? { ...row, position: action.position, faceUp: action.faceUp }
          : row,
      );
      return {
        ok: true,
        board: { ...board, instances },
        message: "Card position updated.",
      };
    }
    case "settings": {
      const { settings } = action;
      const whole = (value: number, min: number, max: number) =>
        Number.isInteger(value) && value >= min && value <= max;
      if (!sides.every((side) => whole(settings.life[side], 0, 999_999)))
        return {
          ok: false,
          message: "Life Points must be whole numbers between 0 and 999,999.",
        };
      if (!whole(settings.turn, 1, 999) || !whole(settings.handSize, 0, 20))
        return {
          ok: false,
          message: "Use turn 1–999 and an opening hand size of 0–20.",
        };
      if (
        board.instances.some(({ zone }) => {
          const target = getZone(zone);
          return (
            target.kind === "pendulum" &&
            target.side &&
            !settings.pendulum[target.side]
          );
        })
      )
        return {
          ok: false,
          message: "Empty the dedicated Pendulum Zones before disabling them.",
        };
      return {
        ok: true,
        board: { ...board, ...settings },
        message: "Board settings updated.",
      };
    }
    case "load-deck": {
      const extraZone = getZone("player-extra-deck");
      const wrong = action.extra.find((card) =>
        zoneRule(board, card, extraZone),
      );
      if (wrong)
        return {
          ok: false,
          message: `${wrong.name} cannot go in the Extra Deck.`,
        };
      let nextId = board.nextId;
      const make = (card: CardDefinition, zone: ZoneId): CardInstance => ({
        id: nextId++,
        definitionId: card.id,
        owner: "player",
        controller: "player",
        zone,
        position: "attack",
        faceUp: true,
      });
      const kept = board.instances.filter(
        ({ zone }) => zone !== "player-deck" && zone !== "player-extra-deck",
      );
      const instances = [
        ...kept,
        ...action.main.map((card) => make(card, "player-deck")),
        ...action.extra.map((card) => make(card, "player-extra-deck")),
      ];
      return {
        ok: true,
        board: { ...board, instances, nextId },
        message: `Loaded ${action.main.length} Main Deck and ${action.extra.length} Extra Deck cards.`,
      };
    }
    case "reset":
      return {
        ok: true,
        board: createBoard(),
        message: "Setup board cleared.",
      };
  }
}
