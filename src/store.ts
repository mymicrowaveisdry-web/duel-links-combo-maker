import {
  configureStore,
  createSelector,
  createSlice,
  current,
} from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import type { CardDefinition } from "./data/catalog";
import { canDuplicate, describeAction, kindInfo } from "./domain/actions";
import { applyBoardAction, createBoard } from "./domain/board";
import type { BoardAction } from "./domain/board";
import {
  applyAction,
  createComboDocument,
  replay,
  withCards,
} from "./domain/combo";
import type {
  CharacterSnapshot,
  ComboAction,
  ComboDocument,
  ComboStep,
  SkillSnapshot,
} from "./domain/combo";

/** Setup edits the starting board, Record adds steps, Replay only views them. */
export type Mode = "setup" | "recording" | "replay";

/** One undoable state: the whole document plus the open step group. */
interface Snapshot {
  doc: ComboDocument;
  openGroup: string | null;
}

interface ComboState extends Snapshot {
  mode: Mode;
  /**
   * Viewed board: 0 is the starting board and n is the board after step n. null
   * follows the latest step. Viewing is not part of the undo history.
   */
  view: number | null;
  /** The author chose to insert new steps at the viewed step instead of the end. */
  insertArmed: boolean;
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
  view: null,
  insertArmed: false,
  past: [],
  future: [],
  notice: null,
};

/** Describes the replay state of a candidate document for the status message. */
function repairNote(doc: ComboDocument) {
  const failure = replay(doc).failure;
  return failure && failure.index >= 0
    ? ` Step ${failure.index + 1} now needs repair.`
    : "";
}

function commit(state: ComboState, next: Snapshot, message: string) {
  state.past.push({ doc: current(state.doc), openGroup: state.openGroup });
  if (state.past.length > historyLimit) state.past.shift();
  state.future = [];
  state.doc = next.doc;
  state.openGroup = next.openGroup;
  state.notice = { message, error: false };
  if (state.view !== null && state.view > next.doc.steps.length)
    state.view = next.doc.steps.length;
}

/** Steps whose group head was removed become ungrouped. */
function tidyGroups(steps: ComboStep[]): ComboStep[] {
  const ids = new Set(steps.map(({ id }) => id));
  return steps.map((step) => {
    if (!step.groupId || ids.has(step.groupId)) return step;
    const rest = { ...step };
    delete rest.groupId;
    return rest;
  });
}

function editSteps(
  state: ComboState,
  steps: ComboStep[],
  now: string,
  message: string,
) {
  const doc = current(state.doc);
  const tidy = tidyGroups(steps);
  const next = { ...doc, steps: tidy, updatedAt: now };
  const openGroup =
    state.openGroup && tidy.some(({ id }) => id === state.openGroup)
      ? state.openGroup
      : null;
  commit(state, { doc: next, openGroup }, `${message}${repairNote(next)}`);
}

const stamp = <T>(value: T) => ({
  payload: { value, now: new Date().toISOString() },
});

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
          state.view = null;
          state.insertArmed = false;
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
            : action.type === "load-deck"
              ? [...action.main, ...action.extra]
              : action.type === "alternatives"
                ? action.cards
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
    /**
     * Records a step. Without `at` it is appended. With `at` it is inserted after
     * board `at` and the later steps are revalidated.
     */
    record: {
      prepare: (
        action: ComboAction,
        newCards: CardDefinition[] = [],
        at?: number,
      ) => ({
        payload: {
          action,
          newCards,
          at,
          id: newId(),
          now: new Date().toISOString(),
        },
      }),
      reducer(
        state,
        {
          payload: { action, newCards, at, id, now },
        }: PayloadAction<{
          action: ComboAction;
          newCards: CardDefinition[];
          at: number | undefined;
          id: string;
          now: string;
        }>,
      ) {
        const doc = current(state.doc);
        const replayed = replay(doc);
        const index = at ?? doc.steps.length;
        const before = replayed.boards[index];
        if (!before || index > doc.steps.length) {
          state.notice = {
            message: "Repair the highlighted step before recording there.",
            error: true,
          };
          return;
        }
        const cards = withCards(doc.cards, newCards);
        const result = applyAction(before, action, cards);
        if (!result.ok) {
          state.notice = { message: result.message, error: true };
          return;
        }
        const info = kindInfo[action.kind];
        const appending = index === doc.steps.length;
        // Appended steps follow the open group. Inserted steps join their neighbour's.
        const inherited = appending
          ? state.openGroup
          : (doc.steps[index - 1]?.groupId ?? null);
        const group = info.closesGroup ? null : inherited;
        const groupId = info.opensGroup ? id : (group ?? undefined);
        const step: ComboStep = { id, action, ...(groupId ? { groupId } : {}) };
        const steps = [...doc.steps];
        steps.splice(index, 0, step);
        const next = { ...doc, cards, steps, updatedAt: now };
        commit(
          state,
          {
            doc: next,
            openGroup: appending
              ? info.opensGroup
                ? id
                : group
              : state.openGroup,
          },
          `Step ${index + 1}: ${describeAction(action, before, cards)}${appending ? "" : repairNote(next)}`,
        );
        if (!appending) state.view = index + 1;
      },
    },
    /** Saves an edited description and notes. Empty text restores the generated one. */
    updateStep: {
      prepare: (value: {
        id: string;
        customDescription?: string;
        notes?: string;
      }) => stamp(value),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{
          value: { id: string; customDescription?: string; notes?: string };
          now: string;
        }>,
      ) {
        const steps = current(state.doc).steps.map((step) => {
          if (step.id !== value.id) return step;
          const rest = { ...step };
          delete rest.customDescription;
          delete rest.notes;
          const description = value.customDescription?.trim();
          const notes = value.notes?.trim();
          return {
            ...rest,
            ...(description ? { customDescription: description } : {}),
            ...(notes ? { notes } : {}),
          };
        });
        editSteps(state, steps, now, "Step updated.");
      },
    },
    deleteStep: {
      prepare: (id: string) => stamp(id),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{ value: string; now: string }>,
      ) {
        const steps = current(state.doc).steps;
        const index = steps.findIndex(({ id }) => id === value);
        if (index < 0) return;
        editSteps(
          state,
          steps.filter(({ id }) => id !== value),
          now,
          `Step ${index + 1} deleted.`,
        );
      },
    },
    /** Removes a step and everything after it, after the author confirmed. */
    truncateFrom: {
      prepare: (index: number) => stamp(index),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{ value: number; now: string }>,
      ) {
        const steps = current(state.doc).steps;
        if (value < 0 || value >= steps.length) return;
        editSteps(
          state,
          steps.slice(0, value),
          now,
          `Removed steps ${value + 1}–${steps.length}.`,
        );
        state.view = null;
        state.insertArmed = false;
      },
    },
    duplicateStep: {
      prepare: (value: { id: string; newId?: string }) =>
        stamp({ ...value, newId: value.newId ?? newId() }),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{ value: { id: string; newId: string }; now: string }>,
      ) {
        const steps = [...current(state.doc).steps];
        const index = steps.findIndex(({ id }) => id === value.id);
        const original = steps[index];
        if (!original || !canDuplicate(original.action)) {
          state.notice = {
            message:
              "Only steps that do not create or move cards can be duplicated.",
            error: true,
          };
          return;
        }
        const { groupId, ...copy } = original;
        const grouped = groupId && groupId !== original.id ? { groupId } : {};
        steps.splice(index + 1, 0, { ...copy, ...grouped, id: value.newId });
        editSteps(state, steps, now, `Step ${index + 1} duplicated.`);
      },
    },
    /** Moves a step up or down. Later steps are revalidated. */
    moveStep: {
      prepare: (value: { id: string; delta: -1 | 1 }) => stamp(value),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{
          value: { id: string; delta: -1 | 1 };
          now: string;
        }>,
      ) {
        const steps = [...current(state.doc).steps];
        const index = steps.findIndex(({ id }) => id === value.id);
        const target = index + value.delta;
        if (index < 0 || target < 0 || target >= steps.length) return;
        [steps[index], steps[target]] = [steps[target]!, steps[index]!];
        editSteps(state, steps, now, `Step moved to position ${target + 1}.`);
      },
    },
    /** Sets the character and Skill for the whole combo. null clears either one. */
    setDuelist: {
      prepare: (value: {
        character: CharacterSnapshot | null;
        skill: SkillSnapshot | null;
      }) => stamp(value),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{
          value: {
            character: CharacterSnapshot | null;
            skill: SkillSnapshot | null;
          };
          now: string;
        }>,
      ) {
        const doc = { ...current(state.doc), updatedAt: now };
        delete doc.character;
        delete doc.skill;
        const name = value.character?.name.trim();
        const next: ComboDocument = {
          ...doc,
          ...(name ? { character: { name } } : {}),
          ...(value.skill ? { skill: value.skill } : {}),
        };
        commit(
          state,
          { doc: next, openGroup: state.openGroup },
          value.skill
            ? `Skill set to ${value.skill.name}.`
            : "Combo set to use no Skill.",
        );
      },
    },
    /** Renames the combo and sets its description. */
    setDetails: {
      prepare: (value: { title: string; description: string }) => stamp(value),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{
          value: { title: string; description: string };
          now: string;
        }>,
      ) {
        const doc = { ...current(state.doc), updatedAt: now };
        const title = value.title.trim() || "Untitled combo";
        const description = value.description.trim();
        delete doc.description;
        commit(
          state,
          {
            doc: { ...doc, title, ...(description ? { description } : {}) },
            openGroup: state.openGroup,
          },
          `Combo renamed to ${title}.`,
        );
      },
    },
    /**
     * Replaces the combo's snapshot of an edited custom card. The change is refused
     * when it would make the starting board or a recorded step invalid.
     */
    reviseCard: {
      prepare: (value: CardDefinition) => stamp(value),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{ value: CardDefinition; now: string }>,
      ) {
        const doc = current(state.doc);
        const key = String(value.id);
        if (!doc.cards[key]?.custom || !value.custom) return;
        const next: ComboDocument = {
          ...doc,
          cards: { ...doc.cards, [key]: value },
          updatedAt: now,
        };
        const failure = replay(next).failure;
        if (failure) {
          state.notice = {
            message:
              failure.index < 0
                ? `That edit doesn't fit the starting board: ${failure.message}`
                : `That edit would break step ${failure.index + 1}: ${failure.message}`,
            error: true,
          };
          return;
        }
        commit(
          state,
          { doc: next, openGroup: state.openGroup },
          `Updated ${value.name} in this combo.`,
        );
      },
    },
    setDeckAware: {
      prepare: (value: boolean) => stamp(value),
      reducer(
        state,
        {
          payload: { value, now },
        }: PayloadAction<{ value: boolean; now: string }>,
      ) {
        const doc = { ...current(state.doc), updatedAt: now };
        delete doc.deckAware;
        commit(
          state,
          {
            doc: value ? { ...doc, deckAware: true } : doc,
            openGroup: state.openGroup,
          },
          value
            ? "Deck-aware recording on. Cards come from the modelled Decks unless added from outside."
            : "Free-form recording on. Cards can come straight from the card browser.",
        );
      },
    },
    /**
     * Opens a validated document (a saved combo, a recovered draft or an import). It
     * replaces the open combo and clears undo history.
     */
    loadDocument(
      state,
      { payload }: PayloadAction<{ doc: ComboDocument; message: string }>,
    ) {
      state.doc = payload.doc;
      state.openGroup = null;
      state.mode = "setup";
      state.view = null;
      state.insertArmed = false;
      state.past = [];
      state.future = [];
      state.notice = { message: payload.message, error: false };
    },
    setView(state, { payload }: PayloadAction<number | null>) {
      const last = state.doc.steps.length;
      state.view =
        payload === null || payload >= last ? null : Math.max(0, payload);
      state.insertArmed = false;
    },
    armInsert(state) {
      state.insertArmed = true;
      state.notice = {
        message: `New steps are inserted after step ${state.view ?? 0}. Later steps are revalidated.`,
        error: false,
      };
    },
    inform(state, { payload }: PayloadAction<string>) {
      state.notice = { message: payload, error: false };
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
      state.insertArmed = false;
      if (payload === "setup") state.view = null;
      state.notice = {
        message:
          payload === "recording"
            ? "Recording. Board changes now become combo steps."
            : payload === "replay"
              ? "Replay. Step through the combo without changing it."
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
      state.view = null;
      state.insertArmed = false;
      state.notice = { message: "Change undone.", error: false };
    },
    redo(state) {
      const next = state.future.pop();
      if (!next) return;
      state.past.push({ doc: current(state.doc), openGroup: state.openGroup });
      state.doc = next.doc;
      state.openGroup = next.openGroup;
      state.view = null;
      state.insertArmed = false;
      state.notice = { message: "Change restored.", error: false };
    },
  },
});

export const comboReducer = combo.reducer;
export const store = configureStore({ reducer: { combo: comboReducer } });
export const {
  setupChange,
  record,
  updateStep,
  deleteStep,
  truncateFrom,
  duplicateStep,
  moveStep,
  setDuelist,
  setDetails,
  setDeckAware,
  reviseCard,
  loadDocument,
  setView,
  armInsert,
  inform,
  notify,
  closeGroup,
  setMode,
  undo,
  redo,
} = combo.actions;
export type RootState = ReturnType<typeof store.getState>;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();

/** Replays the document once per change. */
export const selectReplay = createSelector(
  [(state: RootState) => state.combo.doc],
  (doc) => replay(doc),
);
