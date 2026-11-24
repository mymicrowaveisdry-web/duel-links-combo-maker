import type { z } from "zod";
import { appConfig, servedUrl } from "../config";
import { cardSchema, catalogSchema } from "./catalog-schema.mjs";

export type CardDefinition = z.infer<typeof cardSchema>;
export type Catalog = z.infer<typeof catalogSchema>;

export interface CardFilters {
  query: string;
  category: CardDefinition["category"] | "";
  kind: string;
  attribute: string;
  archetype: string;
  rating: string;
  minimumAttack: string;
  minimumDefense: string;
}

export const emptyFilters: CardFilters = {
  query: "",
  category: "",
  kind: "",
  attribute: "",
  archetype: "",
  rating: "",
  minimumAttack: "",
  minimumDefense: "",
};

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function indexCards(cards: CardDefinition[]) {
  return cards.map((card) => ({
    card,
    name: normalize(card.name),
    text: normalize(
      [
        card.name,
        card.description,
        card.type,
        card.attribute,
        card.race,
        card.archetype,
      ].join(" "),
    ),
  }));
}

export function filterCards(
  index: ReturnType<typeof indexCards>,
  filters: CardFilters,
) {
  const query = normalize(filters.query);
  const terms = query.split(" ").filter(Boolean);
  const rating = filters.rating === "" ? null : Number(filters.rating);
  const attack =
    filters.minimumAttack === "" ? null : Number(filters.minimumAttack);
  const defense =
    filters.minimumDefense === "" ? null : Number(filters.minimumDefense);
  const nameMatches: CardDefinition[] = [];
  const otherMatches: CardDefinition[] = [];

  for (const { card, name, text } of index) {
    if (filters.category && filters.category !== card.category) continue;
    if (filters.kind && !card.kinds.includes(filters.kind)) continue;
    if (filters.attribute && filters.attribute !== card.attribute) continue;
    if (filters.archetype && filters.archetype !== card.archetype) continue;
    if (
      rating !== null &&
      (card.rank ?? card.linkRating ?? card.level) !== rating
    )
      continue;
    if (attack !== null && (card.attack ?? -1) < attack) continue;
    if (defense !== null && (card.defense ?? -1) < defense) continue;
    if (!terms.every((term) => text.includes(term))) continue;
    if (query && name.includes(query)) nameMatches.push(card);
    else otherMatches.push(card);
  }
  return nameMatches.concat(otherMatches);
}

export async function loadCatalog(signal: AbortSignal) {
  const response = await fetch(servedUrl(appConfig.served.catalog), {
    signal,
  });
  if (!response.ok)
    throw new Error(`Catalog request failed (${response.status}).`);
  return catalogSchema.parse(await response.json());
}
