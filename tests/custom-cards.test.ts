import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { cardSchema } from "../src/data/catalog-schema.mjs";
import {
  buildCustomCard,
  draftOf,
  emptyDraft,
  firstCustomId,
  newCustomId,
} from "../src/data/custom-cards";
import type { CustomCardDraft } from "../src/data/custom-cards";
import { genericPlaceholders } from "../src/data/placeholders";
import { createBoard, getZone, zoneRule } from "../src/domain/board";
import { replay } from "../src/domain/combo";
import { deckWarnings } from "../src/domain/deck";
import { parseComboFile, serializeCombo } from "../src/exports/json";
import { buildExportModel } from "../src/exports/model";
import { comboText, defaultTextOptions } from "../src/exports/text";
import { comboReducer, reviseCard, setupChange } from "../src/store";

const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function build(draft: Partial<CustomCardDraft>, id = firstCustomId + 1) {
  const result = buildCustomCard({ ...emptyDraft, ...draft }, id);
  if (!result.ok) throw new Error(result.error);
  return result.card;
}

describe("custom cards", () => {
  it("builds monsters with dataset-style type lines and kinds", () => {
    const card = build({
      name: "Test Synchron",
      frame: "Synchro",
      tuner: true,
      attribute: "WIND",
      race: "Machine",
      rating: "5",
      attack: "?",
      defense: "2100",
      image: pixel,
    });
    expect(card).toMatchObject({
      type: "Synchro Tuner Effect Monster",
      category: "Monster",
      kinds: ["Synchro", "Effect", "Tuner"],
      level: 5,
      attack: -1,
      defense: 2100,
      custom: true,
      image: pixel,
    });
    const board = createBoard();
    expect(zoneRule(board, card, getZone("player-extra-deck"))).toBeUndefined();
    expect(
      zoneRule(
        createBoard(),
        { ...card, kinds: ["Effect"] },
        getZone("player-extra-deck"),
      ),
    ).toBeDefined();
  });

  it("builds Link, Xyz, Spell and Trap cards", () => {
    const link = build({ frame: "Link", name: "L", rating: "2", defense: "9" });
    expect(link).toMatchObject({ type: "Link Effect Monster", linkRating: 2 });
    expect(link).not.toHaveProperty("defense");
    expect(build({ frame: "Xyz", name: "X", rating: "4" })).toMatchObject({
      rank: 4,
    });
    const spell = build({ category: "Spell", name: "S", icon: "Quick-Play" });
    expect(spell).toMatchObject({
      type: "Quick-Play Spell",
      race: "Quick-Play",
    });
    expect(
      zoneRule(createBoard(), spell, getZone("player-monster-1")),
    ).toBeDefined();
    expect(build({ category: "Trap", name: "T", icon: "Counter" }).type).toBe(
      "Counter Trap",
    );
  });

  it("reports invalid input instead of guessing", () => {
    const fail = (draft: Partial<CustomCardDraft>) =>
      buildCustomCard({ ...emptyDraft, ...draft }, firstCustomId);
    expect(fail({ name: " " })).toEqual({
      ok: false,
      error: "Enter the card name.",
    });
    expect(fail({ name: "A", attack: "lots" }).ok).toBe(false);
    expect(fail({ name: "A", frame: "Link", rating: "9" }).ok).toBe(false);
    expect(fail({ name: "A", rating: "14" }).ok).toBe(false);
  });

  it("round-trips through the edit form", () => {
    const card = build({
      name: "Pendulum Thing",
      pendulum: true,
      scale: "4",
      rating: "6",
      attack: "2000",
      defense: "1500",
      description: "Text.",
    });
    expect(build(draftOf(card), card.id)).toEqual(card);
  });

  it("uses IDs above the passcode and placeholder ranges", () => {
    const taken = new Set<number>();
    for (let index = 0; index < 50; index += 1) {
      const id = newCustomId((value) => taken.has(value));
      expect(id).toBeGreaterThanOrEqual(firstCustomId);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
    expect(Math.max(...genericPlaceholders.map(({ id }) => id))).toBeLessThan(
      firstCustomId,
    );
  });

  it("accepts only embedded raster images", () => {
    const card = build({ name: "A" });
    expect(cardSchema.safeParse({ ...card, image: pixel }).success).toBe(true);
    for (const image of [
      "https://example.com/a.png",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:image/png;base64,<script>",
    ])
      expect(cardSchema.safeParse({ ...card, image }).success).toBe(false);
  });

  it("skips the catalog check in deck warnings", () => {
    const card = build({ name: "Missing card" });
    const messages = deckWarnings([card], [], () => false).map(
      ({ message }) => message,
    );
    expect(messages.some((text) => text.includes("not in the bundled"))).toBe(
      false,
    );
  });
});

describe("custom cards in combos", () => {
  function storeWithCard() {
    const store = configureStore({ reducer: { combo: comboReducer } });
    const card = build({ name: "Homebrew", rating: "4", image: pixel });
    store.dispatch(
      setupChange({
        type: "place",
        source: { kind: "catalog", definitionId: card.id },
        card,
        destination: "player-monster-1",
      }),
    );
    return { store, card };
  }

  it("travels in JSON backups with its image and is named in TXT", () => {
    const { store, card } = storeWithCard();
    const doc = store.getState().combo.doc;
    expect(doc.cards[String(card.id)]).toEqual(card);
    const parsed = parseComboFile(
      serializeCombo(doc, "2026-11-24T00:00:00.000Z"),
    );
    expect(parsed).toEqual({ ok: true, doc });
    const text = comboText(
      buildExportModel(doc, replay(doc)),
      defaultTextOptions,
    );
    expect(text).toContain("Custom cards (not from the dataset): Homebrew");
  });

  it("updates the combo's snapshot and refuses edits that break the board", () => {
    const { store, card } = storeWithCard();
    store.dispatch(reviseCard({ ...card, name: "Homebrew Mk II" }));
    expect(store.getState().combo.doc.cards[String(card.id)]?.name).toBe(
      "Homebrew Mk II",
    );
    store.dispatch(
      reviseCard(build({ category: "Spell", name: "S" }, card.id)),
    );
    const state = store.getState().combo;
    expect(state.doc.cards[String(card.id)]?.category).toBe("Monster");
    expect(state.notice?.error).toBe(true);
  });

  it("never replaces dataset cards", () => {
    const store = configureStore({ reducer: { combo: comboReducer } });
    const before = store.getState().combo.doc;
    const fake = { ...build({ name: "A" }), id: 7084129 };
    store.dispatch(reviseCard(fake));
    expect(store.getState().combo.doc).toBe(before);
  });
});
