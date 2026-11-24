// One export model for TXT and PNG, built from the combo document and its replay.
// Both formats use the edited descriptions and the board after the last valid step.
import type { CardDefinition } from "../data/catalog";
import { describeAction } from "../domain/actions";
import { cardsIn, getZone, materialsOf } from "../domain/board";
import type { Board, CardInstance, ZoneId } from "../domain/board";
import type { ComboDocument, ReplayResult } from "../domain/combo";

export interface ExportCard {
  card?: CardDefinition;
  name: string;
  faceUp: boolean;
  defense: boolean;
  materials: string[];
  counters: string[];
  markers: string[];
  /** Other cards that could fill this hand slot. */
  alternatives: string[];
}

export interface ExportStep {
  number: number;
  text: string;
  notes?: string;
  card?: CardDefinition;
  skill: boolean;
  /** Belongs to an earlier step's group, such as a Skill activation. */
  grouped: boolean;
}

export interface ExportSlot {
  label: string;
  card?: ExportCard;
}

export interface ExportModel {
  title: string;
  description?: string;
  format: string;
  /** "Going first" or "Going second" when specified. */
  going?: string;
  /** Names of author-made cards in the combo, which are not from the dataset. */
  customCards: string[];
  character?: string;
  skill?: { name: string; description?: string; custom: boolean };
  hand: ExportCard[];
  steps: ExportStep[];
  /** Set when replay stopped early. The endboard is the board before that step. */
  warning?: string;
  endboard: {
    extraMonsters: ExportSlot[];
    monsters: ExportSlot[];
    spells: ExportSlot[];
    field: ExportSlot;
    pendulum: ExportSlot[];
    hand: ExportCard[];
    graveyard: ExportCard[];
    banished: ExportCard[];
  };
}

export function exportCard(
  board: Board,
  row: CardInstance,
  cards: ComboDocument["cards"],
): ExportCard {
  const card = cards[String(row.definitionId)];
  const nameOf = (id: number) => cards[String(id)]?.name ?? "Unknown card";
  return {
    ...(card ? { card } : {}),
    name: card?.name ?? "Unknown card",
    faceUp: row.faceUp,
    defense: row.position === "defense",
    materials: materialsOf(board, row.id).map((item) =>
      nameOf(item.definitionId),
    ),
    counters: Object.entries(row.counters ?? {}).map(
      ([counter, count]) =>
        `${count} ${counter} Counter${count === 1 ? "" : "s"}`,
    ),
    markers: row.markers ?? [],
    alternatives: (row.alternatives ?? []).map(nameOf),
  };
}

/** "Magician's Rod (or Skilled Dark Magician)" for slots with alternatives. */
export function slotName(card: ExportCard) {
  return card.alternatives.length
    ? `${card.name} (or ${card.alternatives.join(" or ")})`
    : card.name;
}

export function buildExportModel(
  doc: ComboDocument,
  replayed: ReplayResult,
): ExportModel {
  const start = doc.initialBoard;
  const end = replayed.boards.at(-1) ?? start;
  const cardsAt = (board: Board, zone: ZoneId) =>
    cardsIn(board, zone).map((row) => exportCard(board, row, doc.cards));
  const slot = (zone: ZoneId): ExportSlot => {
    const row = cardsIn(end, zone)[0];
    return {
      label: getZone(zone).label,
      ...(row ? { card: exportCard(end, row, doc.cards) } : {}),
    };
  };
  const steps = doc.steps.flatMap((step, index): ExportStep[] => {
    const before = replayed.boards[index];
    if (!before) return [];
    const mainId = step.action.cards[0];
    const definitionId =
      mainId === undefined
        ? undefined
        : (before.instances.find((row) => row.id === mainId)?.definitionId ??
          step.action.operations.find(
            (
              operation,
            ): operation is Extract<typeof operation, { op: "create" }> =>
              operation.op === "create" && operation.id === mainId,
          )?.definitionId);
    const card =
      definitionId === undefined ? undefined : doc.cards[String(definitionId)];
    return [
      {
        number: index + 1,
        text:
          step.customDescription ??
          describeAction(step.action, before, doc.cards),
        ...(step.notes ? { notes: step.notes } : {}),
        ...(card ? { card } : {}),
        skill: step.action.kind === "activate-skill",
        grouped: Boolean(step.groupId && step.groupId !== step.id),
      },
    ];
  });
  // Extra Monster Zones are shared; the export shows the ones the player controls.
  const extraMonsters = (["shared-extra-1", "shared-extra-2"] as const)
    .filter((zone) => {
      const row = cardsIn(end, zone)[0];
      return !row || row.controller === "player";
    })
    .map(slot);
  const failure = replayed.failure;
  return {
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    format: "Duel Links - Speed Duel",
    ...(start.going ? { going: `Going ${start.going}` } : {}),
    customCards: Object.values(doc.cards)
      .filter((card) => card.custom)
      .map((card) => card.name),
    ...(doc.character ? { character: doc.character.name } : {}),
    ...(doc.skill
      ? {
          skill: {
            name: doc.skill.name,
            ...(doc.skill.description
              ? { description: doc.skill.description }
              : {}),
            custom: doc.skill.origin === "custom",
          },
        }
      : {}),
    hand: cardsAt(start, "player-hand"),
    steps,
    ...(failure
      ? {
          warning:
            failure.index < 0
              ? `The starting board is invalid: ${failure.message}`
              : `Step ${failure.index + 1} no longer applies (${failure.message}). Later steps are left out and the endboard is the board before it.`,
        }
      : {}),
    endboard: {
      extraMonsters,
      monsters: (
        ["player-monster-1", "player-monster-2", "player-monster-3"] as const
      ).map(slot),
      spells: (
        ["player-spell-1", "player-spell-2", "player-spell-3"] as const
      ).map(slot),
      field: slot("player-field"),
      pendulum: end.pendulum.player
        ? (["player-pendulum-1", "player-pendulum-2"] as const).map(slot)
        : [],
      hand: cardsAt(end, "player-hand"),
      graveyard: cardsAt(end, "player-graveyard"),
      banished: cardsAt(end, "player-banished"),
    },
  };
}

/** Groups identical names as "2x Name" while keeping first-seen order. */
export function countNames(cards: readonly ExportCard[]) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    const name = slotName(card);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => `${count}x ${name}`);
}

/** A readable description of a card on the field, such as "X (Set, Defense)". */
export function cardLine(card: ExportCard) {
  const notes = [
    !card.faceUp && "Set",
    card.defense && "Defense",
    card.materials.length &&
      `${card.materials.length} material${card.materials.length === 1 ? "" : "s"}: ${card.materials.join(", ")}`,
    ...card.counters,
    ...card.markers,
  ].filter(Boolean);
  return notes.length ? `${card.name} (${notes.join("; ")})` : card.name;
}

/** Lower-case, hyphenated, filesystem-safe name. Never empty. */
export function fileSlug(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "combo";
}
