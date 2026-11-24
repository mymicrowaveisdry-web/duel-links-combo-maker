import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import type { CardDefinition } from "../src/data/catalog";
import {
  buildCardAction,
  buildDuelAction,
  buildMoveAction,
} from "../src/domain/actions";
import { cardsIn } from "../src/domain/board";
import type { ZoneId } from "../src/domain/board";
import {
  armInsert,
  comboReducer,
  deleteStep,
  duplicateStep,
  moveStep,
  record,
  selectReplay,
  setView,
  setupChange,
  truncateFrom,
  undo,
  updateStep,
} from "../src/store";

const rod: CardDefinition = {
  id: 7084129,
  name: "Magician's Rod",
  description: "",
  type: "Effect Monster",
  category: "Monster",
  kinds: ["Effect"],
  level: 3,
};

type Store = ReturnType<typeof createStore>;
function createStore() {
  return configureStore({ reducer: { combo: comboReducer } });
}
const boards = (store: Store) => selectReplay(store.getState()).boards;
const steps = (store: Store) => store.getState().combo.doc.steps;

function moveRod(
  store: Store,
  zone: ZoneId,
  kind: "normal-summon" | "send-to-graveyard" | "return-to-hand",
) {
  const board = boards(store).at(-1)!;
  const built = buildMoveAction({
    board,
    source: { kind: "instance", instanceId: 1 },
    card: rod,
    destination: zone,
    kind,
  });
  if (!built.ok) throw new Error(built.message);
  store.dispatch(record(built.action));
}

/** Rod in hand → Normal Summon → note → send to Graveyard. */
function threeSteps() {
  const store = createStore();
  store.dispatch(
    setupChange({
      type: "place",
      source: { kind: "catalog", definitionId: rod.id },
      card: rod,
      destination: "player-hand",
    }),
  );
  moveRod(store, "player-monster-1", "normal-summon");
  store.dispatch(
    record(
      buildDuelAction(boards(store).at(-1)!, "note", { detail: "Keep going" }),
    ),
  );
  moveRod(store, "player-graveyard", "send-to-graveyard");
  return store;
}

describe("timeline editing", () => {
  it("derives one board per step and views earlier steps without changing the combo", () => {
    const store = threeSteps();
    expect(boards(store)).toHaveLength(4);
    store.dispatch(setView(1));
    expect(store.getState().combo.view).toBe(1);
    expect(steps(store)).toHaveLength(3);
    store.dispatch(setView(3));
    expect(store.getState().combo.view).toBeNull();
  });

  it("saves custom descriptions and notes, and clears them with empty text", () => {
    const store = threeSteps();
    const id = steps(store)[0]!.id;
    store.dispatch(
      updateStep({ id, customDescription: "Summon Rod.", notes: "Starter" }),
    );
    expect(steps(store)[0]).toMatchObject({
      customDescription: "Summon Rod.",
      notes: "Starter",
    });
    store.dispatch(updateStep({ id, customDescription: " ", notes: "" }));
    expect(steps(store)[0]!.customDescription).toBeUndefined();
    expect(steps(store)[0]!.notes).toBeUndefined();
  });

  it("rebuilds later boards after a deletion", () => {
    const store = threeSteps();
    store.dispatch(deleteStep(steps(store)[0]!.id));
    const replayed = selectReplay(store.getState());
    expect(steps(store)).toHaveLength(2);
    expect(replayed.failure).toBeUndefined();
    expect(cardsIn(replayed.boards.at(-1)!, "player-monster-1")).toHaveLength(
      0,
    );
    expect(cardsIn(replayed.boards.at(-1)!, "player-graveyard")).toHaveLength(
      1,
    );
  });

  it("flags the first step that no longer applies and repairs by truncating", () => {
    const store = threeSteps();
    // Add a second copy from outside the Deck, then summon it.
    const added = buildMoveAction({
      board: boards(store).at(-1)!,
      source: { kind: "catalog", definitionId: rod.id },
      card: rod,
      destination: "player-hand",
      kind: "add-from-outside",
    });
    if (!added.ok) throw new Error(added.message);
    store.dispatch(record(added.action, added.newCards));
    const summon = buildMoveAction({
      board: boards(store).at(-1)!,
      source: { kind: "instance", instanceId: 2 },
      card: rod,
      destination: "player-monster-2",
      kind: "special-summon",
    });
    if (!summon.ok) throw new Error(summon.message);
    store.dispatch(record(summon.action));
    store.dispatch(deleteStep(steps(store)[3]!.id));
    const replayed = selectReplay(store.getState());
    expect(replayed.failure).toMatchObject({ index: 3 });
    expect(replayed.boards).toHaveLength(4);
    expect(store.getState().combo.notice?.message).toContain(
      "Step 4 now needs repair",
    );
    store.dispatch(truncateFrom(3));
    expect(steps(store)).toHaveLength(3);
    expect(selectReplay(store.getState()).failure).toBeUndefined();
  });

  it("reorders steps and replays the new order", () => {
    const store = threeSteps();
    store.dispatch(moveStep({ id: steps(store)[1]!.id, delta: 1 }));
    expect(steps(store).map(({ action: { kind } }) => kind)).toEqual([
      "normal-summon",
      "send-to-graveyard",
      "note",
    ]);
    expect(selectReplay(store.getState()).boards).toHaveLength(4);
    store.dispatch(moveStep({ id: steps(store)[0]!.id, delta: -1 }));
    expect(steps(store)[0]!.action.kind).toBe("normal-summon");
  });

  it("inserts a step at the viewed position and revalidates later steps", () => {
    const store = threeSteps();
    store.dispatch(setView(1));
    store.dispatch(armInsert());
    const board = boards(store)[1]!;
    const action = buildCardAction(board, 1, "activate-effect");
    if ("error" in action) throw new Error(action.error);
    store.dispatch(record(action, [], 1));
    expect(steps(store).map(({ action: { kind } }) => kind)).toEqual([
      "normal-summon",
      "activate-effect",
      "note",
      "send-to-graveyard",
    ]);
    expect(store.getState().combo.view).toBe(2);
    expect(selectReplay(store.getState()).failure).toBeUndefined();
  });

  it("duplicates only steps that do not create or move cards", () => {
    const store = threeSteps();
    store.dispatch(duplicateStep({ id: steps(store)[1]!.id }));
    expect(steps(store)).toHaveLength(4);
    store.dispatch(duplicateStep({ id: steps(store)[0]!.id }));
    expect(steps(store)).toHaveLength(4);
    expect(store.getState().combo.notice?.error).toBe(true);
  });

  it("undoes timeline edits together with the board", () => {
    const store = threeSteps();
    store.dispatch(deleteStep(steps(store)[2]!.id));
    expect(cardsIn(boards(store).at(-1)!, "player-monster-1")).toHaveLength(1);
    store.dispatch(undo());
    expect(steps(store)).toHaveLength(3);
    expect(cardsIn(boards(store).at(-1)!, "player-graveyard")).toHaveLength(1);
  });
});
