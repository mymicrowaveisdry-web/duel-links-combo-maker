import { Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { loadSkills, looksLikeRushSkill, searchSkills } from "../data/skills";
import type { SkillCatalog, SkillRecord } from "../data/skills";
import type { CharacterSnapshot, SkillSnapshot } from "../domain/combo";

const resultLimit = 60;

/** Character and Skill summary shown beside the player's side of the mat. */
export function DuelistSummary({
  character,
  skill,
  canEdit,
  canActivate,
  onEdit,
  onActivate,
}: {
  character?: CharacterSnapshot;
  skill?: SkillSnapshot;
  canEdit: boolean;
  canActivate: boolean;
  onEdit: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="duelist">
      <p>
        <UserRound size={14} aria-hidden="true" />
        <span className="visually-hidden">Character:</span>
        {character?.name ?? "Character unspecified"}
      </p>
      <p title={skill?.description}>
        <Sparkles size={14} aria-hidden="true" />
        <span className="visually-hidden">Skill:</span>
        {skill ? skill.name : "No Skill"}
        {skill?.origin === "custom" && (
          <small className="entry-tag">Custom</small>
        )}
      </p>
      <div className="duelist-actions">
        <button
          type="button"
          className="text-button"
          disabled={!canEdit}
          onClick={onEdit}
        >
          Character &amp; Skill
        </button>
        {canActivate && (
          <button type="button" className="subtle-button" onClick={onActivate}>
            Activate Skill
          </button>
        )}
      </div>
    </div>
  );
}

type Choice = "dataset" | "custom" | "none";

/** Chooses the combo's character and Skill. The Skill list loads on first open. */
export function SkillDialog({
  open,
  character,
  skill,
  onSave,
  onClose,
}: {
  open: boolean;
  character?: CharacterSnapshot;
  skill?: SkillSnapshot;
  onSave: (value: {
    character: CharacterSnapshot | null;
    skill: SkillSnapshot | null;
  }) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="settings-dialog skill-dialog"
      aria-labelledby="skill-title"
      onClose={onClose}
    >
      {open && (
        <SkillForm
          character={character}
          skill={skill}
          onSave={onSave}
          onCancel={() => dialog.current?.close()}
        />
      )}
    </dialog>
  );
}

function SkillForm({
  character,
  skill,
  onSave,
  onCancel,
}: {
  character?: CharacterSnapshot;
  skill?: SkillSnapshot;
  onSave: (value: {
    character: CharacterSnapshot | null;
    skill: SkillSnapshot | null;
  }) => void;
  onCancel: () => void;
}) {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState(character?.name ?? "");
  const [choice, setChoice] = useState<Choice>(
    !skill ? "none" : skill.origin === "custom" ? "custom" : "dataset",
  );
  const [query, setQuery] = useState(
    skill?.origin === "dataset" ? skill.name : "",
  );
  const [hideRush, setHideRush] = useState(true);
  const [selected, setSelected] = useState<string | null>(
    skill?.origin === "dataset" ? (skill.id ?? null) : null,
  );
  const [customName, setCustomName] = useState(
    skill?.origin === "custom" ? skill.name : "",
  );
  const [customText, setCustomText] = useState(
    skill?.origin === "custom" ? (skill.description ?? "") : "",
  );
  const ids = {
    character: useId(),
    query: useId(),
    customName: useId(),
    customText: useId(),
    hint: useId(),
  };

  useEffect(() => {
    let live = true;
    loadSkills()
      .then((value) => live && setCatalog(value))
      .catch(
        () =>
          live &&
          setLoadError(
            "The Skill list couldn’t load. You can still add a custom Skill.",
          ),
      );
    return () => {
      live = false;
    };
  }, [attempt]);

  const results = useMemo(
    () => (catalog ? searchSkills(catalog.skills, query, hideRush) : []),
    [catalog, query, hideRush],
  );
  const picked: SkillRecord | undefined = catalog?.skills.find(
    ({ id }) => id === selected,
  );
  const valid =
    choice === "none" ||
    (choice === "dataset" && Boolean(picked)) ||
    (choice === "custom" && customName.trim().length > 0);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    const capturedAt = new Date().toISOString();
    let next: SkillSnapshot | null = null;
    if (choice === "dataset" && picked && catalog)
      next = {
        id: picked.id,
        name: picked.name,
        ...(picked.description ? { description: picked.description } : {}),
        origin: "dataset",
        sourceName: `${catalog.sourceName} snapshot ${catalog.importedAt.slice(0, 10)}`,
        ...(picked.sourceUrl ? { sourceUrl: picked.sourceUrl } : {}),
        capturedAt,
      };
    // Keep the original capture date when the same dataset Skill is saved again.
    if (next && skill?.origin === "dataset" && skill.id === next.id)
      next = skill;
    if (choice === "custom")
      next = {
        name: customName.trim(),
        ...(customText.trim() ? { description: customText.trim() } : {}),
        origin: "custom",
        capturedAt,
      };
    onSave({
      character: name.trim() ? { name: name.trim() } : null,
      skill: next,
    });
  }

  return (
    <form onSubmit={submit} autoComplete="off">
      <div className="dialog-title">
        <h2 id="skill-title">Character &amp; Skill</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close character and Skill"
          onClick={onCancel}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="settings-fields single">
        <label htmlFor={ids.character}>
          Character (optional)
          <input
            id={ids.character}
            value={name}
            maxLength={60}
            placeholder="Unspecified"
            aria-describedby={ids.hint}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <small id={ids.hint} className="editor-hint">
          Free text. The bundled data has no character list or character–Skill
          links, so Skills are not filtered by character.
        </small>
      </div>
      <fieldset className="choice-list choice-row">
        <legend>Skill</legend>
        {(
          [
            ["dataset", "From the Skill list"],
            ["custom", "Custom Skill"],
            ["none", "No Skill"],
          ] as const
        ).map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name="skill-choice"
              checked={choice === value}
              onChange={() => setChoice(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {choice === "dataset" && (
        <div className="skill-picker">
          <div className="settings-fields single">
            <label htmlFor={ids.query}>
              Search Skills
              <input
                id={ids.query}
                type="search"
                value={query}
                placeholder="Name or text…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={hideRush}
              onChange={(event) => setHideRush(event.target.checked)}
            />
            Hide likely Rush Duel Skills (text uses [REQUIREMENT]/[EFFECT])
          </label>
          {loadError ? (
            <p className="form-error" role="alert">
              {loadError}{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setLoadError("");
                  setAttempt(attempt + 1);
                }}
              >
                Retry
              </button>
            </p>
          ) : !catalog ? (
            <p className="choice-empty" role="status">
              Loading Skills…
            </p>
          ) : (
            <>
              <p className="choice-empty" role="status">
                {results.length === 0
                  ? "No Skills match."
                  : results.length > resultLimit
                    ? `Showing ${resultLimit} of ${results.length}. Refine the search.`
                    : `${results.length} Skill${results.length === 1 ? "" : "s"}.`}
              </p>
              <fieldset className="choice-list skill-results">
                <legend className="visually-hidden">Matching Skills</legend>
                {results.slice(0, resultLimit).map((row) => (
                  <label key={row.id}>
                    <input
                      type="radio"
                      name="skill-pick"
                      checked={selected === row.id}
                      onChange={() => setSelected(row.id)}
                    />
                    <span>
                      {row.name}
                      {looksLikeRushSkill(row) && (
                        <small>Rush Duel format</small>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>
              {picked && (
                <div className="skill-text">
                  <strong>{picked.name}</strong>
                  <p>
                    {picked.description ?? "No description in the snapshot."}
                  </p>
                  {picked.sourceUrl && (
                    <a href={picked.sourceUrl} target="_blank" rel="noreferrer">
                      Source page
                    </a>
                  )}
                </div>
              )}
              <small className="editor-hint">
                {catalog.sourceName} snapshot of{" "}
                {catalog.importedAt.slice(0, 10)}. Coverage and Speed/Rush split
                are unverified.
              </small>
            </>
          )}
        </div>
      )}

      {choice === "custom" && (
        <div className="settings-fields single">
          <label htmlFor={ids.customName}>
            Skill name
            <input
              id={ids.customName}
              value={customName}
              maxLength={80}
              required
              onChange={(event) => setCustomName(event.target.value)}
            />
          </label>
          <label htmlFor={ids.customText}>
            Skill text (optional)
            <textarea
              id={ids.customText}
              rows={4}
              maxLength={1200}
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className="dialog-actions">
        <button type="button" className="subtle-button" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={!valid}>
          Save
        </button>
      </div>
    </form>
  );
}
