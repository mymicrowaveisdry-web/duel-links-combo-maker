import { useId, useState } from "react";
import type { FormEvent } from "react";
import type { buildCardAction } from "../domain/actions";
import { isMonsterZone } from "../domain/board";
import type { CardInstance, StatKey, Zone } from "../domain/board";
import type { ActionKind } from "../domain/combo";

type Options = Parameters<typeof buildCardAction>[3];

const extraKinds = [
  ["add-counter", "Add counter"],
  ["remove-counter", "Remove counter"],
  ["attack", "Set ATK"],
  ["defense", "Set DEF"],
  ["level", "Set Level"],
  ["rank", "Set Rank"],
  ["custom-marker", "Add status marker"],
] as const;
type ExtraKind = (typeof extraKinds)[number][0];

/** Recording-mode actions for a selected card that change state without moving it. */
export function CardActions({
  instance,
  zone,
  link,
  onRecord,
}: {
  instance: CardInstance;
  zone: Zone;
  link: boolean;
  onRecord: (kind: ActionKind, options?: Options) => void;
}) {
  const monster = isMonsterZone(zone);
  const onField = zone.single;
  const buttons: Array<[ActionKind, string]> = [
    ["activate-effect", "Activate Effect"],
  ];
  if (onField && !monster && !instance.faceUp)
    buttons.push(["activate-card", "Activate Card"]);
  buttons.push(["target", "Target"], ["negate-effect", "Negate Effect"]);
  if (onField) buttons.push(["mark-negated", "Mark Negated"]);
  buttons.push(["mark-used", "Mark Effect Used"]);
  if (monster && !link) buttons.push(["change-position", "Change Position"]);
  if (monster && !instance.faceUp)
    buttons.push(
      ["flip-summon", "Flip Summon"],
      ["flip-face-up", "Flip Face-up"],
    );
  if (onField && instance.faceUp && !link)
    buttons.push(["flip-face-down", "Turn Face-down"]);
  if (onField) buttons.push(["change-control", "Change Control"]);

  return (
    <div className="record-actions">
      <div className="record-grid">
        {buttons.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            className="subtle-button"
            onClick={() => onRecord(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      {onField && <MoreActions onRecord={onRecord} />}
    </div>
  );
}

function MoreActions({
  onRecord,
}: {
  onRecord: (kind: ActionKind, options?: Options) => void;
}) {
  const [kind, setKind] = useState<ExtraKind>("add-counter");
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("1");
  const ids = { kind: useId(), text: useId(), amount: useId() };
  const counter = kind === "add-counter" || kind === "remove-counter";
  const stat = !counter && kind !== "custom-marker";
  const number = Number(amount);
  const valid =
    (counter && text.trim() && Number.isInteger(number) && number > 0) ||
    (stat && amount.trim() === "") ||
    (stat && Number.isInteger(number) && number >= 0 && number <= 99_999) ||
    (kind === "custom-marker" && text.trim());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    if (counter) onRecord(kind, { counter: text, delta: number });
    else if (stat)
      onRecord("modify-stat", {
        stat: kind as StatKey,
        value: amount.trim() === "" ? null : number,
      });
    else onRecord("custom-marker", { marker: text });
    setText("");
  }

  return (
    <details className="more-actions">
      <summary>Counters, stats and markers</summary>
      <form onSubmit={submit} className="settings-fields" autoComplete="off">
        <label htmlFor={ids.kind}>
          Change
          <select
            id={ids.kind}
            value={kind}
            onChange={(event) => setKind(event.target.value as ExtraKind)}
          >
            {extraKinds.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!stat && (
          <label htmlFor={ids.text}>
            {counter ? "Counter name" : "Marker"}
            <input
              id={ids.text}
              value={text}
              maxLength={40}
              placeholder={counter ? "Spell" : "Cannot be destroyed…"}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
        )}
        {kind !== "custom-marker" && (
          <label htmlFor={ids.amount}>
            {counter ? "Amount" : "New value (empty resets)"}
            <input
              id={ids.amount}
              type="number"
              min={counter ? 1 : 0}
              max={99999}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          className="subtle-button wide-field"
          disabled={!valid}
        >
          Record Change
        </button>
      </form>
    </details>
  );
}
