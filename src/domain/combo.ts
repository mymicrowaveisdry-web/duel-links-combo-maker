// Combo state engine. Pure and framework-independent: no React, DOM, clock or
// randomness. A combo is a starting board plus an ordered list of typed actions.
// Every board after the start is derived by replaying those actions.
import type { CardDefinition } from "../data/catalog";
import {
  getZone,
  isMonsterZone,
  materialsOf,
  phases,
  sides,
  zoneName,
  zoneRule,
} from "./board";
import type {
  Board,
  CardInstance,
  Phase,
  Position,
  Side,
  StatKey,
  ZoneId,
} from "./board";

export const comboSchemaVersion = 1;
const maximumLife = 999_999;

/** Definition snapshots keyed by passcode, so replay never needs the live catalog. */
export type CardBook = Readonly<Record<string, CardDefinition>>;

/** Structural board changes. A semantic action is made of one or more of these. */
export type Operation =
  | {
      op: "create";
      /** Instance ID chosen at authoring time, so replay stays deterministic. */
      id: number;
      definitionId: number;
      zone: ZoneId;
      owner: Side;
      position?: Position;
      faceUp?: boolean;
      at?: "top" | "bottom";
    }
  | {
      op: "move";
      id: number;
      zone: ZoneId;
      position?: Position;
      faceUp?: boolean;
      at?: "top" | "bottom";
    }
  | { op: "attach"; id: number; to: number }
  | { op: "pose"; id: number; position: Position; faceUp: boolean }
  | { op: "control"; id: number; side: Side }
  | { op: "counter"; id: number; counter: string; delta: number }
  | { op: "stat"; id: number; stat: StatKey; value: number | null }
  | { op: "marker"; id: number; marker: string; active: boolean }
  | { op: "remove"; id: number }
  | { op: "life"; side: Side; value: number }
  | { op: "duel"; turn?: number; active?: Side; phase?: Phase };

export const actionKinds = [
  "normal-summon",
  "tribute-summon",
  "special-summon",
  "ritual-summon",
  "fusion-summon",
  "synchro-summon",
  "xyz-summon",
  "link-summon",
  "pendulum-summon",
  "flip-summon",
  "set-monster",
  "draw",
  "search",
  "add-to-hand",
  "add-from-outside",
  "discard",
  "send-to-graveyard",
  "destroy",
  "banish",
  "banish-face-down",
  "return-to-hand",
  "return-to-deck",
  "shuffle-into-deck",
  "place-top",
  "place-bottom",
  "return-to-extra-deck",
  "set-spell-trap",
  "activate-card",
  "activate-effect",
  "pay-cost",
  "target",
  "resolve",
  "negate-activation",
  "negate-effect",
  "opponent-interruption",
  "attach-material",
  "detach-material",
  "change-position",
  "flip-face-up",
  "flip-face-down",
  "add-counter",
  "remove-counter",
  "modify-stat",
  "change-control",
  "mark-negated",
  "mark-used",
  "custom-marker",
  "change-life",
  "change-phase",
  "next-turn",
  "activate-skill",
  "note",
  "move-zone",
  "remove-card",
  "custom",
] as const;
export type ActionKind = (typeof actionKinds)[number];

/**
 * A Skill as it read when the combo was written. Storing the text keeps old combos
 * understandable after a Skill is reworded or a dataset changes.
 */
export interface SkillSnapshot {
  id?: string;
  name: string;
  description?: string;
  /** Where the text came from: the bundled snapshot, the author, or nothing. */
  origin: "dataset" | "custom" | "unspecified";
  sourceName?: string;
  sourceUrl?: string;
  /** When the snapshot was taken, as an ISO date-time. */
  capturedAt?: string;
}

/** The character is free text. The bundled data has no character list. */
export interface CharacterSnapshot {
  name: string;
}

export interface ComboAction {
  kind: ActionKind;
  /** Instance IDs the action is about. The first one is the main card. */
  cards: number[];
  /** Material instance IDs for summons and attachments. */
  materials?: number[];
  operations: Operation[];
  /** Free text for custom actions, notes and markers. */
  detail?: string;
  skill?: SkillSnapshot;
}

export interface ComboStep {
  id: string;
  action: ComboAction;
  customDescription?: string;
  notes?: string;
  /** ID of the step that opened this step's group, such as a Skill activation. */
  groupId?: string;
}

export interface ComboDocument {
  schemaVersion: typeof comboSchemaVersion;
  id: string;
  title: string;
  format: "speed-duel";
  character?: CharacterSnapshot;
  skill?: SkillSnapshot;
  initialBoard: Board;
  steps: ComboStep[];
  cards: CardBook;
  createdAt: string;
  updatedAt: string;
}

export type EngineResult =
  { ok: true; board: Board } | { ok: false; message: string };

const fail = (message: string): EngineResult => ({ ok: false, message });

function cardOf(cards: CardBook, definitionId: number) {
  return cards[String(definitionId)];
}

function place(
  instances: CardInstance[],
  instance: CardInstance,
  at: "top" | "bottom" = "top",
) {
  const rest = instances.filter(({ id }) => id !== instance.id);
  return at === "bottom" ? [instance, ...rest] : [...rest, instance];
}

function update(
  board: Board,
  id: number,
  change: (instance: CardInstance) => CardInstance,
): Board {
  return {
    ...board,
    instances: board.instances.map((row) =>
      row.id === id ? change(row) : row,
    ),
  };
}

/** Applies one structural operation. Occupancy and card rules are checked afterwards. */
export function applyOperation(
  board: Board,
  operation: Operation,
  cards: CardBook,
): EngineResult {
  const find = (id: number) => board.instances.find((row) => row.id === id);
  const missing = (id: number) => fail(`Card copy ${id} is not on the board.`);

  switch (operation.op) {
    case "create": {
      if (find(operation.id))
        return fail(`Card copy ${operation.id} already exists.`);
      if (!Number.isInteger(operation.id) || operation.id < 1)
        return fail("New card copies need a positive whole-number ID.");
      if (!cardOf(cards, operation.definitionId))
        return fail(`Card ${operation.definitionId} has no saved definition.`);
      const zone = getZone(operation.zone);
      const instance: CardInstance = {
        id: operation.id,
        definitionId: operation.definitionId,
        owner: operation.owner,
        controller: zone.side ?? operation.owner,
        zone: operation.zone,
        position: operation.position ?? "attack",
        faceUp: operation.faceUp ?? true,
      };
      return {
        ok: true,
        board: {
          ...board,
          instances: place(board.instances, instance, operation.at),
          nextId: Math.max(board.nextId, operation.id + 1),
        },
      };
    }
    case "move": {
      const previous = find(operation.id);
      if (!previous) return missing(operation.id);
      const zone = getZone(operation.zone);
      const from = getZone(previous.zone);
      // Moving between monster zones keeps the battle position unless told otherwise.
      const keepPose =
        previous.attachedTo === undefined &&
        zone.single &&
        (from.kind === zone.kind ||
          (isMonsterZone(from) && isMonsterZone(zone)));
      const instance: CardInstance = {
        ...previous,
        zone: operation.zone,
        controller: zone.side ?? previous.controller,
        position:
          operation.position ?? (keepPose ? previous.position : "attack"),
        faceUp: operation.faceUp ?? (keepPose ? previous.faceUp : true),
        attachedTo: undefined,
        // Leaving the field clears manual stats, counters and markers.
        ...(zone.single
          ? {}
          : { counters: undefined, stats: undefined, markers: undefined }),
      };
      return {
        ok: true,
        board: {
          ...board,
          instances: place(board.instances, instance, operation.at),
        },
      };
    }
    case "attach": {
      const material = find(operation.id);
      const parent = find(operation.to);
      if (!material) return missing(operation.id);
      if (!parent) return missing(operation.to);
      if (material.id === parent.id)
        return fail("A card cannot be attached to itself.");
      if (parent.attachedTo !== undefined)
        return fail("Materials cannot have materials of their own.");
      if (materialsOf(board, material.id).length)
        return fail(
          "Detach or transfer this card's materials before attaching it.",
        );
      const instance: CardInstance = {
        ...material,
        attachedTo: parent.id,
        zone: parent.zone,
        controller: parent.controller,
        position: "attack",
        faceUp: true,
        counters: undefined,
        stats: undefined,
        markers: undefined,
      };
      return {
        ok: true,
        board: { ...board, instances: place(board.instances, instance) },
      };
    }
    case "pose": {
      if (!find(operation.id)) return missing(operation.id);
      return {
        ok: true,
        board: update(board, operation.id, (row) => ({
          ...row,
          position: operation.position,
          faceUp: operation.faceUp,
        })),
      };
    }
    case "control": {
      if (!find(operation.id)) return missing(operation.id);
      return {
        ok: true,
        board: update(board, operation.id, (row) => ({
          ...row,
          controller: operation.side,
        })),
      };
    }
    case "counter": {
      const row = find(operation.id);
      if (!row) return missing(operation.id);
      const name = operation.counter.trim();
      if (!name) return fail("Name the counter.");
      const count = (row.counters?.[name] ?? 0) + operation.delta;
      if (!Number.isInteger(operation.delta) || count < 0)
        return fail("A card cannot have fewer than zero counters.");
      const counters = { ...row.counters, [name]: count };
      if (!count) delete counters[name];
      return {
        ok: true,
        board: update(board, operation.id, (card) => ({
          ...card,
          counters: Object.keys(counters).length ? counters : undefined,
        })),
      };
    }
    case "stat": {
      const row = find(operation.id);
      if (!row) return missing(operation.id);
      if (
        operation.value !== null &&
        (!Number.isInteger(operation.value) ||
          operation.value < 0 ||
          operation.value > 99_999)
      )
        return fail("Stats must be whole numbers from 0 to 99,999.");
      const stats = { ...row.stats };
      if (operation.value === null) delete stats[operation.stat];
      else stats[operation.stat] = operation.value;
      return {
        ok: true,
        board: update(board, operation.id, (card) => ({
          ...card,
          stats: Object.keys(stats).length ? stats : undefined,
        })),
      };
    }
    case "marker": {
      const row = find(operation.id);
      if (!row) return missing(operation.id);
      const marker = operation.marker.trim();
      if (!marker) return fail("Name the marker.");
      const markers = (row.markers ?? []).filter((item) => item !== marker);
      if (operation.active) markers.push(marker);
      return {
        ok: true,
        board: update(board, operation.id, (card) => ({
          ...card,
          markers: markers.length ? markers : undefined,
        })),
      };
    }
    case "remove": {
      if (!find(operation.id)) return missing(operation.id);
      return {
        ok: true,
        board: {
          ...board,
          instances: board.instances.filter(({ id }) => id !== operation.id),
        },
      };
    }
    case "life": {
      if (
        !Number.isInteger(operation.value) ||
        operation.value < 0 ||
        operation.value > maximumLife
      )
        return fail("Life Points must be whole numbers from 0 to 999,999.");
      return {
        ok: true,
        board: {
          ...board,
          life: { ...board.life, [operation.side]: operation.value },
        },
      };
    }
    case "duel": {
      const { turn, active, phase } = operation;
      if (
        turn !== undefined &&
        (!Number.isInteger(turn) || turn < 1 || turn > 999)
      )
        return fail("Use a turn from 1 to 999.");
      if (phase !== undefined && !phases.includes(phase))
        return fail("Unknown phase.");
      if (active !== undefined && !sides.includes(active))
        return fail("Unknown side.");
      return {
        ok: true,
        board: {
          ...board,
          turn: turn ?? board.turn,
          active: active ?? board.active,
          phase: phase ?? board.phase,
        },
      };
    }
  }
}

/**
 * Structural invariants that every board must satisfy. These do not check card-effect
 * legality, which stays with the author.
 */
export function validateBoard(
  board: Board,
  cards: CardBook,
): string | undefined {
  const ids = new Set<number>();
  const occupied = new Map<ZoneId, number>();
  for (const row of board.instances) {
    if (ids.has(row.id)) return `Card copy ${row.id} appears twice.`;
    ids.add(row.id);
    if (row.id >= board.nextId)
      return `Card copy ${row.id} is newer than the next free ID.`;
    if (!sides.includes(row.owner) || !sides.includes(row.controller))
      return `Card copy ${row.id} has an unknown owner or controller.`;
    const card = cardOf(cards, row.definitionId);
    if (!card) return `Card ${row.definitionId} has no saved definition.`;
    const zone = getZone(row.zone);
    if (row.attachedTo !== undefined) {
      const parent = board.instances.find(({ id }) => id === row.attachedTo);
      if (!parent) return `${card.name} is attached to a missing card.`;
      if (parent.attachedTo !== undefined)
        return `${card.name} is attached to another material.`;
      if (!isMonsterZone(getZone(parent.zone)))
        return `${card.name} is a material of a card that left the field. Move or detach it in the same step.`;
      if (row.zone !== parent.zone)
        return `${card.name} is separated from the card it is attached to.`;
      continue;
    }
    if (zone.single) {
      const holder = occupied.get(row.zone);
      if (holder !== undefined)
        return `${zoneName(zone)} holds more than one card.`;
      occupied.set(row.zone, row.id);
    }
    const rule = zoneRule(board, card, zone);
    if (rule) return `${card.name}: ${rule}`;
    if (
      isMonsterZone(zone) &&
      card.kinds.includes("Link") &&
      (row.position === "defense" || !row.faceUp)
    )
      return `${card.name}: Link Monsters stay face-up in Attack Position.`;
    if (row.position === "defense" && !isMonsterZone(zone))
      return `${card.name}: Defense Position is only possible in a Monster Zone.`;
  }
  for (const side of sides) {
    const life = board.life[side];
    if (!Number.isInteger(life) || life < 0 || life > maximumLife)
      return "Life Points must be whole numbers from 0 to 999,999.";
  }
  return undefined;
}

/** Keeps every material in its parent's zone and under its parent's control. */
function syncMaterials(board: Board): Board {
  const parents = new Map(board.instances.map((row) => [row.id, row]));
  let changed = false;
  const instances = board.instances.map((row) => {
    const parent =
      row.attachedTo === undefined ? undefined : parents.get(row.attachedTo);
    if (
      !parent ||
      (row.zone === parent.zone && row.controller === parent.controller)
    )
      return row;
    changed = true;
    return { ...row, zone: parent.zone, controller: parent.controller };
  });
  return changed ? { ...board, instances } : board;
}

/**
 * Applies an action atomically: either every operation succeeds and the result passes
 * the invariants, or the original board is kept and an error is returned.
 */
export function applyAction(
  board: Board,
  action: ComboAction,
  cards: CardBook,
): EngineResult {
  let next = board;
  for (const operation of action.operations) {
    const result = applyOperation(next, operation, cards);
    if (!result.ok) return result;
    next = result.board;
  }
  next = syncMaterials(next);
  const problem = validateBoard(next, cards);
  return problem ? fail(problem) : { ok: true, board: next };
}

export interface ReplayResult {
  /** boards[0] is the starting board. boards[i + 1] follows step i. */
  boards: Board[];
  /** The first step that no longer applies, if any. Later steps are not replayed. */
  failure?: { index: number; stepId: string; message: string };
}

/** Rebuilds every board from the starting board. The same document always gives the same result. */
export function replay(document: ComboDocument): ReplayResult {
  const boards = [document.initialBoard];
  const start = validateBoard(document.initialBoard, document.cards);
  if (start)
    return {
      boards,
      failure: {
        index: -1,
        stepId: "",
        message: `Starting board: ${start}`,
      },
    };
  for (const [index, step] of document.steps.entries()) {
    const result = applyAction(boards[index]!, step.action, document.cards);
    if (!result.ok)
      return {
        boards,
        failure: { index, stepId: step.id, message: result.message },
      };
    boards.push(result.board);
  }
  return { boards };
}

export function createComboDocument(
  id: string,
  now: string,
  initialBoard: Board,
): ComboDocument {
  return {
    schemaVersion: comboSchemaVersion,
    id,
    title: "Untitled combo",
    format: "speed-duel",
    initialBoard,
    steps: [],
    cards: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Adds definition snapshots for the given cards. Existing snapshots are kept. */
export function withCards(
  book: CardBook,
  definitions: readonly CardDefinition[],
): CardBook {
  const missing = definitions.filter((card) => !book[String(card.id)]);
  if (!missing.length) return book;
  return {
    ...book,
    ...Object.fromEntries(missing.map((card) => [String(card.id), card])),
  };
}
