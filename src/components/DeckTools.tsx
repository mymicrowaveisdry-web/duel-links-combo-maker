import { AlertTriangle, Info, Upload } from "lucide-react";
import { useId } from "react";
import type { ChangeEvent } from "react";
import type { DeckWarning } from "../domain/deck";

/** YDK import, deck-aware recording and non-blocking deck warnings. */
export function DeckTools({
  deckAware,
  canImport,
  warnings,
  onDeckAware,
  onImportYdk,
}: {
  deckAware: boolean;
  canImport: boolean;
  warnings: readonly DeckWarning[];
  onDeckAware: (value: boolean) => void;
  onImportYdk: (file: File) => void;
}) {
  const fileId = useId();
  const hintId = useId();
  function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onImportYdk(file);
  }
  return (
    <div className="deck-tools">
      <div className="deck-tool-row">
        <label
          className={`subtle-button file-button ${canImport ? "" : "is-disabled"}`}
          htmlFor={fileId}
          aria-disabled={!canImport}
        >
          <Upload size={15} aria-hidden="true" /> Import YDK
        </label>
        <input
          id={fileId}
          className="visually-hidden"
          type="file"
          accept=".ydk,text/plain"
          disabled={!canImport}
          onChange={pick}
        />
      </div>
      <label className="inline-check">
        <input
          type="checkbox"
          checked={deckAware}
          aria-describedby={hintId}
          onChange={(event) => onDeckAware(event.target.checked)}
        />
        Deck-aware recording
      </label>
      <small id={hintId} className="editor-hint">
        {deckAware
          ? "While recording, cards come from the modelled Decks. Cards from the browser count as added from outside the Deck."
          : "Free-form: cards can come straight from the card browser."}
      </small>
      {warnings.length > 0 && (
        <ul className="deck-warnings" aria-label="Deck checks">
          {warnings.map(({ level, message }) => (
            <li key={message} className={`deck-${level}`}>
              {level === "warning" ? (
                <AlertTriangle size={14} aria-hidden="true" />
              ) : (
                <Info size={14} aria-hidden="true" />
              )}
              <span>{message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
