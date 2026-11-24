import { expect, it } from "vitest";
import { emptyFilters, filterCards, indexCards } from "../src/data/catalog";
import type { CardDefinition } from "../src/data/catalog";

const spell: CardDefinition = {
  id: 1,
  name: "Opponent’s Draw",
  category: "Spell",
  type: "Spell Card",
  kinds: [],
  description: "Add a card to your hand.",
  race: "Normal",
};
const monster: CardDefinition = {
  id: 2,
  name: "Metal Drake",
  category: "Monster",
  type: "Xyz Monster",
  kinds: ["Xyz"],
  description: "When your opponent's draw ends, detach one material.",
  rank: 4,
  attack: 2000,
};

it("normalizes punctuation and lists name matches before description matches", () => {
  expect(
    filterCards(indexCards([monster, spell]), {
      ...emptyFilters,
      query: "Opponent's draw",
    }),
  ).toEqual([spell, monster]);
});

it("combines subtype, rating and ATK filters", () => {
  const index = indexCards([spell, monster]);
  expect(
    filterCards(index, {
      ...emptyFilters,
      kind: "Xyz",
      rating: "4",
      minimumAttack: "1800",
    }),
  ).toEqual([monster]);
  expect(
    filterCards(index, {
      ...emptyFilters,
      kind: "Xyz",
      rating: "4",
      minimumAttack: "2100",
    }),
  ).toEqual([]);
});
