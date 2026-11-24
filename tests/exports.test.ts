import { describe, expect, it } from "vitest";
import type { CardDefinition } from "../src/data/catalog";
import { buildMoveAction } from "../src/domain/actions";
import { applyBoardAction, createBoard } from "../src/domain/board";
import type { Board } from "../src/domain/board";
import {
  applyAction,
  createComboDocument,
  replay,
  withCards,
} from "../src/domain/combo";
import type { ComboDocument } from "../src/domain/combo";
import { deckWarnings, parseYdk, resolveYdk } from "../src/domain/deck";
import { parseComboFile, serializeCombo } from "../src/exports/json";
import { buildExportModel, fileSlug } from "../src/exports/model";
import { pageLimit, paginate, wrapLines } from "../src/exports/png";
import { comboText, defaultTextOptions } from "../src/exports/text";

const rod: CardDefinition = {
  id: 7084129,
  name: "Magician's Rod",
  description: "",
  type: "Effect Monster",
  category: "Monster",
  kinds: ["Effect"],
  level: 3,
};
const circle: CardDefinition = {
  id: 47222536,
  name: "Dark Magical Circle",
  description: "",
  type: "Continuous Spell",
  category: "Spell",
  kinds: [],
  race: "Continuous",
};
const fusion: CardDefinition = {
  id: 90000002,
  name: "Test Fusion",
  description: "",
  type: "Fusion Monster",
  category: "Monster",
  kinds: ["Fusion"],
};

function place(
  board: Board,
  card: CardDefinition,
  destination: "player-hand" | "player-deck",
) {
  const result = applyBoardAction(board, {
    type: "place",
    source: { kind: "catalog", definitionId: card.id },
    card,
    destination,
  });
  if (!result.ok) throw new Error(result.message);
  return result.board;
}

/** Rod in hand → Normal Summon → note, with an edited description. */
function sampleCombo(): ComboDocument {
  const initialBoard = place(
    place(createBoard(), rod, "player-hand"),
    circle,
    "player-hand",
  );
  const cards = withCards({}, [rod, circle]);
  const summon = buildMoveAction({
    board: initialBoard,
    source: { kind: "instance", instanceId: 1 },
    card: rod,
    destination: "player-monster-1",
    kind: "normal-summon",
  });
  if (!summon.ok) throw new Error(summon.message);
  const after = applyAction(initialBoard, summon.action, cards);
  if (!after.ok) throw new Error(after.message);
  const activate = buildMoveAction({
    board: after.board,
    source: { kind: "instance", instanceId: 2 },
    card: circle,
    destination: "player-spell-1",
    kind: "activate-card",
  });
  if (!activate.ok) throw new Error(activate.message);
  return {
    ...createComboDocument("doc-1", "2026-11-24T00:00:00.000Z", initialBoard),
    title: "Dark Magician Combo",
    cards,
    skill: { name: "Custom Example", origin: "custom" },
    steps: [
      { id: "a", action: summon.action, notes: "Starter." },
      {
        id: "b",
        action: activate.action,
        customDescription: "Activate the Circle.",
      },
    ],
  };
}

describe("text export", () => {
  it("lists the hand, steps with edited text and notes, and the endboard", () => {
    const doc = sampleCombo();
    const text = comboText(
      buildExportModel(doc, replay(doc)),
      defaultTextOptions,
    );
    expect(text).toContain("DARK MAGICIAN COMBO\n===================");
    expect(text).toContain("Skill: Custom Example (custom)");
    expect(text).toContain("1x Magician's Rod\n1x Dark Magical Circle");
    expect(text).toContain("01. Normal Summon Magician's Rod.\n    Starter.");
    expect(text).toContain("02. Activate the Circle.");
    expect(text).not.toContain("Activate Dark Magical Circle.");
    expect(text).toContain(
      "Monster Zones:\n- Magician's Rod\n- Empty\n- Empty",
    );
    expect(text).toContain("Spell/Trap Zones:\n- Dark Magical Circle");
    expect(text.endsWith("Created with Duel Links Combo Maker.\n")).toBe(true);
  });

  it("supports compact, Discord and note-free output, and empty combos", () => {
    const doc = sampleCombo();
    const model = buildExportModel(doc, replay(doc));
    const compact = comboText(model, {
      notes: false,
      compact: true,
      discord: true,
      attribution: false,
    });
    expect(compact).toContain("# Dark Magician Combo");
    expect(compact).toContain("**Skill:** Custom Example (custom)");
    expect(compact).not.toContain("Starter.");
    expect(compact).not.toContain("Empty");
    const empty = createComboDocument(
      "e",
      "2026-11-24T00:00:00.000Z",
      createBoard(),
    );
    const blank = comboText(
      buildExportModel(empty, replay(empty)),
      defaultTextOptions,
    );
    expect(blank).toContain("No cards specified.");
    expect(blank).toContain("No steps recorded.");
  });

  it("builds safe file names", () => {
    expect(fileSlug("Dark Magician Combo!")).toBe("dark-magician-combo");
    expect(fileSlug("  ***  ")).toBe("combo");
    expect(fileSlug("Évolution / Rank-Up")).toBe("evolution-rank-up");
  });
});

describe("JSON backup", () => {
  it("round-trips the editable combo", () => {
    const doc = sampleCombo();
    const parsed = parseComboFile(
      serializeCombo(doc, "2026-11-24T01:00:00.000Z"),
    );
    expect(parsed).toEqual({ ok: true, doc });
  });

  it("rejects invalid, foreign, newer and malformed files before use", () => {
    expect(parseComboFile("{not json")).toMatchObject({
      ok: false,
      error: "The file is not valid JSON.",
    });
    expect(
      parseComboFile(JSON.stringify({ app: "other", combo: {} })),
    ).toMatchObject({ ok: false });
    const doc = sampleCombo();
    expect(
      parseComboFile(JSON.stringify({ ...doc, schemaVersion: 2 })),
    ).toMatchObject({
      ok: false,
      error: expect.stringContaining("newer version"),
    });
    const unknownKind = structuredClone(doc) as unknown as {
      steps: Array<{ action: { kind: string } }>;
    };
    unknownKind.steps[0]!.action.kind = "teleport";
    expect(parseComboFile(JSON.stringify(unknownKind))).toMatchObject({
      ok: false,
      error: "The file uses an unknown action type.",
    });
  });

  it("rejects missing card definitions and steps that cannot replay", () => {
    const doc = sampleCombo();
    const missing = { ...doc, cards: { [String(rod.id)]: rod } };
    expect(parseComboFile(JSON.stringify(missing))).toMatchObject({
      ok: false,
    });
    const broken = structuredClone(doc);
    broken.steps[1]!.action.operations = [
      { op: "move", id: 99, zone: "player-hand" },
    ];
    expect(parseComboFile(JSON.stringify(broken))).toMatchObject({
      ok: false,
      error: expect.stringContaining("Step 2"),
    });
  });
});

describe("YDK import and deck checks", () => {
  const ydk =
    "#created by test\n#main\n7084129\n7084129\n47222536\n12345\n#extra\n90000002\n!side\n7084129\n";

  it("parses sections, ignores comments and reports unknown IDs", () => {
    const deck = parseYdk(ydk);
    if ("error" in deck) throw new Error(deck.error);
    expect(deck).toEqual({
      main: [7084129, 7084129, 47222536, 12345],
      extra: [90000002],
      side: [7084129],
    });
    const lookup = new Map(
      [rod, circle, fusion].map((card) => [card.id, card]),
    );
    const resolved = resolveYdk(deck, (id) => lookup.get(id));
    expect(resolved.main.map(({ name }) => name)).toEqual([
      "Magician's Rod",
      "Magician's Rod",
      "Dark Magical Circle",
    ]);
    expect(resolved.missing).toEqual([12345]);
  });

  it("rejects files that are not YDK", () => {
    expect(parseYdk("hello")).toHaveProperty("error");
    expect(parseYdk("123\n#main\n")).toHaveProperty("error");
  });

  it("loads the deck as one undoable setup change", () => {
    const result = applyBoardAction(createBoard(), {
      type: "load-deck",
      main: [rod, rod, circle],
      extra: [fusion],
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.board.instances.map(({ zone }) => zone)).toEqual([
      "player-deck",
      "player-deck",
      "player-deck",
      "player-extra-deck",
    ]);
    expect(
      applyBoardAction(createBoard(), {
        type: "load-deck",
        main: [],
        extra: [rod],
      }).ok,
    ).toBe(false);
  });

  it("warns without claiming legality", () => {
    const warnings = deckWarnings(
      [rod, rod, rod, rod, circle],
      [fusion],
      (id) => id !== fusion.id,
    );
    const text = warnings.map(({ message }) => message).join("\n");
    expect(text).toContain("Main Deck has 5 cards");
    expect(text).toContain("4 copies of Magician's Rod");
    expect(text).toContain("1 card is not in the bundled Duel Links catalog");
    expect(text).toContain("Limited 1/2/3 checks are unavailable");
    expect(deckWarnings([], [], () => true)).toEqual([]);
  });
});

describe("PNG layout helpers", () => {
  const measure = (text: string) => text.length * 10;

  it("wraps text by width and breaks overlong words", () => {
    expect(wrapLines(measure, "one two three", 80)).toEqual([
      "one two",
      "three",
    ]);
    expect(wrapLines(measure, "abcdefghijkl", 50)).toEqual([
      "abcde",
      "fghij",
      "kl",
    ]);
    expect(wrapLines(measure, "a\nb", 100)).toEqual(["a", "b"]);
  });

  it("splits long guides into pages without cropping a block", () => {
    expect(paginate([400, 400, 400], 900)).toEqual([[0, 1], [2]]);
    expect(paginate([1200, 100], 900)).toEqual([[0], [1]]);
    expect(pageLimit(2)).toBeLessThan(pageLimit(1));
    expect(pageLimit(1) * 880).toBeLessThanOrEqual(16_000_000);
  });
});
