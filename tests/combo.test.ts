import { describe, expect, it } from "vitest";
import type { CardDefinition } from "../src/data/catalog";
import {
  buildCardAction,
  buildDuelAction,
  buildMoveAction,
  describeAction,
  suggestActions,
} from "../src/domain/actions";
import {
  applyBoardAction,
  cardsIn,
  createBoard,
  materialsOf,
} from "../src/domain/board";
import type { Board, BoardAction, ZoneId } from "../src/domain/board";
import {
  applyAction,
  createComboDocument,
  replay,
  validateBoard,
  withCards,
} from "../src/domain/combo";
import type {
  ActionKind,
  CardBook,
  ComboAction,
  ComboDocument,
} from "../src/domain/combo";

const magician: CardDefinition = {
  id: 46986414,
  name: "Dark Magician",
  description: "",
  type: "Normal Monster",
  category: "Monster",
  kinds: ["Normal"],
  level: 7,
};
const rod: CardDefinition = {
  id: 7084129,
  name: "Magician's Rod",
  description: "",
  type: "Effect Monster",
  category: "Monster",
  kinds: ["Effect"],
  level: 3,
};
const xyz: CardDefinition = {
  id: 90000001,
  name: "Test Xyz Monster",
  description: "",
  type: "XYZ Effect Monster",
  category: "Monster",
  kinds: ["Effect", "Xyz"],
  rank: 7,
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
const cards: CardBook = withCards({}, [magician, rod, xyz, circle]);

function setup(board: Board, card: CardDefinition, destination: ZoneId) {
  const action: BoardAction = {
    type: "place",
    source: { kind: "catalog", definitionId: card.id },
    card,
    destination,
  };
  const result = applyBoardAction(board, action);
  if (!result.ok) throw new Error(result.message);
  return result.board;
}

function move(
  board: Board,
  id: number,
  card: CardDefinition,
  destination: ZoneId,
  kind: ActionKind,
  materials: number[] = [],
): ComboAction {
  const built = buildMoveAction({
    board,
    source: { kind: "instance", instanceId: id },
    card,
    destination,
    kind,
    materials,
  });
  if (!built.ok) throw new Error(built.message);
  return built.action;
}

function apply(board: Board, action: ComboAction) {
  const result = applyAction(board, action, cards);
  if (!result.ok) throw new Error(result.message);
  return result.board;
}

/** Two Level 7 monsters on the field and an Xyz Monster in the Extra Deck. */
function xyzReady() {
  let board = setup(createBoard(), magician, "player-monster-1"); // copy 1
  board = setup(board, magician, "player-monster-2"); // copy 2
  return setup(board, xyz, "player-extra-deck"); // copy 3
}

describe("combo engine", () => {
  it("records a Normal Summon and describes it", () => {
    const board = setup(createBoard(), rod, "player-hand");
    const action = move(board, 1, rod, "player-monster-1", "normal-summon");
    const after = apply(board, action);
    expect(cardsIn(after, "player-monster-1")[0]).toMatchObject({
      id: 1,
      position: "attack",
      faceUp: true,
    });
    expect(describeAction(action, board, cards)).toBe(
      "Normal Summon Magician's Rod.",
    );
    expect(board.instances[0]!.zone).toBe("player-hand");
  });

  it("Xyz Summons atomically and attaches every material", () => {
    const board = xyzReady();
    const action = move(
      board,
      3,
      xyz,
      "player-monster-1",
      "xyz-summon",
      [1, 2],
    );
    const after = apply(board, action);
    expect(cardsIn(after, "player-monster-1").map(({ id }) => id)).toEqual([3]);
    expect(materialsOf(after, 3).map(({ id }) => id)).toEqual([1, 2]);
    expect(cardsIn(after, "player-monster-2")).toEqual([]);
    expect(describeAction(action, board, cards)).toBe(
      "Xyz Summon Test Xyz Monster using Dark Magician and Dark Magician.",
    );
  });

  it("leaves the board untouched when one operation of an action fails", () => {
    const board = xyzReady();
    const action = move(
      board,
      3,
      xyz,
      "player-monster-1",
      "xyz-summon",
      [1, 2],
    );
    const broken: ComboAction = {
      ...action,
      operations: [...action.operations, { op: "attach", id: 99, to: 3 }],
    };
    const result = applyAction(board, broken, cards);
    expect(result.ok).toBe(false);
    expect(cardsIn(board, "player-monster-1").map(({ id }) => id)).toEqual([1]);
    expect(materialsOf(board, 3)).toEqual([]);
  });

  it("rejects a summon into an occupied zone without freeing it", () => {
    const board = xyzReady();
    const action = move(board, 3, xyz, "player-monster-1", "special-summon");
    expect(applyAction(board, action, cards)).toMatchObject({
      ok: false,
      message: expect.stringContaining("more than one card"),
    });
  });

  it("requires explicit handling of materials when an Xyz Monster leaves the field", () => {
    const board = apply(
      xyzReady(),
      move(xyzReady(), 3, xyz, "player-monster-1", "xyz-summon", [1, 2]),
    );
    const bare: ComboAction = {
      kind: "send-to-graveyard",
      cards: [3],
      operations: [{ op: "move", id: 3, zone: "player-extra-deck" }],
    };
    expect(applyAction(board, bare, cards).ok).toBe(false);
    const after = apply(
      board,
      move(board, 3, xyz, "player-graveyard", "send-to-graveyard"),
    );
    expect(cardsIn(after, "player-graveyard").map(({ id }) => id)).toEqual([
      1, 2, 3,
    ]);
    expect(
      after.instances.every(({ attachedTo }) => attachedTo === undefined),
    ).toBe(true);
  });

  it("follows the parent when an Xyz Monster moves between Monster Zones", () => {
    const summoned = apply(
      xyzReady(),
      move(xyzReady(), 3, xyz, "player-monster-1", "xyz-summon", [1, 2]),
    );
    const after = apply(
      summoned,
      move(summoned, 3, xyz, "shared-extra-1", "move-zone"),
    );
    expect(
      materialsOf(after, 3).every(({ zone }) => zone === "shared-extra-1"),
    ).toBe(true);
    expect(validateBoard(after, cards)).toBeUndefined();
  });

  it("prevents attachment cycles and self-attachment", () => {
    const board = apply(
      xyzReady(),
      move(xyzReady(), 3, xyz, "player-monster-1", "xyz-summon", [1]),
    );
    expect(
      applyAction(
        board,
        {
          kind: "custom",
          cards: [3],
          operations: [{ op: "attach", id: 3, to: 3 }],
        },
        cards,
      ).ok,
    ).toBe(false);
    expect(
      applyAction(
        board,
        {
          kind: "custom",
          cards: [2],
          operations: [{ op: "attach", id: 2, to: 1 }],
        },
        cards,
      ).ok,
    ).toBe(false);
  });

  it("detaches a material to its owner's Graveyard", () => {
    const board = apply(
      xyzReady(),
      move(xyzReady(), 3, xyz, "player-monster-1", "xyz-summon", [1, 2]),
    );
    const action = buildCardAction(board, 3, "detach-material", {
      material: 1,
    });
    if ("error" in action) throw new Error(action.error);
    const after = apply(board, action);
    expect(materialsOf(after, 3).map(({ id }) => id)).toEqual([2]);
    expect(cardsIn(after, "player-graveyard").map(({ id }) => id)).toEqual([1]);
    expect(describeAction(action, board, cards)).toBe(
      "Detach Dark Magician from Test Xyz Monster.",
    );
  });

  it("creates a card from outside the Deck with the next free instance ID", () => {
    const board = setup(createBoard(), rod, "player-hand");
    const built = buildMoveAction({
      board,
      source: { kind: "catalog", definitionId: circle.id },
      card: circle,
      destination: "player-hand",
      kind: "add-from-outside",
    });
    if (!built.ok) throw new Error(built.message);
    const after = apply(board, built.action);
    expect(cardsIn(after, "player-hand").map(({ id }) => id)).toEqual([1, 2]);
    expect(after.nextId).toBe(3);
    expect(describeAction(built.action, board, cards)).toBe(
      "Add Dark Magical Circle from outside the Deck to the hand.",
    );
  });

  it("keeps Life Points within the supported range", () => {
    const board = createBoard();
    expect(
      applyAction(
        board,
        buildDuelAction(board, "change-life", { side: "player", value: -1 }),
        cards,
      ).ok,
    ).toBe(false);
    const action = buildDuelAction(board, "change-life", {
      side: "player",
      value: 3000,
    });
    expect(apply(board, action).life.player).toBe(3000);
    expect(describeAction(action, board, cards)).toBe(
      "Player LP: 4,000 → 3,000.",
    );
  });

  it("tracks counters, manual stats and markers, and clears them off the field", () => {
    let board = setup(createBoard(), rod, "player-monster-1");
    for (const [kind, options] of [
      ["add-counter", { counter: "Spell", delta: 2 }],
      ["modify-stat", { stat: "attack", value: 2000 }],
      ["mark-negated", {}],
    ] as const) {
      const action = buildCardAction(board, 1, kind, options);
      if ("error" in action) throw new Error(action.error);
      board = apply(board, action);
    }
    expect(board.instances[0]).toMatchObject({
      counters: { Spell: 2 },
      stats: { attack: 2000 },
      markers: ["Negated"],
    });
    const after = apply(
      board,
      move(board, 1, rod, "player-graveyard", "destroy"),
    );
    expect(after.instances[0]).toMatchObject({
      counters: undefined,
      stats: undefined,
      markers: undefined,
    });
  });

  it("offers summon choices without inferring one from the movement", () => {
    const board = setup(createBoard(), rod, "player-hand");
    const options = suggestActions(
      board,
      { kind: "instance", instanceId: 1 },
      rod,
      "player-monster-1",
      cards,
    );
    expect(options.slice(0, 4)).toEqual([
      "normal-summon",
      "tribute-summon",
      "special-summon",
      "set-monster",
    ]);
    expect(options.at(-1)).toBe("custom");
  });
});

describe("combo replay", () => {
  function documentWithSteps(): ComboDocument {
    const initialBoard = setup(
      setup(createBoard(), rod, "player-hand"),
      magician,
      "player-deck",
    );
    const first = move(
      initialBoard,
      1,
      rod,
      "player-monster-1",
      "normal-summon",
    );
    const afterFirst = apply(initialBoard, first);
    const second = move(afterFirst, 2, magician, "player-hand", "search");
    return {
      ...createComboDocument("doc", "2026-11-24T00:00:00.000Z", initialBoard),
      cards,
      steps: [
        { id: "a", action: first },
        { id: "b", action: second },
      ],
    };
  }

  it("is deterministic and leaves the document unchanged", () => {
    const doc = documentWithSteps();
    const snapshot = JSON.stringify(doc);
    const first = replay(doc);
    const second = replay(doc);
    expect(first.failure).toBeUndefined();
    expect(first.boards).toHaveLength(3);
    expect(second.boards).toEqual(first.boards);
    expect(JSON.stringify(doc)).toBe(snapshot);
    expect(
      cardsIn(first.boards[2]!, "player-hand").map(({ id }) => id),
    ).toEqual([2]);
  });

  it("reports the first step that no longer applies", () => {
    const doc = documentWithSteps();
    const broken = {
      ...doc,
      initialBoard: {
        ...doc.initialBoard,
        instances: doc.initialBoard.instances.slice(1),
      },
    };
    const result = replay(broken);
    expect(result.failure).toMatchObject({ index: 0, stepId: "a" });
    expect(result.boards).toHaveLength(1);
  });
});
