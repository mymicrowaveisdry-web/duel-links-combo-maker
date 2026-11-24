// Draws a combo guide with the Canvas 2D API. The layout is independent of the editor
// viewport. Card art comes only from same-origin images, so the canvas is never
// tainted, and any missing image is drawn as a readable text placeholder.
import type { CardDefinition } from "../data/catalog";
import { cardLine, countNames } from "./model";
import type { ExportCard, ExportModel, ExportSlot } from "./model";

export interface PngOptions {
  layout: "vertical" | "endboard";
  theme: "dark" | "light";
  scale: 1 | 2;
  thumb: "small" | "medium" | "large";
  startingHand: boolean;
  skillText: boolean;
  notes: boolean;
  endboard: boolean;
  graveyard: boolean;
  banished: boolean;
  attribution: boolean;
}

export const defaultPngOptions: PngOptions = {
  layout: "vertical",
  theme: "dark",
  scale: 2,
  thumb: "medium",
  startingHand: true,
  skillText: true,
  notes: true,
  endboard: true,
  graveyard: false,
  banished: false,
  attribution: true,
};

export interface PngPage {
  blob: Blob;
  width: number;
  height: number;
}

type Context = CanvasRenderingContext2D;
type Images = ReadonlyMap<number, HTMLImageElement>;

interface Block {
  height: number;
  draw: (ctx: Context, top: number) => void;
}

const width = 880;
const pad = 36;
const inner = width - pad * 2;
const font = `"Segoe UI", system-ui, -apple-system, sans-serif`;
const thumbSizes = {
  small: [40, 58],
  medium: [54, 79],
  large: [70, 102],
} as const;
const boardCard = [86, 125] as const;

const palettes = {
  dark: {
    background: "#0f0f23",
    surface: "#1e1c35",
    border: "#3d3858",
    text: "#e2e8f0",
    muted: "#a4b0c7",
    accent: "#c4b5fd",
    strong: "#7c3aed",
    back: ["#271d3c", "#392652"],
  },
  light: {
    background: "#ffffff",
    surface: "#f4f1fb",
    border: "#d6d0e6",
    text: "#1b1830",
    muted: "#555067",
    accent: "#5b21b6",
    strong: "#7c3aed",
    back: ["#d9cdf3", "#c4b2ea"],
  },
} as const;
type Palette = (typeof palettes)[keyof typeof palettes];

/** Splits text into lines that fit a width, breaking long words if needed. */
export function wrapLines(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (measure(line) > maxWidth && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Largest page height (CSS pixels) that stays within common canvas limits. */
export function pageLimit(scale: number) {
  const byArea = 16_000_000 / (width * scale * scale);
  const bySide = 32_000 / scale;
  return Math.floor(Math.min(byArea, bySide)) - 8;
}

/** Packs blocks into pages without splitting a block. */
export function paginate(heights: readonly number[], limit: number) {
  const pages: number[][] = [[]];
  let used = 0;
  heights.forEach((height, index) => {
    const page = pages.at(-1)!;
    if (page.length && used + height > limit) {
      pages.push([index]);
      used = height;
    } else {
      page.push(index);
      used += height;
    }
  });
  return pages;
}

function roundRect(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function setFont(ctx: Context, size: number, weight = 400, style = "") {
  ctx.font = `${style} ${weight} ${size}px ${font}`.trim();
}

/** Draws a card face: image, text placeholder or card back, in either position. */
function drawCard(
  ctx: Context,
  palette: Palette,
  images: Images,
  x: number,
  y: number,
  w: number,
  h: number,
  card: {
    card?: CardDefinition;
    name: string;
    faceUp?: boolean;
    defense?: boolean;
  },
) {
  const faceUp = card.faceUp ?? true;
  ctx.save();
  if (card.defense) {
    // Defense Position: the card lies sideways, centred in the same slot.
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(-Math.PI / 2);
    const scale = Math.min(w / h, 1);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    x = 0;
    y = 0;
  }
  roundRect(ctx, x, y, w, h, 5);
  ctx.save();
  ctx.clip();
  const image = card.card && faceUp ? images.get(card.card.id) : undefined;
  if (!faceUp) {
    ctx.fillStyle = palette.back[0];
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = palette.back[1];
    ctx.lineWidth = 3;
    for (let i = -h; i < w + h; i += 8) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
      ctx.stroke();
    }
  } else if (image) {
    ctx.drawImage(image, x, y, w, h);
  } else {
    ctx.fillStyle = palette.surface;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = palette.text;
    const size = Math.max(9, Math.round(w / 6.5));
    setFont(ctx, size, 650);
    const lines = wrapLines(
      (t) => ctx.measureText(t).width,
      card.name,
      w - 8,
    ).slice(0, 5);
    ctx.textAlign = "center";
    lines.forEach((line, index) => {
      ctx.fillText(
        line,
        x + w / 2,
        y +
          h / 2 -
          ((lines.length - 1) * size * 1.15) / 2 +
          index * size * 1.15 +
          size / 3,
      );
    });
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 5);
  ctx.stroke();
  ctx.restore();
}

function sectionTitle(palette: Palette, text: string): Block {
  return {
    height: 46,
    draw: (c, top) => {
      c.strokeStyle = palette.border;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(pad, top + 10);
      c.lineTo(width - pad, top + 10);
      c.stroke();
      c.fillStyle = palette.accent;
      setFont(c, 14, 750);
      c.fillText(text.toUpperCase(), pad, top + 36);
    },
  };
}

function textBlock(
  ctx: Context,
  palette: Palette,
  text: string,
  size: number,
  options: {
    color?: string;
    weight?: number;
    style?: string;
    maxLines?: number;
    gapAfter?: number;
  } = {},
): Block {
  setFont(ctx, size, options.weight ?? 400, options.style ?? "");
  let lines = wrapLines((t) => ctx.measureText(t).width, text, inner);
  if (options.maxLines && lines.length > options.maxLines)
    lines = [
      ...lines.slice(0, options.maxLines - 1),
      `${lines[options.maxLines - 1]} …`,
    ];
  const lineHeight = Math.round(size * 1.4);
  return {
    height: lines.length * lineHeight + (options.gapAfter ?? 6),
    draw: (c, top) => {
      setFont(c, size, options.weight ?? 400, options.style ?? "");
      c.fillStyle = options.color ?? palette.text;
      lines.forEach((line, index) =>
        c.fillText(line, pad, top + size + index * lineHeight),
      );
    },
  };
}

function cardRow(
  palette: Palette,
  images: Images,
  cards: readonly ExportCard[],
  [w, h]: readonly [number, number],
): Block {
  const perRow = Math.max(1, Math.floor((inner + 8) / (w + 8)));
  const rows = Math.ceil(cards.length / perRow);
  return {
    height: rows * (h + 8) + 4,
    draw: (c, top) =>
      cards.forEach((card, index) =>
        drawCard(
          c,
          palette,
          images,
          pad + (index % perRow) * (w + 8),
          top + Math.floor(index / perRow) * (h + 8),
          w,
          h,
          card,
        ),
      ),
  };
}

function stepBlock(
  ctx: Context,
  palette: Palette,
  images: Images,
  step: ExportModel["steps"][number],
  [w, h]: readonly [number, number],
  notes: boolean,
  last: boolean,
): Block {
  const indent = step.grouped ? 26 : 0;
  const textX = pad + indent + w + 14 + 34;
  const textWidth = width - pad - textX;
  setFont(ctx, 16);
  const lines = wrapLines(
    (t) => ctx.measureText(t).width,
    step.text,
    textWidth,
  );
  setFont(ctx, 13.5, 400, "italic");
  const noteLines =
    notes && step.notes
      ? wrapLines((t) => ctx.measureText(t).width, step.notes, textWidth)
      : [];
  const textHeight =
    lines.length * 22 + noteLines.length * 19 + (noteLines.length ? 4 : 0);
  const body = Math.max(h, textHeight);
  const connector = last ? 0 : 18;
  return {
    height: body + 10 + connector,
    draw: (c, top) => {
      const x = pad + indent;
      if (step.grouped) {
        c.fillStyle = palette.border;
        c.fillRect(pad + 8, top - 4, 2, body + 14 + connector);
      }
      if (step.card)
        drawCard(c, palette, images, x, top, w, h, {
          card: step.card,
          name: step.card.name,
        });
      else {
        roundRect(c, x, top, w, h, 5);
        c.fillStyle = palette.surface;
        c.fill();
        c.fillStyle = step.skill ? "#d4a514" : palette.muted;
        setFont(c, Math.round(w / 2.4), 700);
        c.textAlign = "center";
        c.fillText(step.skill ? "★" : "•", x + w / 2, top + h / 2 + w / 7);
        c.textAlign = "left";
      }
      c.fillStyle = palette.accent;
      setFont(c, 16, 750);
      c.fillText(
        `${String(step.number).padStart(2, "0")}.`,
        x + w + 12,
        top + 18,
      );
      c.fillStyle = palette.text;
      setFont(c, 16);
      lines.forEach((line, index) =>
        c.fillText(line, textX, top + 18 + index * 22),
      );
      c.fillStyle = palette.muted;
      setFont(c, 13.5, 400, "italic");
      noteLines.forEach((line, index) =>
        c.fillText(line, textX, top + 18 + lines.length * 22 + 4 + index * 19),
      );
      if (!last) {
        // Down arrow between steps.
        const cx = x + w / 2;
        const y = top + body + 6;
        c.strokeStyle = palette.muted;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(cx, y);
        c.lineTo(cx, y + 12);
        c.moveTo(cx - 4, y + 8);
        c.lineTo(cx, y + 12);
        c.lineTo(cx + 4, y + 8);
        c.stroke();
      }
    },
  };
}

function boardBlock(
  palette: Palette,
  images: Images,
  model: ExportModel,
): Block {
  const [w, h] = boardCard;
  const gap = 12;
  const labelHeight = 34;
  const slotHeight = h + labelHeight;
  const rows: ExportSlot[][] = [];
  if (model.endboard.extraMonsters.some((slot) => slot.card))
    rows.push(model.endboard.extraMonsters);
  rows.push(
    [model.endboard.field, ...model.endboard.monsters],
    [...model.endboard.pendulum, ...model.endboard.spells],
  );
  const height = rows.length * (slotHeight + gap);
  return {
    height,
    draw: (c, top) => {
      rows.forEach((row, rowIndex) => {
        const total = row.length * w + (row.length - 1) * gap;
        let x = pad + (inner - total) / 2;
        const y = top + rowIndex * (slotHeight + gap);
        for (const slot of row) {
          if (slot.card) {
            drawCard(c, palette, images, x, y, w, h, slot.card);
            if (slot.card.materials.length) {
              c.fillStyle = "#fcd34d";
              roundRect(c, x + w - 24, y + 4, 20, 20, 10);
              c.fill();
              c.fillStyle = "#1d1405";
              setFont(c, 12, 750);
              c.textAlign = "center";
              c.fillText(
                String(slot.card.materials.length),
                x + w - 14,
                y + 18,
              );
              c.textAlign = "left";
            }
          } else {
            c.setLineDash([5, 4]);
            c.strokeStyle = palette.border;
            roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, 5);
            c.stroke();
            c.setLineDash([]);
            c.fillStyle = palette.muted;
            setFont(c, 12);
            c.textAlign = "center";
            c.fillText("Empty", x + w / 2, y + h / 2 + 4);
            c.textAlign = "left";
          }
          c.fillStyle = slot.card ? palette.text : palette.muted;
          setFont(c, 11.5, slot.card ? 600 : 400);
          const label = slot.card ? cardLine(slot.card) : slot.label;
          const lines = wrapLines(
            (t) => c.measureText(t).width,
            label,
            w + gap - 2,
          ).slice(0, 2);
          c.textAlign = "center";
          lines.forEach((line, index) =>
            c.fillText(line, x + w / 2, y + h + 15 + index * 14),
          );
          c.textAlign = "left";
          x += w + gap;
        }
      });
    },
  };
}

function buildBlocks(
  ctx: Context,
  palette: Palette,
  images: Images,
  model: ExportModel,
  options: PngOptions,
): Block[] {
  const blocks: Block[] = [];
  const thumb = thumbSizes[options.thumb];
  blocks.push({ height: pad - 6, draw: () => undefined });
  blocks.push(
    textBlock(ctx, palette, model.title, 32, { weight: 750, gapAfter: 4 }),
  );
  blocks.push(
    textBlock(
      ctx,
      palette,
      `${model.format}${model.character ? `  ·  ${model.character}` : ""}`,
      15,
      {
        color: palette.muted,
      },
    ),
  );
  blocks.push(
    textBlock(
      ctx,
      palette,
      `Skill: ${model.skill ? `${model.skill.name}${model.skill.custom ? " (custom)" : ""}` : "None"}`,
      16,
      { color: palette.accent, weight: 650 },
    ),
  );
  if (options.skillText && model.skill?.description)
    blocks.push(
      textBlock(ctx, palette, model.skill.description, 13.5, {
        color: palette.muted,
        maxLines: 10,
      }),
    );
  if (model.description)
    blocks.push(
      textBlock(ctx, palette, model.description, 15, { gapAfter: 4 }),
    );

  const endboard = () => {
    blocks.push(sectionTitle(palette, "Final board"));
    blocks.push(boardBlock(palette, images, model));
    const hand = model.endboard.hand;
    blocks.push(
      textBlock(
        ctx,
        palette,
        `Remaining hand: ${hand.length} card${hand.length === 1 ? "" : "s"}`,
        15,
        {
          weight: 650,
        },
      ),
    );
    if (hand.length) blocks.push(cardRow(palette, images, hand, thumb));
    if (options.graveyard)
      blocks.push(
        textBlock(
          ctx,
          palette,
          `Graveyard: ${countNames(model.endboard.graveyard).join(", ") || "None"}`,
          14,
          {
            color: palette.muted,
          },
        ),
      );
    if (options.banished)
      blocks.push(
        textBlock(
          ctx,
          palette,
          `Banished: ${countNames(model.endboard.banished).join(", ") || "None"}`,
          14,
          {
            color: palette.muted,
          },
        ),
      );
  };

  if (options.layout === "vertical") {
    if (options.startingHand) {
      blocks.push(sectionTitle(palette, "Starting hand"));
      if (model.hand.length) {
        blocks.push(cardRow(palette, images, model.hand, thumb));
        blocks.push(
          textBlock(ctx, palette, countNames(model.hand).join("  ·  "), 13.5, {
            color: palette.muted,
          }),
        );
      } else
        blocks.push(
          textBlock(ctx, palette, "No cards specified.", 15, {
            color: palette.muted,
          }),
        );
    }
    blocks.push(sectionTitle(palette, "Combo steps"));
    if (model.warning)
      blocks.push(
        textBlock(ctx, palette, `Warning: ${model.warning}`, 14, {
          color: "#f87171",
        }),
      );
    if (!model.steps.length)
      blocks.push(
        textBlock(ctx, palette, "No steps recorded.", 15, {
          color: palette.muted,
        }),
      );
    model.steps.forEach((step, index) =>
      blocks.push(
        stepBlock(
          ctx,
          palette,
          images,
          step,
          thumb,
          options.notes,
          index === model.steps.length - 1,
        ),
      ),
    );
    if (options.endboard) endboard();
  } else endboard();

  if (options.attribution) {
    blocks.push(sectionTitle(palette, ""));
    blocks.push(
      textBlock(
        ctx,
        palette,
        "Created with Duel Links Combo Maker · Card effects documented manually; legality not verified.",
        12.5,
        { color: palette.muted, gapAfter: pad - 14 },
      ),
    );
  } else blocks.push({ height: pad - 10, draw: () => undefined });
  return blocks;
}

/** Loads same-origin card images. Missing or slow images resolve to nothing. */
export async function loadImages(
  cards: readonly CardDefinition[],
  urlFor: (cardId: number) => string | undefined,
): Promise<Map<number, HTMLImageElement>> {
  const unique = [...new Map(cards.map((card) => [card.id, card])).values()];
  const entries = await Promise.all(
    unique.map(
      (card) =>
        new Promise<[number, HTMLImageElement] | null>((resolve) => {
          const url = urlFor(card.id);
          if (!url) return resolve(null);
          const image = new Image();
          const timer = setTimeout(() => resolve(null), 8000);
          image.onload = () => {
            clearTimeout(timer);
            resolve([card.id, image]);
          };
          image.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
          image.src = url;
        }),
    ),
  );
  return new Map(
    entries.filter(
      (entry): entry is [number, HTMLImageElement] => entry !== null,
    ),
  );
}

export function modelCards(model: ExportModel): CardDefinition[] {
  const all: Array<CardDefinition | undefined> = [
    ...model.hand.map((card) => card.card),
    ...model.steps.map((step) => step.card),
    ...[
      ...model.endboard.extraMonsters,
      ...model.endboard.monsters,
      ...model.endboard.spells,
      model.endboard.field,
      ...model.endboard.pendulum,
    ].map((slot) => slot.card?.card),
    ...model.endboard.hand.map((card) => card.card),
  ];
  return all.filter((card): card is CardDefinition => Boolean(card));
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("The browser could not encode the image.")),
      "image/png",
    ),
  );
}

/**
 * Renders the guide as one or more PNG pages. Long combos are split between blocks
 * into numbered pages instead of being cropped.
 */
export async function renderPng(
  model: ExportModel,
  options: PngOptions,
  images: Images,
): Promise<PngPage[]> {
  await document.fonts?.ready;
  const palette = palettes[options.theme];
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas is unavailable in this browser.");
  const blocks = buildBlocks(measure, palette, images, model, options);
  const continuation = 54;
  const limit = pageLimit(options.scale) - continuation;
  const pages = paginate(
    blocks.map((block) => block.height),
    limit,
  );
  const result: PngPage[] = [];
  for (const [pageIndex, indices] of pages.entries()) {
    const height =
      Math.ceil(
        indices.reduce((sum, index) => sum + blocks[index]!.height, 0),
      ) + (pageIndex > 0 ? continuation : 0);
    const canvas = document.createElement("canvas");
    canvas.width = width * options.scale;
    canvas.height = height * options.scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");
    ctx.scale(options.scale, options.scale);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "alphabetic";
    let top = 0;
    if (pageIndex > 0) {
      ctx.fillStyle = palette.muted;
      setFont(ctx, 14, 650);
      ctx.fillText(
        `${model.title} — part ${pageIndex + 1} of ${pages.length}`,
        pad,
        34,
      );
      top = continuation;
    }
    for (const index of indices) {
      blocks[index]!.draw(ctx, top);
      top += blocks[index]!.height;
    }
    result.push({
      blob: await canvasBlob(canvas),
      width: canvas.width,
      height: canvas.height,
    });
    canvas.width = 0;
    canvas.height = 0;
  }
  return result;
}
