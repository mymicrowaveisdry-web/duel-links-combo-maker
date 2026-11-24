import {
  configureStore,
  createSelector,
  createSlice,
  current,
} from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import type { CardDefinition } from "./data/catalog";
import { describeAction, kindInfo } from "./domain/actions";
import { applyBoardAction, createBoard } from "./domain/board";
import type { BoardAction } from "./domain/board";
import {
  applyAction,
  createComboDocument,
  replay,
  withCards,
} from "./domain/combo";
import type { ComboAction, ComboDocument } from "./domain/combo";

export type Mode = "setup" | "recording";

/** One undoable state: the whole document plus the open step group. */
interface Snapshot {
  doc: ComboDocument;
  openGroup: string | null;
}

interface ComboState extends Snapshot {
  mode: Mode;
  past: Snapshot[];
  future: Snapshot[];
  notice: { message: string; error: boolean } | null;
}

const historyLimit = 100;

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

const initialState: ComboState = {
  doc: createComboDocument(newId(), new Date().toISOString(), createBoard()),
  openGroup: null,
  mode: "setup",
  past: [],
  future: [],
  notice: null,
};

function commit(state: ComboState, next: Snapshot, message: string) {
  state.past.push({ doc: current(state.doc), openGroup: state.openGroup });
  if (state.past.length > historyLimit) state.past.shift();
  state.future = [];
  state.doc = next.doc;
  state.openGroup = next.openGroup;
  state.notice = { message, error: false };
}

const combo = createSlice({
  name: "combo",
  initialState,
  reducers: {
    /** Edits the starting board. Recorded steps must still replay afterwards. */
    setupChange: {
      prepare: (action: BoardAction) => ({
        payload: { action, id: newId(), now: new Date().toISOString() },
      }),
      reducer(
        state,
        {
          payload: { action, id, now },
        }: PayloadAction<{ action: BoardAction; id: string; now: string }>,
      ) {
        const doc = current(state.doc);
        if (action.type === "reset") {
          commit(
            state,
            {
              doc: createComboDocument(id, now, createBoard()),
              openGroup: null,
            },
            "Started a new combo.",
          );
          return;
        }
        const result = applyBoardAction(doc.initialBoard, action);
        if (!result.ok) {
          state.notice = { message: result.message, error: true };
          return;
        }
        const card =
          action.type === "place" || action.type === "pose"
            ? [action.card]
            : [];
        const next: ComboDocument = {
          ...doc,
          initialBoard: result.board,
          cards: withCards(doc.cards, card),
          updatedAt: now,
        };
        const check = replay(next);
        if (check.failure && check.failure.index >= 0) {
          state.notice = {
            message: `That change would break step ${check.failure.index + 1}: ${check.failure.message}`,
            error: true,
          };
          return;
        }
        commit(
          state,
          { doc: next, openGroup: state.openGroup },
          result.message,
        );
      },
    },
    /** Appends a step to the end of the combo. */
    record: {
      prepare: (action: ComboAction, newCards: CardDefinition[] = []) => ({
        payload: {
          action,
          newCards,
          id: newId(),
          now: new Date().toISOString(),
        },
      }),
      reducer(
        state,
        {
          payload: { action, newCards, id, now },
        }: PayloadAction<{
          action: ComboAction;
          newCards: CardDefinition[];
          id: string;
          now: string;
        }>,
      ) {
        const doc = current(state.doc);
        const replayed = replay(doc);
        if (replayed.failure) {
          state.notice = {
            message: "Repair the combo before recording more steps.",
            error: true,
          };
          return;
        }
        const before = replayed.boards.at(-1)!;
        const cards = withCards(doc.cards, newCards);
        const result = applyAction(before, action, cards);
        if (!result.ok) {
          state.notice = { message: result.message, error: true };
          return;
        }
        const info = kindInfo[action.kind];
        const group = info.closesGroup ? null : state.openGroup;
        const groupId = info.opensGroup ? id : (group ?? undefined);
        const step = { id, action, ...(groupId ? { groupId } : {}) };
        commit(
          state,
          {
            doc: {
              ...doc,
              cards,
              steps: [...doc.steps, step],
              updatedAt: now,
            },
            openGroup: info.opensGroup ? id : group,
          },
          `Step ${doc.steps.length + 1}: ${describeAction(action, before, cards)}`,
        );
      },
    },
    notify(state, { payload }: PayloadAction<string>) {
      state.notice = { message: payload, error: true };
    },
    closeGroup(state) {
      state.openGroup = null;
      state.notice = { message: "Effect group closed.", error: false };
    },
    setMode(state, { payload }: PayloadAction<Mode>) {
      state.mode = payload;
      state.notice = {
        message:
          payload === "recording"
            ? "Recording. Board changes now become combo steps."
            : "Setup. Changes edit the starting board.",
        error: false,
      };
    },
    undo(state) {
      const previous = state.past.pop();
      if (!previous) return;
      state.future.push({
        doc: current(state.doc),
        openGroup: state.openGroup,
      });
      state.doc = previous.doc;
      state.openGroup = previous.openGroup;
      state.notice = { message: "Change undone.", error: false };
    },
    redo(state) {
      const next = state.future.pop();
      if (!next) return;
      state.past.push({ doc: current(state.doc), openGroup: state.openGroup });
      state.doc = next.doc;
      state.openGroup = next.openGroup;
      state.notice = { message: "Change restored.", error: false };
    },
  },
});

export const comboReducer = combo.reducer;
export const store = configureStore({ reducer: { combo: comboReducer } });
export const { setupChange, record, notify, closeGroup, setMode, undo, redo } =
  combo.actions;
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Replays the document once per change. */
export const selectReplay = createSelector(
  [(state: RootState) => state.combo.doc],
  (doc) => replay(doc),
);
