import { configureStore, createSlice, current } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { applyBoardAction, createBoard } from "./domain/board";
import type { Board, BoardAction } from "./domain/board";

interface SetupState {
  board: Board;
  past: Board[];
  future: Board[];
  notice: { message: string; error: boolean } | null;
}

const initialState: SetupState = {
  board: createBoard(),
  past: [],
  future: [],
  notice: null,
};
const setup = createSlice({
  name: "setup",
  initialState,
  reducers: {
    execute(state, { payload }: PayloadAction<BoardAction>) {
      const previous = current(state.board);
      const result = applyBoardAction(previous, payload);
      state.notice = { message: result.message, error: !result.ok };
      if (!result.ok) return;
      state.past.push(previous);
      if (state.past.length > 80) state.past.shift();
      state.board = result.board;
      state.future = [];
    },
    undo(state) {
      const previous = state.past.pop();
      if (!previous) return;
      state.future.push(state.board);
      state.board = previous;
      state.notice = { message: "Setup change undone.", error: false };
    },
    redo(state) {
      const next = state.future.pop();
      if (!next) return;
      state.past.push(state.board);
      state.board = next;
      state.notice = { message: "Setup change restored.", error: false };
    },
  },
});

export const store = configureStore({ reducer: { setup: setup.reducer } });
export const { execute, undo, redo } = setup.actions;
export const useAppDispatch = useDispatch.withTypes<typeof store.dispatch>();
export const useAppSelector =
  useSelector.withTypes<ReturnType<typeof store.getState>>();
