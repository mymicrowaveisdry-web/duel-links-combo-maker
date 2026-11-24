import { describe, expect, it } from "vitest";
import type { CardDefinition } from "../src/data/catalog";
import { applyBoardAction, cardsIn, createBoard } from "../src/domain/board";
import type { Board, BoardAction, ZoneId } from "../src/domain/board";

const monster: CardDefinition = {
  id: 46986414,
  name: "Dark Magician",
  category: "Monster",
  description: "",
  type: "Normal Monster",
  kinds: ["Normal"],
  level: 7,
};

function placeIn(destination: ZoneId): BoardAction {
  return {
    type: "place",
    source: { kind: "catalog", definitionId: monster.id },
    card: monster,
    destination,
  };
}

function apply(board: Board, action: BoardAction) {
  const result = applyBoardAction(board, action);
  if (!result.ok) throw new Error(result.message);
  return result.board;
}

describe("Speed Duel setup board", () => {
  it("creates distinct instances for duplicate copies", () => {
    const opening = createBoard();
    const first = apply(opening, placeIn("player-hand"));
    const second = apply(first, placeIn("player-hand"));
    expect(cardsIn(second, "player-hand").map(({ id }) => id)).toEqual([1, 2]);
    expect(opening.instances).toEqual([]);
  });

  it("moves exactly one copy and keeps its owner when placed across the field", () => {
    const board = apply(
      apply(createBoard(), placeIn("player-hand")),
      placeIn("player-hand"),
    );
    const after = apply(board, {
      type: "place",
      source: { kind: "instance", instanceId: 1 },
      card: monster,
      destination: "opponent-monster-2",
    });
    expect(cardsIn(after, "player-hand").map(({ id }) => id)).toEqual([2]);
    expect(cardsIn(after, "opponent-monster-2")[0]).toMatchObject({
      id: 1,
      owner: "player",
      controller: "opponent",
    });
    expect(after.nextId).toBe(board.nextId);
  });

  it("enforces a single occupancy limit for a shared Extra Monster Zone", () => {
    const board = apply(createBoard(), placeIn("shared-extra-1"));
    expect(applyBoardAction(board, placeIn("shared-extra-1"))).toMatchObject({
      ok: false,
      message: expect.stringContaining("occupied"),
    });
    expect(cardsIn(board, "shared-extra-1")).toHaveLength(1);
    expect(apply(board, placeIn("shared-extra-2")).instances).toHaveLength(2);
  });

  it("rejects catalog placements whose definition and source differ", () => {
    expect(
      applyBoardAction(createBoard(), {
        type: "place",
        source: { kind: "catalog", definitionId: 123 },
        card: monster,
        destination: "player-hand",
      }).ok,
    ).toBe(false);
  });
});
