import { useDraggable } from "@dnd-kit/core";
import {
  Diamond,
  Flame,
  GripVertical,
  Layers2,
  Shield,
  Sparkles,
  Swords,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { useArtwork } from "../data/artwork";
import type { CardDefinition } from "../data/catalog";
import type { CardInstance, Placement } from "../domain/board";

export function cardStyle(card: CardDefinition) {
  if (card.category === "Spell") return "spell";
  if (card.category === "Trap") return "trap";
  return (
    ["Link", "Xyz", "Synchro", "Fusion", "Ritual", "Pendulum", "Normal"].find(
      (kind) => card.kinds.includes(kind),
    ) ?? "Effect"
  ).toLowerCase();
}

export function CardGlyph({
  card,
  size = 22,
}: {
  card: CardDefinition;
  size?: number;
}) {
  const tone = cardStyle(card);
  const Glyph =
    {
      spell: Sparkles,
      trap: Shield,
      link: Zap,
      xyz: Diamond,
      normal: Swords,
      effect: Flame,
    }[tone] ?? Layers2;
  return <Glyph size={size} aria-hidden="true" />;
}

export function CardFace({
  card,
  instance,
}: {
  card: CardDefinition;
  instance?: CardInstance;
}) {
  if (instance && !instance.faceUp) {
    return (
      <span
        className={`card-face card-back ${instance.position === "defense" ? "in-defense" : ""}`}
        aria-hidden="true"
      >
        <Diamond size={21} />
        <span>Face-down</span>
      </span>
    );
  }
  return <FrontFace card={card} defense={instance?.position === "defense"} />;
}

/** Returns the mirrored image URL until it fails to load, then undefined for the text fallback. */
function useCardImage(card: CardDefinition) {
  const url = useArtwork(card.id);
  const [broken, setBroken] = useState<string>();
  return {
    src: url && url !== broken ? url : undefined,
    onError: () => setBroken(url),
  };
}

function CardImage({
  src,
  onError,
  className,
}: {
  src: string;
  onError: () => void;
  className?: string;
}) {
  return (
    <img
      className={className}
      src={src}
      alt=""
      width={168}
      height={246}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={onError}
    />
  );
}

function FrontFace({
  card,
  defense,
}: {
  card: CardDefinition;
  defense: boolean;
}) {
  const image = useCardImage(card);
  return (
    <span
      className={`card-face tone-${cardStyle(card)} ${defense ? "in-defense" : ""} ${image.src ? "has-image" : ""}`}
      aria-hidden="true"
    >
      {image.src ? (
        <CardImage
          className="card-image"
          src={image.src}
          onError={image.onError}
        />
      ) : (
        <span className="card-art">
          <CardGlyph card={card} size={28} />
        </span>
      )}
      <span className="face-name">{card.name}</span>
    </span>
  );
}

function CatalogThumb({ card }: { card: CardDefinition }) {
  const image = useCardImage(card);
  return (
    <span
      className={`catalog-thumb tone-${cardStyle(card)} ${image.src ? "has-image" : ""}`}
    >
      {image.src ? (
        <CardImage src={image.src} onError={image.onError} />
      ) : (
        <CardGlyph card={card} size={19} />
      )}
    </span>
  );
}

export function CatalogRow({
  card,
  selected,
  onSelect,
}: {
  card: CardDefinition;
  selected: boolean;
  onSelect: () => void;
}) {
  const source: Placement = { kind: "catalog", definitionId: card.id };
  const { setNodeRef, isDragging, listeners } = useDraggable({
    id: `catalog-${card.id}`,
    data: { source },
  });
  return (
    <button
      type="button"
      className={`catalog-row ${isDragging ? "dragging" : ""}`}
      ref={setNodeRef}
      aria-pressed={selected}
      title={card.name}
      onClick={onSelect}
      {...listeners}
    >
      <CatalogThumb card={card} />
      <span className="catalog-card-text">
        <strong>{card.name}</strong>
        <small>{card.type}</small>
      </span>
      <GripVertical className="drag-grip" size={15} aria-hidden="true" />
    </button>
  );
}

export function BoardCard({
  card,
  instance,
  selected,
  onSelect,
  compact = false,
  materials = 0,
}: {
  card: CardDefinition;
  instance: CardInstance;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
  materials?: number;
}) {
  const source: Placement = { kind: "instance", instanceId: instance.id };
  const { setNodeRef, isDragging, listeners } = useDraggable({
    id: `instance-${instance.id}`,
    data: { source },
  });
  const pose = `${instance.faceUp ? "face-up" : "face-down"}${instance.position === "defense" ? " defense" : ""}`;
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={`board-card ${compact ? "compact-card" : ""} ${isDragging ? "dragging" : ""}`}
      aria-pressed={selected}
      aria-label={`${card.name}, copy ${instance.id}, ${pose}${materials ? `, ${materials} Xyz material${materials === 1 ? "" : "s"}` : ""}`}
      title={`${card.name} · ${pose}`}
      onClick={onSelect}
      {...listeners}
    >
      <CardFace card={card} instance={instance} />
      {materials > 0 && (
        <span className="material-badge" aria-hidden="true">
          {materials}
        </span>
      )}
    </button>
  );
}

export function formatStat(stat: number) {
  return stat < 0 ? "?" : stat.toLocaleString("en");
}
