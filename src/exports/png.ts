// Draws a combo guide with the Canvas 2D API. The layout is independent of the editor
// viewport. Card art comes only from same-origin images, so the canvas is never
// tainted, and any missing image is drawn as a readable text placeholder.
import type { CardDefinition } from "../data/catalog";
import { isCustom } from "../data/custom-cards";
import { artworkIdOf, isPlaceholder } from "../data/placeholders";
import { cardLine, countNames } from "./model";
import type { ExportCard, ExportModel, ExportSlot } from "./model";

export interface PngOptions {
  layout: "vertical" | "horizontal" | "endboard";
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

const pad = 36;
/** Page widths in CSS pixels. The horizontal guide is a landscape image. */
const pageWidths = { vertical: 880, horizontal: 1600, endboard: 880 } as const;

/** Where content goes on a page: left edge, content width and page width. */
interface Frame {
  x: number;
  inner: number;
  page: number;
}

function frameFor(layout: PngOptions["layout"]): Frame {
  const page = pageWidths[layout];
  return { x: pad, inner: page - pad * 2, page };
}
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
export function pageLimit(
  scale: number,
  pageWidth: number = pageWidths.vertical,
) {
  const byArea = 16_000_000 / (pageWidth * scale * scale);
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
    // Placeholders show Token art and custom images may lack a name, so both get
    // a readable label and a tag that marks them as not from the dataset.
    if (card.card && (isPlaceholder(card.card) || isCustom(card.card))) {
      const size = Math.max(8, Math.round(w / 7.5));
      setFont(ctx, size, 700);
      const lines = wrapLines(
        (t) => ctx.measureText(t).width,
        card.name,
        w - 6,
      ).slice(0, 3);
      const band = lines.length * size * 1.15 + 6;
      ctx.fillStyle = "#120e1be6";
      ctx.fillRect(x, y + h - band, w, band);
      ctx.fillStyle = "#fff8ff";
      ctx.textAlign = "center";
      lines.forEach((line, index) =>
        ctx.fillText(
          line,
          x + w / 2,
          y + h - band + 3 + size + index * size * 1.15 - 2,
        ),
      );
      ctx.textAlign = "left";
    }
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
  const unverified =
    faceUp && card.card && (isPlaceholder(card.card) || isCustom(card.card));
  if (unverified && card.card) {
    const tag = isPlaceholder(card.card) ? "Placeholder" : "Custom";
    const tagSize = Math.max(7, Math.round(w / 10));
    setFont(ctx, tagSize, 700);
    ctx.fillStyle = "#120e1be6";
    ctx.fillRect(x, y, w, tagSize + 5);
    ctx.fillStyle = tag === "Custom" ? "#fcd34d" : "#c4b5fd";
    ctx.textAlign = "center";
    ctx.fillText(tag, x + w / 2, y + tagSize + 1);
    ctx.textAlign = "left";
  }
  ctx.restore();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 5);
  ctx.stroke();
  ctx.restore();
}

function sectionTitle(palette: Palette, frame: Frame, text: string): Block {
  return {
    height: 46,
    draw: (c, top) => {
      c.strokeStyle = palette.border;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(frame.x, top + 10);
      c.lineTo(frame.x + frame.inner, top + 10);
      c.stroke();
      c.fillStyle = palette.accent;
      setFont(c, 14, 750);
      c.fillText(text.toUpperCase(), frame.x, top + 36);
    },
  };
}

function textBlock(
  ctx: Context,
  palette: Palette,
  frame: Frame,
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
  let lines = wrapLines((t) => ctx.measureText(t).width, text, frame.inner);
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
        c.fillText(line, frame.x, top + size + index * lineHeight),
      );
    },
  };
}

function cardRow(
  palette: Palette,
  images: Images,
  frame: Frame,
  cards: readonly ExportCard[],
  [w, h]: readonly [number, number],
): Block {
  const perRow = Math.max(1, Math.floor((frame.inner + 8) / (w + 8)));
  const rows = Math.ceil(cards.length / perRow);
  return {
    height: rows * (h + 8) + 4,
    draw: (c, top) =>
      cards.forEach((card, index) =>
        drawCard(
          c,
          palette,
          images,
          frame.x + (index % perRow) * (w + 8),
          top + Math.floor(index / perRow) * (h + 8),
          w,
          h,
          card,
        ),
      ),
  };
}

/** Two stacks of blocks drawn next to each other as one unsplittable block. */
function sideBySide(
  left: readonly Block[],
  right: readonly Block[],
  gapAfter = 0,
): Block {
  const total = (blocks: readonly Block[]) =>
    blocks.reduce((sum, block) => sum + block.height, 0);
  return {
    height: Math.max(total(left), total(right)) + gapAfter,
    draw: (c, top) => {
      for (const stack of [left, right]) {
        let y = top;
        for (const block of stack) {
          block.draw(c, y);
          y += block.height;
        }
      }
    },
  };
}

/** Vertical layout: one step per row, with a down arrow between steps. */
function stepBlock(
  ctx: Context,
  palette: Palette,
  images: Images,
  frame: Frame,
  step: ExportModel["steps"][number],
  [w, h]: readonly [number, number],
  notes: boolean,
  last: boolean,
): Block {
  const indent = step.grouped ? 26 : 0;
  const textX = frame.x + indent + w + 14 + 34;
  const textWidth = frame.x + frame.inner - textX;
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
      const x = frame.x + indent;
      if (step.grouped) {
        c.fillStyle = palette.border;
        c.fillRect(frame.x + 8, top - 4, 2, body + 14 + connector);
      }
      drawStepCard(c, palette, images, step, x, top, w, h);
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

/** The step's card, or a marker for steps without one (a star for Skills). */
function drawStepCard(
  c: Context,
  palette: Palette,
  images: Images,
  step: ExportModel["steps"][number],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (step.card) {
    drawCard(c, palette, images, x, y, w, h, {
      card: step.card,
      name: step.card.name,
    });
    return;
  }
  roundRect(c, x, y, w, h, 5);
  c.fillStyle = palette.surface;
  c.fill();
  c.fillStyle = step.skill ? "#d4a514" : palette.muted;
  setFont(c, Math.round(w / 2.4), 700);
  c.textAlign = "center";
  c.fillText(step.skill ? "★" : "•", x + w / 2, y + h / 2 + w / 7);
  c.textAlign = "left";
}

/** Minimum tile width; tiles stretch to fill each row. */
const tileWidth = 204;
const tileGap = 30;

/**
 * Horizontal layout: steps read left to right as tiles joined by arrows and wrap
 * into rows. Each row is its own block, so long combos split between rows.
 */
function stepTileRows(
  ctx: Context,
  palette: Palette,
  images: Images,
  frame: Frame,
  steps: ExportModel["steps"],
  [w, h]: readonly [number, number],
  notes: boolean,
): Block[] {
  const perRow = Math.max(
    1,
    Math.floor((frame.inner + tileGap) / (tileWidth + tileGap)),
  );
  // Stretch the tiles so each full row spans the page.
  const span = (frame.inner - (perRow - 1) * tileGap) / perRow;
  const textWidth = span - 20;
  const tiles = steps.map((step) => {
    setFont(ctx, 14.5);
    const lines = wrapLines(
      (t) => ctx.measureText(t).width,
      step.text,
      textWidth,
    );
    setFont(ctx, 12.5, 400, "italic");
    const noteLines =
      notes && step.notes
        ? wrapLines((t) => ctx.measureText(t).width, step.notes, textWidth)
        : [];
    const height =
      10 +
      h +
      10 +
      lines.length * 20 +
      (noteLines.length ? 4 + noteLines.length * 17 : 0) +
      10;
    return { step, lines, noteLines, height };
  });
  const rows: Block[] = [];
  for (let start = 0; start < tiles.length; start += perRow) {
    const row = tiles.slice(start, start + perRow);
    const rowHeight = Math.max(...row.map((tile) => tile.height));
    const lastRow = start + perRow >= tiles.length;
    rows.push({
      height: rowHeight + (lastRow ? 8 : tileGap),
      draw: (c, top) => {
        row.forEach((tile, index) => {
          const x = frame.x + index * (span + tileGap);
          roundRect(c, x + 0.5, top + 0.5, span - 1, rowHeight - 1, 8);
          c.fillStyle = palette.surface;
          c.fill();
          c.strokeStyle = palette.border;
          c.lineWidth = 1;
          c.stroke();
          if (tile.step.grouped) {
            // Steps that resolve as part of an activation get an accent edge.
            c.fillStyle = palette.accent;
            c.fillRect(x + 1, top + 8, 3, rowHeight - 16);
          }
          c.fillStyle = palette.accent;
          setFont(c, 22, 750);
          c.fillText(
            String(tile.step.number).padStart(2, "0"),
            x + 12,
            top + 34,
          );
          drawStepCard(
            c,
            palette,
            images,
            tile.step,
            x + span - 10 - w,
            top + 10,
            w,
            h,
          );
          const textTop = top + 10 + h + 10;
          c.fillStyle = palette.text;
          setFont(c, 14.5);
          tile.lines.forEach((line, lineIndex) =>
            c.fillText(line, x + 10, textTop + 14 + lineIndex * 20),
          );
          c.fillStyle = palette.muted;
          setFont(c, 12.5, 400, "italic");
          tile.noteLines.forEach((line, lineIndex) =>
            c.fillText(
              line,
              x + 10,
              textTop + 14 + tile.lines.length * 20 + 4 + lineIndex * 17,
            ),
          );
          const next = start + index + 1 < tiles.length;
          if (next && index < row.length - 1) {
            // Right arrow to the next tile in the row.
            const ax = x + span + 6;
            const ay = top + 10 + h / 2;
            c.strokeStyle = palette.muted;
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(ax, ay);
            c.lineTo(ax + tileGap - 12, ay);
            c.moveTo(ax + tileGap - 16, ay - 4);
            c.lineTo(ax + tileGap - 12, ay);
            c.lineTo(ax + tileGap - 16, ay + 4);
            c.stroke();
          }
        });
        if (!lastRow) {
          // The flow continues at the start of the next row.
          c.fillStyle = palette.muted;
          setFont(c, 12.5, 650);
          c.textAlign = "right";
          c.fillText(
            `continues with ${String(row.at(-1)!.step.number + 1).padStart(2, "0")} ↓`,
            frame.x + frame.inner,
            top + rowHeight + 19,
          );
          c.textAlign = "left";
        }
      },
    });
  }
  return rows;
}

const boardGap = 12;
const boardLabelHeight = 34;

/** Width the final board needs for its widest row. */
function boardWidth(model: ExportModel) {
  const widest = Math.max(
    model.endboard.extraMonsters.length,
    1 + model.endboard.monsters.length,
    model.endboard.pendulum.length + model.endboard.spells.length,
  );
  return widest * boardCard[0] + (widest - 1) * boardGap;
}

function boardBlock(
  palette: Palette,
  images: Images,
  frame: Frame,
  model: ExportModel,
): Block {
  const [w, h] = boardCard;
  const gap = boardGap;
  const slotHeight = h + boardLabelHeight;
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
        let x = frame.x + (frame.inner - total) / 2;
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
  const frame = frameFor(options.layout);
  const horizontal = options.layout === "horizontal";
  const blocks: Block[] = [];
  const thumb = thumbSizes[options.thumb];
  const text = (
    value: string,
    size: number,
    style: Parameters<typeof textBlock>[5] = {},
    area: Frame = frame,
  ) => textBlock(ctx, palette, area, value, size, style);
  const muted = (value: string, size: number, area: Frame = frame) =>
    text(value, size, { color: palette.muted }, area);

  blocks.push({ height: pad - 6, draw: () => undefined });
  blocks.push(text(model.title, 32, { weight: 750, gapAfter: 4 }));
  blocks.push(
    muted(
      `${model.format}${model.going ? `  ·  ${model.going}` : ""}${model.character ? `  ·  ${model.character}` : ""}`,
      15,
    ),
  );
  blocks.push(
    text(
      `Skill: ${model.skill ? `${model.skill.name}${model.skill.custom ? " (custom)" : ""}` : "None"}`,
      16,
      { color: palette.accent, weight: 650 },
    ),
  );
  if (options.skillText && model.skill?.description)
    blocks.push(
      text(model.skill.description, 13.5, {
        color: palette.muted,
        maxLines: 10,
      }),
    );
  if (model.description)
    blocks.push(text(model.description, 15, { gapAfter: 4 }));

  /** Remaining hand, Graveyard and banished cards. */
  const leftovers = (area: Frame) => {
    const list: Block[] = [];
    const hand = model.endboard.hand;
    list.push(
      text(
        `Remaining hand: ${hand.length} card${hand.length === 1 ? "" : "s"}`,
        15,
        { weight: 650 },
        area,
      ),
    );
    if (hand.length) list.push(cardRow(palette, images, area, hand, thumb));
    if (options.graveyard)
      list.push(
        muted(
          `Graveyard: ${countNames(model.endboard.graveyard).join(", ") || "None"}`,
          14,
          area,
        ),
      );
    if (options.banished)
      list.push(
        muted(
          `Banished: ${countNames(model.endboard.banished).join(", ") || "None"}`,
          14,
          area,
        ),
      );
    return list;
  };

  const endboard = () => {
    blocks.push(sectionTitle(palette, frame, "Final board"));
    if (horizontal) {
      // The field on the left, what is left over beside it.
      const board = { ...frame, inner: boardWidth(model) };
      const sideX = board.x + board.inner + 48;
      const side = { ...frame, x: sideX, inner: frame.x + frame.inner - sideX };
      blocks.push(
        sideBySide(
          [boardBlock(palette, images, board, model)],
          leftovers(side),
        ),
      );
    } else {
      blocks.push(boardBlock(palette, images, frame, model));
      blocks.push(...leftovers(frame));
    }
  };

  if (options.layout !== "endboard") {
    if (options.startingHand) {
      blocks.push(sectionTitle(palette, frame, "Starting hand"));
      if (model.hand.length) {
        blocks.push(cardRow(palette, images, frame, model.hand, thumb));
        blocks.push(muted(countNames(model.hand).join("  ·  "), 13.5));
      } else blocks.push(muted("No cards specified.", 15));
    }
    blocks.push(sectionTitle(palette, frame, "Combo steps"));
    if (model.warning)
      blocks.push(text(`Warning: ${model.warning}`, 14, { color: "#f87171" }));
    if (!model.steps.length) blocks.push(muted("No steps recorded.", 15));
    if (horizontal)
      blocks.push(
        ...stepTileRows(
          ctx,
          palette,
          images,
          frame,
          model.steps,
          thumb,
          options.notes,
        ),
      );
    else
      model.steps.forEach((step, index) =>
        blocks.push(
          stepBlock(
            ctx,
            palette,
            images,
            frame,
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
    blocks.push(sectionTitle(palette, frame, ""));
    blocks.push(
      text(
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
          const url = card.custom ? card.image : urlFor(artworkIdOf(card));
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
  const width = pageWidths[options.layout];
  const limit = pageLimit(options.scale, width) - continuation;
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
