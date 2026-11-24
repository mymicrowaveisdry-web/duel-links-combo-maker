// Opening-hand placeholders (guide §11.1). They stand for "any card of a kind" so a
// combo never presents an arbitrary real card as part of the starting hand. They are
// shown with a Token card's artwork and their own label, and are always marked as
// placeholders in the UI and exports.
import type { CardDefinition } from "./catalog";

/** Clone Token: a neutral silhouette used as the face of every placeholder. */
export const placeholderArtworkId = 86871615;

/** Placeholder IDs sit above the 8-digit passcode range so they never collide. */
const firstPlaceholderId = 1_000_000_000;

function placeholder(
  offset: number,
  name: string,
  description: string,
  category: CardDefinition["category"],
  wildcard: boolean,
  extra: Partial<CardDefinition> = {},
): CardDefinition {
  return {
    id: firstPlaceholderId + offset,
    name,
    description,
    type: "Placeholder",
    category,
    kinds: [],
    placeholder: wildcard ? "wildcard" : "typed",
    artworkId: placeholderArtworkId,
    ...extra,
  };
}

export const genericPlaceholders: readonly CardDefinition[] = [
  placeholder(
    1,
    "Any card",
    "Stands for any card in the hand.",
    "Monster",
    true,
  ),
  placeholder(
    2,
    "Any monster",
    "Stands for any monster card.",
    "Monster",
    false,
  ),
  placeholder(
    3,
    "Any Spell Card",
    "Stands for any Spell Card.",
    "Spell",
    false,
  ),
  placeholder(4, "Any Trap Card", "Stands for any Trap Card.", "Trap", false),
  placeholder(
    5,
    "Generic discard fodder",
    "Any card the combo can discard or use as a cost.",
    "Monster",
    true,
  ),
];

/** FNV-1a, so an archetype always maps to the same placeholder ID. */
function hash(text: string) {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0)!;
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

export function archetypePlaceholder(archetype: string): CardDefinition {
  return placeholder(
    1000 + (hash(archetype.toLowerCase()) % 900_000_000),
    `Any "${archetype}" card`,
    `Stands for any card of the "${archetype}" archetype.`,
    "Monster",
    true,
    { archetype },
  );
}

export function isPlaceholder(card: Pick<CardDefinition, "placeholder">) {
  return card.placeholder !== undefined;
}

/** The card whose image should be shown for a definition. */
export function artworkIdOf(card: Pick<CardDefinition, "id" | "artworkId">) {
  return card.artworkId ?? card.id;
}
