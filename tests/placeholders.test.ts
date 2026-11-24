import { describe, expect, it } from "vitest";
import type { CardDefinition } from "../src/data/catalog";
import {
  archetypePlaceholder,
  artworkIdOf,
  genericPlaceholders,
  placeholderArtworkId,
} from "../src/data/placeholders";
import {
  applyBoardAction,
  createBoard,
  getZone,
  zoneRule,
} from "../src/domain/board";
import type { Board, ZoneId } from "../src/domain/board";
import { createComboDocument, replay, withCards } from "../src/domain/combo";
import { deckWarnings } from "../src/domain/deck";
import { parseComboFile, serializeCombo } from "../src/exports/json";
import { buildExportModel, countNames } from "../src/exports/model";
import { comboText, defaultTextOptions } from "../src/exports/text";

const rod: CardDefinition = {
  id: 7084129,
  name: "Magician's Rod",
  description: "",
  type: "Effect Monster",
  category: "Monster",
  kinds: ["Effect"],
};
const skilled: CardDefinition = {
  id: 73752131,
  name: "Skilled Dark Magician",
  description: "",
  type: "Effect Monster",
  category: "Monster",
  kinds: ["Effect"],
};
const named = (name: string) =>
  genericPlaceholders.find((card) => card.name === name)!;
const anyCard = named("Any card");
const anySpell = named("Any Spell Card");
const anyTrap = named("Any Trap Card");

function place(board: Board, card: CardDefinition, destination: ZoneId) {
  const result = applyBoardAction(board, {
    type: "place",
    source: { kind: "catalog", definitionId: card.id },
    card,
    destination,
  });
  if (!result.ok) throw new Error(result.message);
  return result.board;
}

describe("opening-hand placeholders", () => {
  it("use IDs outside the passcode range and Token artwork", () => {
    const ids = genericPlaceholders.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id >= 1_000_000_000)).toBe(true);
    expect(artworkIdOf(anySpell)).toBe(placeholderArtworkId);
    expect(artworkIdOf(rod)).toBe(rod.id);
  });

  it("makes stable archetype placeholders", () => {
    const first = archetypePlaceholder("Dark Magician");
    expect(first).toEqual(archetypePlaceholder("Dark Magician"));
    expect(first.name).toBe('Any "Dark Magician" card');
    expect(first.id).not.toBe(archetypePlaceholder("Blue-Eyes").id);
    expect(first.placeholder).toBe("wildcard");
  });

  it("follow their own zone rules", () => {
    const board = createBoard();
    const monster = getZone("player-monster-1");
    const spell = getZone("player-spell-1");
    expect(zoneRule(board, anyCard, monster)).toBeUndefined();
    expect(zoneRule(board, anyCard, spell)).toBeUndefined();
    expect(zoneRule(board, anySpell, spell)).toBeUndefined();
    expect(zoneRule(board, anySpell, monster)).toBeDefined();
    expect(zoneRule(board, anyTrap, spell)).toBeUndefined();
  });

  it("are skipped by copy and catalog checks", () => {
    const warnings = deckWarnings(
      [anyCard, anyCard, anyCard, anyCard],
      [],
      () => false,
    ).map(({ message }) => message);
    expect(warnings.some((message) => message.includes("copies"))).toBe(false);
    expect(
      warnings.some((message) => message.includes("not in the bundled")),
    ).toBe(false);
  });
});

describe("alternative starters and turn order", () => {
  it("sets and clears alternatives on hand cards only", () => {
    const board = place(
      place(createBoard(), rod, "player-hand"),
      rod,
      "player-deck",
    );
    const set = applyBoardAction(board, {
      type: "alternatives",
      id: 1,
      cards: [skilled, skilled, rod],
    });
    if (!set.ok) throw new Error(set.message);
    expect(set.board.instances[0]!.alternatives).toEqual([skilled.id]);
    const cleared = applyBoardAction(set.board, {
      type: "alternatives",
      id: 1,
      cards: [],
    });
    if (!cleared.ok) throw new Error(cleared.message);
    expect(cleared.board.instances[0]).not.toHaveProperty("alternatives");
    expect(
      applyBoardAction(board, { type: "alternatives", id: 2, cards: [skilled] })
        .ok,
    ).toBe(false);
  });

  it("exports alternatives, placeholders and turn order, and round-trips them", () => {
    let board = place(
      place(createBoard(), rod, "player-hand"),
      anySpell,
      "player-hand",
    );
    const set = applyBoardAction(board, {
      type: "alternatives",
      id: 1,
      cards: [skilled],
    });
    if (!set.ok) throw new Error(set.message);
    board = { ...set.board, going: "first" };
    const doc = {
      ...createComboDocument("p", "2026-11-24T00:00:00.000Z", board),
      cards: withCards({}, [rod, skilled, anySpell]),
    };
    const model = buildExportModel(doc, replay(doc));
    expect(countNames(model.hand)).toEqual([
      "1x Magician's Rod (or Skilled Dark Magician)",
      "1x Any Spell Card",
    ]);
    const text = comboText(model, defaultTextOptions);
    expect(text).toContain("Turn order: Going first");
    expect(text).toContain("1x Any Spell Card");
    expect(
      parseComboFile(serializeCombo(doc, "2026-11-24T00:00:00.000Z")),
    ).toEqual({
      ok: true,
      doc,
    });
  });
});
