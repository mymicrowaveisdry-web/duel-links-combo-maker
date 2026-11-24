import { X } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { phases } from "../domain/board";
import type { Board, BoardAction, Phase, Side } from "../domain/board";

type SettingsAction = Extract<BoardAction, { type: "settings" }>;

export function BoardSettings({
  dialog,
  board,
  error,
  onSave,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  board: Board;
  error: string;
  onSave: (action: SettingsAction) => void;
}) {
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      type: "settings",
      settings: {
        life: {
          player: Number(values.get("player-lp")),
          opponent: Number(values.get("opponent-lp")),
        },
        handSize: Number(values.get("hand-size")),
        turn: Number(values.get("turn")),
        phase: values.get("phase") as Phase,
        active: values.get("active") as Side,
        pendulum: {
          player: values.has("player-pendulum"),
          opponent: values.has("opponent-pendulum"),
        },
        ...(values.get("going") === "first" || values.get("going") === "second"
          ? { going: values.get("going") as "first" | "second" }
          : {}),
      },
    });
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="settings-title"
      className="settings-dialog"
    >
      <form onSubmit={save} autoComplete="off">
        <div className="dialog-title">
          <h2 id="settings-title">Board Settings</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close board settings"
            onClick={() => dialog.current?.close()}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="settings-fields">
          <label>
            Player LP
            <input
              type="number"
              required
              min="0"
              max="999999"
              name="player-lp"
              defaultValue={board.life.player}
            />
          </label>
          <label>
            Opponent LP
            <input
              type="number"
              required
              min="0"
              max="999999"
              name="opponent-lp"
              defaultValue={board.life.opponent}
            />
          </label>
          <label>
            Opening hand size
            <input
              type="number"
              required
              min="0"
              max="20"
              name="hand-size"
              defaultValue={board.handSize}
            />
          </label>
          <label>
            Turn
            <input
              type="number"
              required
              min="1"
              max="999"
              name="turn"
              defaultValue={board.turn}
            />
          </label>
          <label>
            Phase
            <select name="phase" defaultValue={board.phase}>
              {phases.map((phase) => (
                <option key={phase}>{phase}</option>
              ))}
            </select>
          </label>
          <label>
            Turn order
            <select name="going" defaultValue={board.going ?? ""}>
              <option value="">Not specified</option>
              <option value="first">Going first</option>
              <option value="second">Going second</option>
            </select>
          </label>
          <label>
            Active side
            <select name="active" defaultValue={board.active}>
              <option value="player">Player</option>
              <option value="opponent">Opponent</option>
            </select>
          </label>
        </div>
        <fieldset className="pendulum-settings">
          <legend>Dedicated Pendulum Zones</legend>
          <label>
            <input
              type="checkbox"
              name="player-pendulum"
              defaultChecked={board.pendulum.player}
            />{" "}
            Player
          </label>
          <label>
            <input
              type="checkbox"
              name="opponent-pendulum"
              defaultChecked={board.pendulum.opponent}
            />{" "}
            Opponent
          </label>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="subtle-button"
            onClick={() => dialog.current?.close()}
          >
            Cancel
          </button>
          <button type="submit" className="primary-button">
            Apply Settings
          </button>
        </div>
      </form>
    </dialog>
  );
}
