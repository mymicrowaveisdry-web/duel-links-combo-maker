import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import type { CardDefinition } from "../src/data/catalog";
import {
  buildCardAction,
  buildDuelAction,
  buildMoveAction,
} from "../src/domain/actions";
import { cardsIn } from "../src/domain/board";
import {
  comboReducer,
  record,
  redo,
  selectReplay,
  setupChange,
  undo,
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

/** A fresh store with the app reducer for each test. */
function createStore() {
  return configureStore({ reducer: { combo: comboReducer } });
}

function lastBoard(store: ReturnType<typeof createStore>) {
  return selectReplay(store.getState()).boards.at(-1)!;
}

function recordSummon(store: ReturnType<typeof createStore>) {
  const built = buildMoveAction({
    board: lastBoard(store),
    source: { kind: "instance", instanceId: 1 },
    card: rod,
    destination: "player-monster-1",
    kind: "normal-summon",
  });
  if (!built.ok) throw new Error(built.message);
  store.dispatch(record(built.action));
}

function prepared() {
  const store = createStore();
  store.dispatch(
    setupChange({
      type: "place",
      source: { kind: "catalog", definitionId: rod.id },
      card: rod,
      destination: "player-hand",
    }),
  );
  return store;
}

describe("combo store", () => {
  it("records steps on top of the starting board without changing it", () => {
    const store = prepared();
    recordSummon(store);
    const { doc } = store.getState().combo;
    expect(doc.steps).toHaveLength(1);
    expect(cardsIn(doc.initialBoard, "player-hand")).toHaveLength(1);
    expect(cardsIn(lastBoard(store), "player-monster-1")).toHaveLength(1);
    expect(doc.cards[String(rod.id)]?.name).toBe("Magician's Rod");
  });

  it("undoes and redoes board and steps together, and drops redo after a new step", () => {
    const store = prepared();
    recordSummon(store);
    store.dispatch(undo());
    expect(store.getState().combo.doc.steps).toHaveLength(0);
    expect(cardsIn(lastBoard(store), "player-hand")).toHaveLength(1);
    store.dispatch(redo());
    expect(store.getState().combo.doc.steps).toHaveLength(1);
    store.dispatch(undo());
    store.dispatch(
      record(buildDuelAction(lastBoard(store), "note", { detail: "Plan" })),
    );
    expect(store.getState().combo.future).toEqual([]);
  });

  it("rejects a setup change that would break a recorded step", () => {
    const store = prepared();
    recordSummon(store);
    store.dispatch(setupChange({ type: "remove", id: 1 }));
    const state = store.getState().combo;
    expect(state.notice).toMatchObject({ error: true });
    expect(state.notice?.message).toContain("step 1");
    expect(state.doc.initialBoard.instances).toHaveLength(1);
  });

  it("groups steps under an activation until the group is closed", () => {
    const store = prepared();
    recordSummon(store);
    const activate = buildCardAction(lastBoard(store), 1, "activate-effect");
    if ("error" in activate) throw new Error(activate.error);
    store.dispatch(record(activate));
    const target = buildCardAction(lastBoard(store), 1, "target");
    if ("error" in target) throw new Error(target.error);
    store.dispatch(record(target));
    const phase = buildDuelAction(lastBoard(store), "change-phase", {
      phase: "Battle",
    });
    store.dispatch(record(phase));
    const steps = store.getState().combo.doc.steps;
    expect(steps[1]!.groupId).toBe(steps[1]!.id);
    expect(steps[2]!.groupId).toBe(steps[1]!.id);
    expect(steps[3]!.groupId).toBeUndefined();
    expect(store.getState().combo.openGroup).toBeNull();
  });
});
