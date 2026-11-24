import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pause,
  Play,
} from "lucide-react";
import { useId } from "react";

export const playbackSpeeds = [0.5, 1, 1.5, 2] as const;
export type PlaybackSpeed = (typeof playbackSpeeds)[number];

/** Step transport. Playback only changes the viewed step, never the combo. */
export function PlaybackBar({
  viewIndex,
  lastIndex,
  totalSteps,
  playing,
  speed,
  onView,
  onPlay,
  onPause,
  onSpeed,
}: {
  viewIndex: number;
  /** Last board that replays successfully. */
  lastIndex: number;
  totalSteps: number;
  playing: boolean;
  speed: PlaybackSpeed;
  onView: (index: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (speed: PlaybackSpeed) => void;
}) {
  const speedId = useId();
  const atStart = viewIndex <= 0;
  const atEnd = viewIndex >= lastIndex;
  return (
    <div className="playback-bar" role="group" aria-label="Combo playback">
      <button
        type="button"
        className="icon-button"
        aria-label="Jump to starting hand"
        title="Starting hand"
        disabled={atStart}
        onClick={() => onView(0)}
      >
        <ChevronsLeft size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Previous step"
        title="Previous step"
        disabled={atStart}
        onClick={() => onView(viewIndex - 1)}
      >
        <ChevronLeft size={17} aria-hidden="true" />
      </button>
      {playing ? (
        <button
          type="button"
          className="icon-button play-button"
          aria-label="Pause"
          title="Pause"
          onClick={onPause}
        >
          <Pause size={17} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          className="icon-button play-button"
          aria-label="Play combo"
          title="Play"
          disabled={lastIndex === 0}
          onClick={onPlay}
        >
          <Play size={17} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className="icon-button"
        aria-label="Next step"
        title="Next step"
        disabled={atEnd}
        onClick={() => onView(viewIndex + 1)}
      >
        <ChevronRight size={17} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Jump to final step"
        title="Final step"
        disabled={atEnd}
        onClick={() => onView(lastIndex)}
      >
        <ChevronsRight size={17} aria-hidden="true" />
      </button>
      <label className="visually-hidden" htmlFor={speedId}>
        Playback speed
      </label>
      <select
        id={speedId}
        className="speed-select"
        value={speed}
        onChange={(event) =>
          onSpeed(Number(event.target.value) as PlaybackSpeed)
        }
      >
        {playbackSpeeds.map((value) => (
          <option key={value} value={value}>
            {value}×
          </option>
        ))}
      </select>
      <span className="step-indicator" aria-live="polite">
        {viewIndex === 0 ? "Start" : `Step ${viewIndex}`} / {totalSteps}
      </span>
    </div>
  );
}

/** Desktop switch between the timeline and card details in the right column. */
export function SideTabs({
  side,
  onChange,
}: {
  side: "timeline" | "setup";
  onChange: (side: "timeline" | "setup") => void;
}) {
  return (
    <div className="side-tabs" role="group" aria-label="Right panel">
      <button
        type="button"
        aria-pressed={side === "timeline"}
        onClick={() => onChange("timeline")}
      >
        Timeline
      </button>
      <button
        type="button"
        aria-pressed={side === "setup"}
        onClick={() => onChange("setup")}
      >
        Details
      </button>
    </div>
  );
}
