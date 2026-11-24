import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import {
  CircleDot,
  ClipboardList,
  FilePlus2,
  Layers3,
  ListOrdered,
  PencilRuler,
  Play,
  Redo2,
  Swords,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionMenu } from "./components/ActionMenu";
import type { ActionRequest } from "./components/ActionMenu";
import { BoardPanel } from "./components/BoardPanel";
import { BoardSettings } from "./components/BoardSettings";
import { DuelistSummary, SkillDialog } from "./components/Duelist";
import { PlaybackBar, SideTabs, playbackSpeeds } from "./components/Playback";
import type { PlaybackSpeed } from "./components/Playback";
import { Timeline } from "./components/Timeline";
import { CatalogPanel } from "./components/CatalogPanel";
import type { CatalogState } from "./components/CatalogPanel";
import { SetupPanel } from "./components/SetupPanel";
import type { Selection } from "./components/SetupPanel";
import { CardFace } from "./components/cards";
import { ArtworkContext, loadArtwork, noArtwork } from "./data/artwork";
import type { ArtworkLookup } from "./data/artwork";
import { loadCatalog } from "./data/catalog";
import type { CardDefinition } from "./data/catalog";
import { appConfig } from "./config";
import {
  buildCardAction,
  buildDuelAction,
  recordingTargetError,
} from "./domain/actions";
import { canPlace, zones } from "./domain/board";
import type { BoardAction, Placement, Position, ZoneId } from "./domain/board";
import type { ActionKind, ComboAction } from "./domain/combo";
import {
  armInsert,
  closeGroup,
  deleteStep,
  duplicateStep,
  moveStep,
  notify,
  record,
  setDuelist,
  setView,
  truncateFrom,
  updateStep,
  redo,
  selectReplay,
  setMode,
  setupChange,
  store,
  undo,
  useAppDispatch,
  useAppSelector,
} from "./store";
import type { Mode } from "./store";

type Pane = "catalog" | "board" | "side";
type Side = "timeline" | "setup";
const panes = [
  { pane: "catalog", side: null, label: "Cards", Icon: Layers3 },
  { pane: "board", side: null, label: "Board", Icon: Swords },
  { pane: "side", side: "timeline", label: "Steps", Icon: ListOrdered },
  { pane: "side", side: "setup", label: "Details", Icon: ClipboardList },
] as const;

const speedKey = "dlcm.playbackSpeed";
function readSpeed(): PlaybackSpeed {
  try {
    const stored = Number(localStorage.getItem(speedKey));
    return playbackSpeeds.find((speed) => speed === stored) ?? 1;
  } catch {
    return 1;
  }
}

export default function App() {
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [retry, setRetry] = useState(0);
  const [artwork, setArtwork] = useState<ArtworkLookup>(() => noArtwork);
  const [selection, select] = useState<Selection | null>(null);
  const [pending, setPending] = useState<Placement | null>(null);
  const [drag, setDrag] = useState<Placement | null>(null);
  const [pane, setPane] = useState<Pane>("board");
  const [side, setSide] = useState<Side>("timeline");
  const [speed, setSpeed] = useState<PlaybackSpeed>(readSpeed);
  // Playback runs only while this exact document is shown in Replay.
  const [playing, setPlaying] = useState<object | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [request, setRequest] = useState<ActionRequest | null>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);
  const dispatch = useAppDispatch();
  const { doc, mode, openGroup, view, insertArmed, past, future, notice } =
    useAppSelector((state) => state.combo);
  const replayed = useAppSelector(selectReplay);
  const recording = mode === "recording";
  // Last board that replays. Steps after a failing step have no board.
  const lastIndex = replayed.boards.length - 1;
  const viewIndex =
    mode === "setup" ? 0 : Math.min(view ?? lastIndex, lastIndex);
  // Setup edits the starting board. Record and Replay show the viewed step.
  const board =
    mode === "setup" ? doc.initialBoard : replayed.boards[viewIndex]!;
  // Recording at an earlier step inserts there once the author chooses to.
  const behind = recording && view !== null && view < doc.steps.length;
  const isPlaying = playing === doc && mode === "replay";
  const hasHistory = Boolean(past.length || future.length);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 7 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 7 },
    }),
  );

  useEffect(() => {
    const controller = new AbortController();
    loadCatalog(controller.signal)
      .then((value) => setCatalog({ status: "ready", value }))
      .catch(() => {
        if (!controller.signal.aborted) setCatalog({ status: "error" });
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    // Artwork is optional. Any failure keeps the text faces.
    loadArtwork(controller.signal)
      .then((lookup) => setArtwork(() => lookup))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPending(null);
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.closest("input, textarea, select") ||
          event.target.isContentEditable)
      )
        return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      event.preventDefault();
      setPending(null);
      select(null);
      dispatch(key === "y" || event.shiftKey ? redo() : undo());
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => {
      const next = viewIndex + 1;
      dispatch(setView(next));
      // Stop on reaching the final step.
      if (next >= lastIndex) setPlaying(null);
    }, 1200 / speed);
    return () => window.clearTimeout(timer);
  }, [isPlaying, viewIndex, lastIndex, speed, dispatch]);

  useEffect(() => {
    if (!hasHistory) return;
    function onLeave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [hasHistory]);

  // Catalog cards plus the snapshots saved in the combo, so recorded cards always resolve.
  const library = useMemo(() => {
    const map = new Map<number, CardDefinition>(
      catalog.status === "ready"
        ? catalog.value.cards.map((card) => [card.id, card])
        : [],
    );
    for (const card of Object.values(doc.cards))
      if (!map.has(card.id)) map.set(card.id, card);
    return map;
  }, [catalog, doc.cards]);
  const instance =
    selection?.kind === "instance"
      ? board.instances.find(({ id }) => id === selection.instanceId)
      : undefined;
  const selectedCard =
    selection?.kind === "catalog"
      ? library.get(selection.definitionId)
      : instance && library.get(instance.definitionId);

  function resolve(source: Placement): CardDefinition | undefined {
    const definitionId =
      source.kind === "catalog"
        ? source.definitionId
        : board.instances.find(({ id }) => id === source.instanceId)
            ?.definitionId;
    return definitionId === undefined ? undefined : library.get(definitionId);
  }

  function placementError(source: Placement, zone: ZoneId) {
    const card = resolve(source);
    if (!card) return "The selected card is unavailable.";
    return recording
      ? recordingTargetError(board, source, card, zone, doc.cards)
      : canPlace(board, source, card, zone);
  }

  function changePane(next: Pane, focusHeading = false, nextSide = side) {
    setPane(next);
    if (focusHeading && window.matchMedia("(max-width: 980px)").matches) {
      const target = next === "side" ? nextSide : next;
      requestAnimationFrame(() =>
        document.getElementById(`${target}-title`)?.focus(),
      );
    }
  }

  function showSide(next: Side, focusHeading = false) {
    setSide(next);
    changePane("side", focusHeading, next);
  }

  function choose(selection: Selection) {
    select(selection);
    setPending(null);
    showSide("setup", true);
  }

  /** Replay is read-only. Recording behind the latest step needs an explicit choice. */
  function blocked() {
    if (mode === "replay") {
      dispatch(
        notify("Replay is read-only. Switch to Record to change the combo."),
      );
      return true;
    }
    if (behind && !insertArmed) {
      dispatch(
        notify(
          `You are viewing step ${view}. Choose Insert here, Replace later steps or Return to latest above the board.`,
        ),
      );
      return true;
    }
    return false;
  }

  function place(source: Placement, destination: ZoneId) {
    const card = resolve(source);
    if (!card) return;
    if (blocked()) {
      setPending(null);
      return;
    }
    const error = placementError(source, destination);
    if (recording) {
      // While recording, every movement goes through the action menu.
      if (!error) {
        setRequest({ source, card, destination });
        setPending(null);
      } else dispatch(notify(error));
      return;
    }
    dispatch(setupChange({ type: "place", source, card, destination }));
    if (!error) setPending(null);
  }

  function recordAction(action: ComboAction, newCards: CardDefinition[] = []) {
    // Read the latest view at dispatch time; it decides between append and insert.
    const state = store.getState().combo;
    const at =
      state.insertArmed &&
      state.view !== null &&
      state.view < state.doc.steps.length
        ? state.view
        : undefined;
    dispatch(record(action, newCards, at));
    setRequest(null);
  }

  /** Records the Skill as it reads now. Following steps group under it. */
  function activateSkill() {
    if (blocked()) return;
    recordAction(
      buildDuelAction(board, "activate-skill", {
        skill: doc.skill ?? {
          name: "Unspecified Skill",
          origin: "unspecified",
        },
      }),
    );
  }

  function viewStep(index: number) {
    setPlaying(null);
    setConfirmReplace(false);
    if (mode === "setup") dispatch(setMode("replay"));
    dispatch(setView(index >= doc.steps.length ? null : index));
  }

  function play() {
    if (mode !== "replay") dispatch(setMode("replay"));
    if (viewIndex >= lastIndex) dispatch(setView(0));
    setPlaying(doc);
  }

  function changeSpeed(next: PlaybackSpeed) {
    setSpeed(next);
    try {
      localStorage.setItem(speedKey, String(next));
    } catch {
      // Preferences are optional.
    }
  }

  function recordCardAction(
    kind: ActionKind,
    options?: Parameters<typeof buildCardAction>[3],
  ) {
    if (!instance || blocked()) return;
    const action = buildCardAction(board, instance.id, kind, options);
    if ("error" in action) return;
    recordAction(action);
    if (kind === "remove-card") select(null);
  }

  function changeMode(next: Mode) {
    setPending(null);
    setRequest(null);
    setPlaying(null);
    setConfirmReplace(false);
    select(null);
    dispatch(setMode(next));
  }

  function chooseZone(zone: ZoneId, instanceId?: number) {
    if (pending) {
      place(pending, zone);
    } else {
      choose(
        instanceId === undefined
          ? { kind: "zone", zone }
          : { kind: "instance", instanceId },
      );
    }
  }

  function dragStart(event: DragStartEvent) {
    setDrag(
      (event.active.data.current?.source as Placement | undefined) ?? null,
    );
  }

  function dragEnd(event: DragEndEvent) {
    const source = event.active.data.current?.source as Placement | undefined;
    const zone = event.over?.data.current?.zone as ZoneId | undefined;
    setDrag(null);
    if (source && zone) place(source, zone);
  }

  function setPose(position: Position, faceUp: boolean) {
    if (instance && selectedCard)
      dispatch(
        setupChange({
          type: "pose",
          id: instance.id,
          card: selectedCard,
          position,
          faceUp,
        }),
      );
  }

  function applySettings(action: BoardAction) {
    dispatch(setupChange(action));
    const result = store.getState().combo.notice;
    if (result?.error) setSettingsError(result.message);
    else settingsDialog.current?.close();
  }

  const placement = drag ?? pending;
  const eligibility = new Map(
    placement
      ? zones.map((zone) => [zone.id, placementError(placement, zone.id)])
      : [],
  );
  const draggedCard = drag && resolve(drag);

  return (
    <>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="app-header">
        <div className="app-brand">
          <div className="app-mark">
            <Layers3 size={24} aria-hidden="true" />
          </div>
          <div>
            <h1>
              Duel Links <span>Combo Maker</span>
            </h1>
            <p>Speed Duel</p>
          </div>
        </div>
        <div className="header-controls">
          <div className="mode-switch" role="group" aria-label="Editing mode">
            <button
              type="button"
              aria-pressed={mode === "setup"}
              onClick={() => changeMode("setup")}
              title="Edit the starting board"
            >
              <PencilRuler size={15} aria-hidden="true" /> <span>Setup</span>
            </button>
            <button
              type="button"
              aria-pressed={recording}
              className="record-mode"
              onClick={() => changeMode("recording")}
              title="Record board changes as combo steps"
            >
              <CircleDot size={15} aria-hidden="true" /> <span>Record</span>
            </button>
            <button
              type="button"
              aria-pressed={mode === "replay"}
              onClick={() => changeMode("replay")}
              title="Step through the combo without changing it"
            >
              <Play size={15} aria-hidden="true" /> <span>Replay</span>
            </button>
          </div>
          <button
            type="button"
            className="subtle-button reset-button"
            disabled={!hasHistory}
            title="Start a new combo. Undo restores the previous one."
            onClick={() => {
              select(null);
              setPending(null);
              dispatch(setupChange({ type: "reset" }));
            }}
          >
            <FilePlus2 size={16} aria-hidden="true" /> <span>New Combo</span>
          </button>
          <div className="history-buttons">
            <button
              type="button"
              className="icon-button"
              aria-label="Undo"
              title="Undo (Ctrl/⌘+Z)"
              disabled={!past.length}
              onClick={() => {
                select(null);
                setPending(null);
                dispatch(undo());
              }}
            >
              <Undo2 size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Redo"
              title="Redo (Ctrl/⌘+Shift+Z)"
              disabled={!future.length}
              onClick={() => {
                select(null);
                setPending(null);
                dispatch(redo());
              }}
            >
              <Redo2 size={19} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>
      <nav className="mobile-nav" aria-label="Workspace panel">
        {panes.map(({ pane: id, side: target, label, Icon }) => (
          <button
            key={label}
            type="button"
            aria-pressed={pane === id && (!target || side === target)}
            onClick={() => (target ? showSide(target) : changePane(id))}
          >
            <Icon size={17} aria-hidden="true" /> {label}
          </button>
        ))}
      </nav>
      <ArtworkContext.Provider value={artwork}>
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={dragStart}
          onDragEnd={dragEnd}
          onDragCancel={() => setDrag(null)}
        >
          <main id="workspace" className="workspace" tabIndex={-1}>
            <CatalogPanel
              data={catalog}
              selectedId={
                selection?.kind === "catalog"
                  ? selection.definitionId
                  : undefined
              }
              onSelect={(card) =>
                choose({ kind: "catalog", definitionId: card.id })
              }
              onRetry={() => {
                setCatalog({ status: "loading" });
                setRetry(retry + 1);
              }}
              active={pane === "catalog"}
            />
            <BoardPanel
              recording={recording}
              duelist={
                <DuelistSummary
                  character={doc.character}
                  skill={doc.skill}
                  canEdit={mode !== "replay"}
                  canActivate={recording}
                  onEdit={() => setSkillOpen(true)}
                  onActivate={activateSkill}
                />
              }
              mode={mode}
              transport={
                <PlaybackBar
                  viewIndex={viewIndex}
                  lastIndex={lastIndex}
                  totalSteps={doc.steps.length}
                  playing={isPlaying}
                  speed={speed}
                  onView={viewStep}
                  onPlay={play}
                  onPause={() => setPlaying(null)}
                  onSpeed={changeSpeed}
                />
              }
              banner={
                behind ? (
                  <div className="view-banner" role="status">
                    <p>
                      {insertArmed
                        ? `Inserting after step ${view}. Later steps are revalidated.`
                        : `Viewing step ${view} of ${doc.steps.length}. How should new steps be recorded?`}
                    </p>
                    <div className="view-banner-actions">
                      {!insertArmed && (
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => dispatch(armInsert())}
                        >
                          Insert here
                        </button>
                      )}
                      {confirmReplace ? (
                        <button
                          type="button"
                          className="remove-button"
                          onClick={() => {
                            setConfirmReplace(false);
                            dispatch(truncateFrom(view!));
                          }}
                        >
                          Confirm: delete {doc.steps.length - view!} later step
                          {doc.steps.length - view! === 1 ? "" : "s"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="subtle-button"
                          onClick={() => setConfirmReplace(true)}
                        >
                          Replace later steps
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setConfirmReplace(false);
                          dispatch(setView(null));
                        }}
                      >
                        Return to latest
                      </button>
                    </div>
                  </div>
                ) : null
              }
              board={board}
              library={library}
              active={pane === "board"}
              selectedZone={
                selection?.kind === "zone" ? selection.zone : undefined
              }
              selectedInstance={instance?.id}
              placement={Boolean(placement)}
              eligibility={eligibility}
              onChoose={chooseZone}
              onSettings={() => {
                setSettingsError("");
                settingsDialog.current?.querySelector("form")?.reset();
                settingsDialog.current?.showModal();
              }}
            />
            {side === "timeline" ? (
              <Timeline
                active={pane === "side"}
                tabs={<SideTabs side={side} onChange={setSide} />}
                doc={doc}
                replayed={replayed}
                viewIndex={viewIndex}
                handlers={{
                  onView: viewStep,
                  onUpdate: (value) => dispatch(updateStep(value)),
                  onDelete: (id) => dispatch(deleteStep(id)),
                  onDuplicate: (id) => dispatch(duplicateStep({ id })),
                  onMove: (id, delta) => dispatch(moveStep({ id, delta })),
                  onTruncate: (index) => dispatch(truncateFrom(index)),
                }}
              />
            ) : (
              <SetupPanel
                active={pane === "side"}
                mode={mode}
                tabs={<SideTabs side={side} onChange={setSide} />}
                onRecordCard={recordCardAction}
                board={board}
                selected={selection}
                card={selectedCard}
                instance={instance}
                pending={pending}
                library={library}
                placementError={placementError}
                onSelect={choose}
                onPlace={place}
                onPick={(source) => {
                  setPending(source);
                  changePane("board", true);
                }}
                onCancel={() => setPending(null)}
                onPose={setPose}
                onRemove={() => {
                  if (!instance) return;
                  if (recording) recordCardAction("remove-card");
                  else
                    dispatch(setupChange({ type: "remove", id: instance.id }));
                  select(null);
                  setPending(null);
                }}
              />
            )}
          </main>
          <DragOverlay dropAnimation={null}>
            {draggedCard && (
              <div className="drag-preview">
                <CardFace card={draggedCard} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </ArtworkContext.Provider>
      <footer className="app-footer">
        <span className={`setup-state ${recording ? "is-recording" : ""}`}>
          {mode === "replay" ? (
            <Play size={15} aria-hidden="true" />
          ) : recording ? (
            <CircleDot size={15} aria-hidden="true" />
          ) : (
            <PencilRuler size={15} aria-hidden="true" />
          )}{" "}
          {mode === "replay"
            ? `Replay · ${viewIndex === 0 ? "start" : `step ${viewIndex}`} of ${doc.steps.length}`
            : recording
              ? `Recording · ${doc.steps.length} step${doc.steps.length === 1 ? "" : "s"}`
              : "Setup Mode"}
          {recording && openGroup && (
            <button
              type="button"
              className="text-button group-chip"
              onClick={() => dispatch(closeGroup())}
              title="Stop grouping new steps under the last activation"
            >
              End group (step{" "}
              {doc.steps.findIndex(({ id }) => id === openGroup) + 1})
            </button>
          )}
        </span>
        <div
          className={notice?.error ? "notice notice-error" : "notice"}
          role="status"
        >
          {pending ? (
            <>
              {notice?.error ? notice.message : "Choose a destination."}{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            (notice?.message ??
            "Set up the starting board, then switch to Record.")
          )}
        </div>
        <a
          href={appConfig.sources.attribution}
          target="_blank"
          rel="noreferrer"
        >
          Card data and images by YGOPRODeck
        </a>
      </footer>
      <SkillDialog
        open={skillOpen}
        character={doc.character}
        skill={doc.skill}
        onSave={(value) => {
          dispatch(setDuelist(value));
          setSkillOpen(false);
        }}
        onClose={() => setSkillOpen(false)}
      />
      <ActionMenu
        request={request}
        board={board}
        cards={doc.cards}
        onRecord={recordAction}
        onCancel={() => setRequest(null)}
      />
      <BoardSettings
        dialog={settingsDialog}
        board={doc.initialBoard}
        error={settingsError}
        onSave={applySettings}
      />
    </>
  );
}
