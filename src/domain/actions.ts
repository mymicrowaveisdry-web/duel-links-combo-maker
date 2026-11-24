// Semantic combo actions: what the action menu offers, how a choice becomes typed
// operations, and how a recorded action is described. All functions are pure.
import type { CardDefinition } from "../data/catalog";
import {
  canPlace,
  getZone,
  isMonsterZone,
  materialsOf,
  zoneName,
  zoneRule,
} from "./board";
import type {
  Board,
  CardInstance,
  Placement,
  Side,
  StatKey,
  ZoneId,
} from "./board";
import type { ActionKind, CardBook, ComboAction, Operation } from "./combo";

interface KindInfo {
  label: string;
  /** Material handling for summons: sent to the Graveyard or attached. */
  materials?: "graveyard" | "attach";
  /** Following steps are grouped under this one until the group is closed. */
  opensGroup?: boolean;
  /** Recording this closes the open group first. */
  closesGroup?: boolean;
}

export const kindInfo: Record<ActionKind, KindInfo> = {
  "normal-summon": { label: "Normal Summon", closesGroup: true },
  "tribute-summon": {
    label: "Tribute Summon",
    materials: "graveyard",
    closesGroup: true,
  },
  "special-summon": { label: "Special Summon" },
  "ritual-summon": { label: "Ritual Summon", materials: "graveyard" },
  "fusion-summon": { label: "Fusion Summon", materials: "graveyard" },
  "synchro-summon": {
    label: "Synchro Summon",
    materials: "graveyard",
    closesGroup: true,
  },
  "xyz-summon": { label: "Xyz Summon", materials: "attach", closesGroup: true },
  "link-summon": {
    label: "Link Summon",
    materials: "graveyard",
    closesGroup: true,
  },
  "pendulum-summon": { label: "Pendulum Summon", closesGroup: true },
  "flip-summon": { label: "Flip Summon", closesGroup: true },
  "set-monster": { label: "Set Monster", closesGroup: true },
  draw: { label: "Draw" },
  search: { label: "Search from Deck" },
  "add-to-hand": { label: "Add to hand" },
  "add-from-outside": { label: "Add from outside the Deck" },
  discard: { label: "Discard" },
  "send-to-graveyard": { label: "Send to Graveyard" },
  destroy: { label: "Destroy" },
  banish: { label: "Banish" },
  "banish-face-down": { label: "Banish face-down" },
  "return-to-hand": { label: "Return to hand" },
  "return-to-deck": { label: "Return to Deck" },
  "shuffle-into-deck": { label: "Shuffle into Deck" },
  "place-top": { label: "Place on top of Deck" },
  "place-bottom": { label: "Place on bottom of Deck" },
  "return-to-extra-deck": { label: "Return to Extra Deck" },
  "set-spell-trap": { label: "Set Spell/Trap", closesGroup: true },
  "activate-card": { label: "Activate card", opensGroup: true },
  "activate-effect": { label: "Activate effect", opensGroup: true },
  "pay-cost": { label: "Pay cost" },
  target: { label: "Target" },
  resolve: { label: "Effect resolves" },
  "negate-activation": { label: "Negate activation" },
  "negate-effect": { label: "Negate effect" },
  "opponent-interruption": { label: "Opponent interruption" },
  "attach-material": { label: "Attach as Xyz material" },
  "detach-material": { label: "Detach material" },
  "change-position": { label: "Change battle position" },
  "flip-face-up": { label: "Flip face-up" },
  "flip-face-down": { label: "Turn face-down" },
  "add-counter": { label: "Add counter" },
  "remove-counter": { label: "Remove counter" },
  "modify-stat": { label: "Modify stat" },
  "change-control": { label: "Change control" },
  "mark-negated": { label: "Mark as negated" },
  "mark-used": { label: "Mark effect as used" },
  "custom-marker": { label: "Add status marker" },
  "change-life": { label: "Change Life Points" },
  "change-phase": { label: "Change phase", closesGroup: true },
  "next-turn": { label: "End turn", closesGroup: true },
  "activate-skill": { label: "Activate Skill", opensGroup: true },
  note: { label: "Note" },
  "move-zone": { label: "Move to another zone" },
  "remove-card": { label: "Remove from the duel" },
  custom: { label: "Custom move" },
};

const extraSummons: Array<[string, ActionKind]> = [
  ["Fusion", "fusion-summon"],
  ["Synchro", "synchro-summon"],
  ["Xyz", "xyz-summon"],
  ["Link", "link-summon"],
];

type Origin = ReturnType<typeof getZone>["kind"] | "outside";

function originOf(board: Board, source: Placement): Origin {
  if (source.kind === "catalog") return "outside";
  const instance = board.instances.find(({ id }) => id === source.instanceId);
  return instance ? getZone(instance.zone).kind : "outside";
}

function occupantOf(board: Board, zone: ZoneId) {
  return board.instances.find(
    (row) => row.zone === zone && row.attachedTo === undefined,
  );
}

/**
 * Plausible semantic actions for moving a card to a zone, most likely first. The
 * author chooses; the app never infers game meaning from the movement alone.
 */
export function suggestActions(
  board: Board,
  source: Placement,
  card: CardDefinition,
  destination: ZoneId,
  cards: CardBook,
): ActionKind[] {
  const from = originOf(board, source);
  const zone = getZone(destination);
  const onField = (kind: Origin) =>
    kind === "monster" ||
    kind === "extra-monster" ||
    kind === "spell" ||
    kind === "field" ||
    kind === "pendulum";
  const list: ActionKind[] = [];

  if (isMonsterZone(zone)) {
    const occupant = occupantOf(board, destination);
    const sourceId = source.kind === "instance" ? source.instanceId : undefined;
    const occupantCard = occupant && cards[String(occupant.definitionId)];
    if (
      occupant &&
      occupant.id !== sourceId &&
      occupantCard?.kinds.includes("Xyz")
    )
      list.push("attach-material");
    const extra = extraSummons
      .filter(([kind]) => card.kinds.includes(kind))
      .map(([, action]) => action);
    if (from === "extra-deck" || (from === "outside" && extra.length))
      list.push(...extra, "special-summon");
    if (
      card.kinds.includes("Pendulum") &&
      (from === "hand" || from === "extra-deck")
    )
      list.push("pendulum-summon");
    if (from === "hand" || (from === "outside" && !extra.length)) {
      if (card.kinds.includes("Ritual")) list.push("ritual-summon");
      else list.push("normal-summon", "tribute-summon");
      list.push("special-summon", "set-monster");
    }
    if (from === "monster" || from === "extra-monster") list.push("move-zone");
    else if (!list.includes("special-summon")) list.push("special-summon");
  } else if (zone.kind === "spell" || zone.kind === "field") {
    if (from === "hand" || from === "deck" || from === "outside")
      list.push("activate-card", "set-spell-trap");
    else list.push("move-zone", "activate-card", "set-spell-trap");
  } else if (zone.kind === "pendulum") {
    list.push("activate-card", "move-zone");
  } else if (zone.kind === "hand") {
    if (from === "outside") list.push("add-from-outside", "search", "draw");
    if (from === "deck") list.push("search", "draw");
    if (onField(from)) list.push("return-to-hand");
    list.push("add-to-hand");
  } else if (zone.kind === "graveyard") {
    if (from === "hand") list.push("discard");
    list.push("send-to-graveyard");
    if (onField(from)) list.push("destroy");
    list.push("pay-cost");
  } else if (zone.kind === "banished") {
    list.push("banish", "banish-face-down", "pay-cost");
  } else if (zone.kind === "deck") {
    if (from === "outside") list.push("add-from-outside");
    list.push(
      "shuffle-into-deck",
      "return-to-deck",
      "place-top",
      "place-bottom",
    );
  } else if (zone.kind === "extra-deck") {
    if (from === "outside") list.push("add-from-outside");
    list.push("return-to-extra-deck");
  }
  list.push("custom");
  return [...new Set(list)];
}

/**
 * Whether a card may be dropped on a zone while recording. Unlike setup, an occupied
 * Monster Zone is a valid target: the card may be summoned with that monster as
 * material, or attached to an Xyz Monster. The engine checks the finished action.
 */
export function recordingTargetError(
  board: Board,
  source: Placement,
  card: CardDefinition,
  destination: ZoneId,
  cards: CardBook,
): string | undefined {
  const zone = getZone(destination);
  const occupant = occupantOf(board, destination);
  const sourceId = source.kind === "instance" ? source.instanceId : undefined;
  if (occupant && occupant.id !== sourceId && isMonsterZone(zone)) {
    if (
      sourceId !== undefined &&
      !board.instances.some((row) => row.id === sourceId)
    )
      return "That card is no longer on the board.";
    if (cards[String(occupant.definitionId)]?.kinds.includes("Xyz"))
      return undefined;
    return zoneRule(board, card, zone);
  }
  return canPlace(board, source, card, destination);
}

/** Cards the summoning side could use as materials, in a stable order. */
export function materialCandidates(
  board: Board,
  side: Side,
  exclude?: number,
): CardInstance[] {
  return board.instances.filter((row) => {
    if (row.attachedTo !== undefined || row.id === exclude) return false;
    const zone = getZone(row.zone);
    if (zone.kind === "hand") return zone.side === side;
    if (zone.kind === "monster" || zone.kind === "spell")
      return row.controller === side;
    return zone.kind === "extra-monster" && row.controller === side;
  });
}

function pose(kind: ActionKind) {
  if (kind === "set-monster")
    return { position: "defense", faceUp: false } as const;
  if (kind === "set-spell-trap" || kind === "banish-face-down")
    return { position: "attack", faceUp: false } as const;
  return {};
}

/** Explicitly sends a card's own Xyz materials to their owners' Graveyards. */
function dropMaterials(board: Board, id: number): Operation[] {
  return materialsOf(board, id).map((material) => ({
    op: "move",
    id: material.id,
    zone: `${material.owner}-graveyard`,
  }));
}

export type BuildResult =
  | { ok: true; action: ComboAction; newCards: CardDefinition[] }
  | { ok: false; message: string };

/**
 * Turns a menu choice into an action. Material and Xyz handling is explicit, so the
 * engine can apply the whole action atomically.
 */
export function buildMoveAction({
  board,
  source,
  card,
  destination,
  kind,
  materials = [],
  detail,
}: {
  board: Board;
  source: Placement;
  card: CardDefinition;
  destination: ZoneId;
  kind: ActionKind;
  materials?: number[];
  detail?: string;
}): BuildResult {
  const zone = getZone(destination);
  const operations: Operation[] = [];
  const id = source.kind === "catalog" ? board.nextId : source.instanceId;
  const existing = board.instances.find((row) => row.id === id);
  if (source.kind === "instance" && !existing)
    return { ok: false, message: "That card is no longer on the board." };
  const info = kindInfo[kind];
  const chosen = [...new Set(materials)].filter((material) => material !== id);

  for (const material of chosen)
    if (!board.instances.some((row) => row.id === material))
      return {
        ok: false,
        message: `Material copy ${material} is not on the board.`,
      };

  // Non-Xyz materials leave first, so they can free the destination zone.
  if (info.materials === "graveyard")
    for (const material of chosen) {
      const row = board.instances.find(({ id: rowId }) => rowId === material)!;
      operations.push(...dropMaterials(board, material), {
        op: "move",
        id: material,
        zone: `${row.owner}-graveyard`,
      });
    }

  if (kind === "attach-material") {
    const parent = occupantOf(board, destination);
    if (!parent)
      return { ok: false, message: "Drop the material onto an Xyz Monster." };
    if (source.kind === "catalog")
      operations.push({
        op: "create",
        id,
        definitionId: card.id,
        zone: destination,
        owner: parent.owner,
      });
    else operations.push(...dropMaterials(board, id));
    operations.push({ op: "attach", id, to: parent.id });
    return {
      ok: true,
      action: { kind, cards: [parent.id], materials: [id], operations },
      newCards: source.kind === "catalog" ? [card] : [],
    };
  }

  const leavesField =
    existing && isMonsterZone(getZone(existing.zone)) && !isMonsterZone(zone);
  if (existing && leavesField) operations.push(...dropMaterials(board, id));

  const at = kind === "place-bottom" ? "bottom" : "top";
  if (source.kind === "catalog")
    operations.push({
      op: "create",
      id,
      definitionId: card.id,
      zone: destination,
      owner: zone.side ?? board.active,
      at,
      ...pose(kind),
    });
  else
    operations.push({ op: "move", id, zone: destination, at, ...pose(kind) });

  if (info.materials === "attach")
    for (const material of chosen)
      operations.push(...dropMaterials(board, material), {
        op: "attach",
        id: material,
        to: id,
      });

  return {
    ok: true,
    action: {
      kind,
      cards: [id],
      ...(chosen.length && info.materials ? { materials: chosen } : {}),
      operations,
      ...(detail?.trim() ? { detail: detail.trim() } : {}),
    },
    newCards: source.kind === "catalog" ? [card] : [],
  };
}

/** Actions about one card already on the board that change state but do not move it. */
export function buildCardAction(
  board: Board,
  id: number,
  kind: ActionKind,
  options: {
    counter?: string;
    delta?: number;
    stat?: StatKey;
    value?: number | null;
    marker?: string;
    detail?: string;
    material?: number;
  } = {},
): ComboAction | { error: string } {
  const row = board.instances.find((instance) => instance.id === id);
  if (!row) return { error: "That card is no longer on the board." };
  const detail = options.detail?.trim() || undefined;
  const base = { kind, cards: [id], ...(detail ? { detail } : {}) };
  switch (kind) {
    case "change-position":
      return {
        ...base,
        operations: [
          {
            op: "pose",
            id,
            position: row.position === "attack" ? "defense" : "attack",
            faceUp: row.faceUp,
          },
        ],
      };
    case "flip-summon":
      return {
        ...base,
        operations: [{ op: "pose", id, position: "attack", faceUp: true }],
      };
    case "flip-face-up":
    case "flip-face-down":
      return {
        ...base,
        operations: [
          {
            op: "pose",
            id,
            position: row.position,
            faceUp: kind === "flip-face-up",
          },
        ],
      };
    case "activate-card":
      return {
        ...base,
        operations: row.faceUp
          ? []
          : [{ op: "pose", id, position: row.position, faceUp: true }],
      };
    case "add-counter":
    case "remove-counter": {
      const counter = options.counter?.trim() ?? "";
      const amount = Math.abs(options.delta ?? 1);
      return {
        ...base,
        detail: counter,
        operations: [
          {
            op: "counter",
            id,
            counter,
            delta: kind === "add-counter" ? amount : -amount,
          },
        ],
      };
    }
    case "modify-stat":
      return {
        ...base,
        operations: [
          {
            op: "stat",
            id,
            stat: options.stat ?? "attack",
            value: options.value ?? null,
          },
        ],
      };
    case "change-control":
      return {
        ...base,
        operations: [
          {
            op: "control",
            id,
            side: row.controller === "player" ? "opponent" : "player",
          },
        ],
      };
    case "mark-negated":
    case "mark-used":
    case "custom-marker": {
      const marker =
        kind === "mark-negated"
          ? "Negated"
          : kind === "mark-used"
            ? "Effect used"
            : (options.marker?.trim() ?? "");
      return {
        ...base,
        detail: marker,
        operations: [{ op: "marker", id, marker, active: true }],
      };
    }
    case "detach-material": {
      const material = board.instances.find(
        (instance) =>
          instance.id === options.material && instance.attachedTo === id,
      );
      if (!material)
        return { error: "Choose a material attached to this card." };
      return {
        ...base,
        materials: [material.id],
        operations: [
          { op: "move", id: material.id, zone: `${material.owner}-graveyard` },
        ],
      };
    }
    case "remove-card":
      return {
        ...base,
        operations: [
          ...materialsOf(board, id).map((material): Operation => ({
            op: "remove",
            id: material.id,
          })),
          { op: "remove", id },
        ],
      };
    default:
      // Effect bookkeeping such as activation, targeting and negation changes no
      // board state on its own. Its board changes are recorded as separate steps.
      return { ...base, operations: [] };
  }
}

const statLabel: Record<StatKey, string> = {
  attack: "ATK",
  defense: "DEF",
  level: "Level",
  rank: "Rank",
};

function possessive(name: string) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}

function list(names: string[]) {
  if (names.length < 3) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const originPhrase: Partial<Record<Origin, string>> = {
  hand: "from the hand",
  deck: "from the Deck",
  "extra-deck": "from the Extra Deck",
  graveyard: "from the Graveyard",
  banished: "while banished",
  outside: "from outside the Deck",
};

/** Generates the default step description from the board before the step. */
export function describeAction(
  action: ComboAction,
  before: Board,
  cards: CardBook,
): string {
  const nameOf = (id: number | undefined) => {
    if (id === undefined) return "a card";
    const definitionId =
      before.instances.find((row) => row.id === id)?.definitionId ??
      action.operations.find(
        (operation): operation is Extract<Operation, { op: "create" }> =>
          operation.op === "create" && operation.id === id,
      )?.definitionId;
    return (
      (definitionId !== undefined && cards[String(definitionId)]?.name) ||
      "a card"
    );
  };
  const main = action.cards[0];
  const card = nameOf(main);
  const materials = list((action.materials ?? []).map(nameOf));
  const using = materials ? ` using ${materials}` : "";
  const origin: Origin =
    main === undefined
      ? "outside"
      : (() => {
          const row = before.instances.find(({ id }) => id === main);
          return row ? getZone(row.zone).kind : "outside";
        })();
  const from = originPhrase[origin] ? ` ${originPhrase[origin]}` : "";
  const target = action.operations.find(
    (
      operation,
    ): operation is Extract<typeof operation, { op: "move" | "create" }> =>
      (operation.op === "move" || operation.op === "create") &&
      operation.id === main,
  );
  const destination = target ? zoneName(getZone(target.zone)) : "";
  const detail = action.detail ? `: ${action.detail}` : "";

  switch (action.kind) {
    case "normal-summon":
    case "flip-summon":
      return `${kindInfo[action.kind].label} ${card}.`;
    case "tribute-summon":
      return `Tribute Summon ${card}${materials ? ` by Tributing ${materials}` : ""}.`;
    case "special-summon":
    case "pendulum-summon":
      return `${kindInfo[action.kind].label} ${card}${origin === "hand" ? "" : from}.`;
    case "ritual-summon":
    case "fusion-summon":
    case "synchro-summon":
    case "xyz-summon":
    case "link-summon":
      return `${kindInfo[action.kind].label} ${card}${using}.`;
    case "set-monster":
      return `Set ${card} in Defense Position.`;
    case "draw":
      return `Draw ${card}.`;
    case "search":
      return `Add ${card} from the Deck to the hand.`;
    case "add-to-hand":
      return `Add ${card}${from} to the hand.`;
    case "add-from-outside": {
      const place = target ? getZone(target.zone).kind : "hand";
      const into =
        place === "hand"
          ? "the hand"
          : place === "extra-deck"
            ? "the Extra Deck"
            : "the Deck";
      return `Add ${card} from outside the Deck to ${into}.`;
    }
    case "discard":
      return `Discard ${card}.`;
    case "send-to-graveyard":
      return `Send ${card}${from} to the Graveyard.`;
    case "destroy":
      return `Destroy ${card}.`;
    case "banish":
      return `Banish ${card}${from}.`;
    case "banish-face-down":
      return `Banish ${card}${from} face-down.`;
    case "return-to-hand":
      return `Return ${card} to the hand.`;
    case "return-to-deck":
      return `Return ${card} to the Deck.`;
    case "shuffle-into-deck":
      return `Shuffle ${card} into the Deck.`;
    case "place-top":
      return `Place ${card} on top of the Deck.`;
    case "place-bottom":
      return `Place ${card} on the bottom of the Deck.`;
    case "return-to-extra-deck":
      return `Return ${card} to the Extra Deck.`;
    case "set-spell-trap":
      return `Set ${card}.`;
    case "activate-card":
      return `Activate ${card}.`;
    case "activate-effect":
      return `Activate ${possessive(card)} effect.`;
    case "pay-cost": {
      const place = target && getZone(target.zone).kind;
      if (place === "graveyard")
        return `Send ${card} to the Graveyard as a cost.`;
      if (place === "banished") return `Banish ${card} as a cost.`;
      return `Pay a cost with ${card}${detail}.`;
    }
    case "target":
      return `Target ${card}.`;
    case "resolve":
      return `${possessive(card)} effect resolves.`;
    case "negate-activation":
      return `Negate the activation of ${card}.`;
    case "negate-effect":
      return `Negate ${possessive(card)} effect.`;
    case "opponent-interruption":
      return `The opponent responds with ${card}.`;
    case "attach-material":
      return `Attach ${materials || "a card"} to ${card} as Xyz material.`;
    case "detach-material":
      return `Detach ${materials || "a material"} from ${card}.`;
    case "change-position": {
      const change = action.operations[0];
      const position =
        change?.op === "pose" && change.position === "defense"
          ? "Defense"
          : "Attack";
      return `Change ${card} to ${position} Position.`;
    }
    case "flip-face-up":
      return `Flip ${card} face-up.`;
    case "flip-face-down":
      return `Turn ${card} face-down.`;
    case "add-counter":
    case "remove-counter": {
      const change = action.operations[0];
      const amount = change?.op === "counter" ? Math.abs(change.delta) : 1;
      const counter = change?.op === "counter" ? change.counter : "";
      const noun = `${counter} Counter${amount === 1 ? "" : "s"}`;
      return action.kind === "add-counter"
        ? `Place ${amount} ${noun} on ${card}.`
        : `Remove ${amount} ${noun} from ${card}.`;
    }
    case "modify-stat": {
      const change = action.operations[0];
      if (change?.op !== "stat") return `Modify ${possessive(card)} stats.`;
      return change.value === null
        ? `${possessive(card)} ${statLabel[change.stat]} returns to normal.`
        : `${possessive(card)} ${statLabel[change.stat]} becomes ${change.value.toLocaleString("en")}.`;
    }
    case "change-control": {
      const change = action.operations[0];
      const side =
        change?.op === "control" && change.side === "opponent"
          ? "The opponent"
          : "The player";
      return `${side} takes control of ${card}.`;
    }
    case "mark-negated":
      return `${card} is negated.`;
    case "mark-used":
      return `${possessive(card)} effect has been used.`;
    case "custom-marker":
      return `Mark ${card}${detail}.`;
    case "change-life": {
      const change = action.operations[0];
      if (change?.op !== "life") return "Change Life Points.";
      const side = change.side === "player" ? "Player" : "Opponent";
      return `${side} LP: ${before.life[change.side].toLocaleString("en")} → ${change.value.toLocaleString("en")}.`;
    }
    case "change-phase": {
      const change = action.operations[0];
      return change?.op === "duel" && change.phase
        ? `Enter the ${change.phase} Phase.`
        : "Change the phase.";
    }
    case "next-turn": {
      const change = action.operations[0];
      return change?.op === "duel" && change.turn
        ? `End the turn. Turn ${change.turn} begins.`
        : "End the turn.";
    }
    case "activate-skill":
      return `Activate Skill: ${action.skill?.name ?? "Unspecified Skill"}.`;
    case "note":
      return action.detail ?? "Note.";
    case "move-zone":
      return `Move ${card} to ${destination || "another zone"}.`;
    case "remove-card":
      return `Remove ${card} from the duel.`;
    case "custom":
      return (
        action.detail ??
        (main === undefined
          ? "Custom action."
          : destination
            ? `Move ${card} to ${destination}.`
            : `Custom action with ${card}.`)
      );
  }
}

/** Duel-level actions that do not involve a card. */
export function buildDuelAction(
  board: Board,
  kind:
    "change-life" | "change-phase" | "next-turn" | "activate-skill" | "note",
  options: {
    side?: Side;
    value?: number;
    phase?: Board["phase"];
    detail?: string;
    skill?: ComboAction["skill"];
  } = {},
): ComboAction {
  const detail = options.detail?.trim() || undefined;
  switch (kind) {
    case "change-life":
      return {
        kind,
        cards: [],
        operations: [
          {
            op: "life",
            side: options.side ?? board.active,
            value: options.value ?? 0,
          },
        ],
      };
    case "change-phase":
      return {
        kind,
        cards: [],
        operations: [{ op: "duel", phase: options.phase ?? "Main" }],
      };
    case "next-turn":
      return {
        kind,
        cards: [],
        operations: [
          {
            op: "duel",
            turn: board.turn + 1,
            active: board.active === "player" ? "opponent" : "player",
            phase: "Draw",
          },
        ],
      };
    case "activate-skill":
      return {
        kind,
        cards: [],
        operations: [],
        ...(options.skill ? { skill: options.skill } : {}),
      };
    case "note":
      return { kind, cards: [], operations: [], ...(detail ? { detail } : {}) };
  }
}
