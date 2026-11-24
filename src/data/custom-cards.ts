// Custom cards (guide §8.6). They fill gaps in the dataset with what the author
// enters, are always marked as custom and never pass for verified dataset entries.
import type { CardDefinition } from "./catalog";
import { cardSchema } from "./catalog-schema.mjs";

/** Custom IDs sit above both the passcode and the placeholder ranges. */
export const firstCustomId = 2_000_000_000;
const customIdSpan = 1_000_000_000;

export const monsterFrames = [
  "Normal",
  "Effect",
  "Ritual",
  "Fusion",
  "Synchro",
  "Xyz",
  "Link",
] as const;
export type MonsterFrame = (typeof monsterFrames)[number];

export const spellIcons = [
  "Normal",
  "Quick-Play",
  "Continuous",
  "Equip",
  "Field",
  "Ritual",
] as const;
export const trapIcons = ["Normal", "Continuous", "Counter"] as const;
export const attributes = [
  "DARK",
  "LIGHT",
  "EARTH",
  "WATER",
  "FIRE",
  "WIND",
  "DIVINE",
] as const;

/** What the custom card form collects. Empty strings mean "not given". */
export interface CustomCardDraft {
  name: string;
  category: CardDefinition["category"];
  frame: MonsterFrame;
  effect: boolean;
  pendulum: boolean;
  tuner: boolean;
  icon: string;
  description: string;
  attribute: string;
  race: string;
  rating: string;
  scale: string;
  attack: string;
  defense: string;
  image?: string;
}

export const emptyDraft: CustomCardDraft = {
  name: "",
  category: "Monster",
  frame: "Effect",
  effect: true,
  pendulum: false,
  tuner: false,
  icon: "Normal",
  description: "",
  attribute: "",
  race: "",
  rating: "",
  scale: "",
  attack: "",
  defense: "",
};

export function isCustom(card: Pick<CardDefinition, "custom">) {
  return card.custom === true;
}

/** A fresh ID that no listed card uses. */
export function newCustomId(taken: (id: number) => boolean) {
  const random = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(random);
    const id = firstCustomId + (random[0]! % customIdSpan);
    if (!taken(id)) return id;
  }
}

/** "?" or a whole number. Returns undefined when empty, NaN when invalid. */
function statOf(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  if (text === "?") return -1;
  return /^\d{1,5}$/.test(text) ? Number(text) : Number.NaN;
}

function ratingOf(value: string, max: number) {
  const text = value.trim();
  if (!text) return undefined;
  const number = Number(text);
  return /^\d{1,2}$/.test(text) && number <= max ? number : Number.NaN;
}

/** Type line and kinds that match the dataset's conventions, so zone rules apply. */
function monsterType(draft: CustomCardDraft) {
  const frame = draft.frame;
  const main = frame !== "Normal" && frame !== "Effect";
  const effect = frame === "Effect" || (main && draft.effect);
  const pendulum = draft.pendulum && frame !== "Link";
  const words = [
    main ? frame : undefined,
    pendulum ? "Pendulum" : undefined,
    draft.tuner ? "Tuner" : undefined,
    frame === "Normal" ? "Normal" : effect ? "Effect" : undefined,
    "Monster",
  ].filter(Boolean);
  const kinds = [
    frame,
    ...(main && effect ? ["Effect"] : []),
    ...(pendulum ? ["Pendulum"] : []),
    ...(draft.tuner ? ["Tuner"] : []),
  ];
  return { type: words.join(" "), kinds, pendulum };
}

export type DraftResult =
  { ok: true; card: CardDefinition } | { ok: false; error: string };

/** Turns the form into a validated custom card definition. */
export function buildCustomCard(
  draft: CustomCardDraft,
  id: number,
): DraftResult {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: "Enter the card name." };
  if (name.length > 120)
    return { ok: false, error: "Keep the name to 120 characters." };
  const description = draft.description.trim();
  if (description.length > 5000)
    return { ok: false, error: "Keep the description to 5,000 characters." };
  const base = {
    id,
    name,
    description,
    custom: true as const,
    ...(draft.image ? { image: draft.image } : {}),
  };
  let card: CardDefinition;
  if (draft.category === "Spell" || draft.category === "Trap") {
    const icons: readonly string[] =
      draft.category === "Spell" ? spellIcons : trapIcons;
    const icon = icons.includes(draft.icon) ? draft.icon : "Normal";
    card = {
      ...base,
      type: `${icon} ${draft.category}`,
      category: draft.category,
      kinds: [],
      race: icon,
    };
  } else {
    const attack = statOf(draft.attack);
    const defense = statOf(draft.defense);
    if (Number.isNaN(attack) || Number.isNaN(defense))
      return { ok: false, error: "Use a whole number or ? for ATK and DEF." };
    const token = draft.category === "Token";
    const shape = token
      ? { type: "Token", kinds: [], pendulum: false }
      : monsterType(draft);
    const link = !token && draft.frame === "Link";
    const xyz = !token && draft.frame === "Xyz";
    const rating = ratingOf(draft.rating, link ? 8 : 13);
    const scale = shape.pendulum ? ratingOf(draft.scale, 13) : undefined;
    if (Number.isNaN(rating))
      return {
        ok: false,
        error: link
          ? "Link Rating must be 1 to 8."
          : "Level or Rank must be 0 to 13.",
      };
    if (Number.isNaN(scale))
      return { ok: false, error: "Pendulum Scale must be 0 to 13." };
    card = {
      ...base,
      type: shape.type,
      category: token ? "Token" : "Monster",
      kinds: shape.kinds,
      ...(draft.attribute ? { attribute: draft.attribute } : {}),
      ...(draft.race.trim() ? { race: draft.race.trim().slice(0, 40) } : {}),
      ...(rating === undefined
        ? {}
        : link
          ? { linkRating: rating }
          : xyz
            ? { rank: rating }
            : { level: rating }),
      ...(scale === undefined ? {} : { scale }),
      ...(attack === undefined ? {} : { attack }),
      ...(defense === undefined || link ? {} : { defense }),
    };
  }
  const parsed = cardSchema.safeParse(card);
  return parsed.success
    ? { ok: true, card: parsed.data }
    : { ok: false, error: "The card data is invalid." };
}

/** Fills the form from an existing custom card, for editing. */
export function draftOf(card: CardDefinition): CustomCardDraft {
  const frame =
    monsterFrames.find(
      (kind) => kind !== "Effect" && card.kinds.includes(kind),
    ) ?? "Effect";
  const show = (value?: number) =>
    value === undefined ? "" : value < 0 ? "?" : String(value);
  return {
    name: card.name,
    category: card.category,
    frame,
    effect: frame === "Effect" || card.kinds.includes("Effect"),
    pendulum: card.kinds.includes("Pendulum"),
    tuner: card.kinds.includes("Tuner"),
    icon: card.category === "Monster" ? "Normal" : (card.race ?? "Normal"),
    description: card.description,
    attribute: card.attribute ?? "",
    race: card.category === "Monster" ? (card.race ?? "") : "",
    rating: show(card.level ?? card.rank ?? card.linkRating),
    scale: show(card.scale),
    attack: show(card.attack),
    defense: show(card.defense),
    ...(card.image ? { image: card.image } : {}),
  };
}

export const maximumImageBytes = 10 * 1024 * 1024;
const imageWidth = 168;
const imageHeight = 246;

/**
 * Reads a local image, crops it to the card shape and re-encodes it as a small
 * JPEG. Re-encoding drops metadata and any non-image content.
 */
export async function importCardImage(file: File): Promise<string> {
  if (!/^image\/(?:png|jpeg|webp)$/.test(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > maximumImageBytes)
    throw new Error("The image is larger than 10 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("The browser could not read that image.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The browser could not process the image.");
  const scale = Math.max(
    imageWidth / bitmap.width,
    imageHeight / bitmap.height,
  );
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.fillStyle = "#000";
  context.fillRect(0, 0, imageWidth, imageHeight);
  context.drawImage(
    bitmap,
    (imageWidth - width) / 2,
    (imageHeight - height) / 2,
    width,
    height,
  );
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}
