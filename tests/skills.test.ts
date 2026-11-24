import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";
import { looksLikeRushSkill, searchSkills } from "../src/data/skills";
import type { SkillRecord } from "../src/data/skills";
import { buildDuelAction, describeAction } from "../src/domain/actions";
import type { SkillSnapshot } from "../src/domain/combo";
import {
  comboReducer,
  record,
  selectReplay,
  setDuelist,
  undo,
} from "../src/store";

const skills: SkillRecord[] = [
  {
    id: "Destiny Draw",
    name: "Destiny Draw",
    description: "Draw a card of your choice once your LP are 2000 or less.",
  },
  {
    id: "Draw Sense: High Level",
    name: "Draw Sense: High Level",
    description: "Your next normal draw is a Level 5 or higher monster.",
  },
  {
    id: "Rush Example",
    name: "Rush Example",
    description:
      "[REQUIREMENT] Your LP are 2000 or less.\n[EFFECT] Draw 1 card.",
  },
  { id: "Peak Performance", name: "Peak Performance", description: null },
];

describe("Skill search", () => {
  it("matches names before text, ignoring case and punctuation", () => {
    expect(searchSkills(skills, "draw", false).map(({ id }) => id)).toEqual([
      "Destiny Draw",
      "Draw Sense: High Level",
      "Rush Example",
    ]);
    expect(
      searchSkills(skills, "DRAW SENSE high", false).map(({ id }) => id),
    ).toEqual(["Draw Sense: High Level"]);
  });

  it("finds Skills by their text and keeps an empty query in name order", () => {
    expect(
      searchSkills(skills, "2000 or less", false).map(({ id }) => id),
    ).toEqual(["Destiny Draw", "Rush Example"]);
    expect(searchSkills(skills, "", false)).toHaveLength(4);
  });

  it("labels and optionally hides Rush Duel format Skills", () => {
    expect(looksLikeRushSkill(skills[2]!)).toBe(true);
    expect(looksLikeRushSkill(skills[3]!)).toBe(false);
    expect(
      searchSkills(skills, "draw", true).map(({ id }) => id),
    ).not.toContain("Rush Example");
  });
});

describe("combo Skill snapshots", () => {
  const first: SkillSnapshot = {
    id: "Destiny Draw",
    name: "Destiny Draw",
    description: "Original wording.",
    origin: "dataset",
    capturedAt: "2026-11-24T00:00:00.000Z",
  };

  it("stores the character and Skill, and undoes the change", () => {
    const store = configureStore({ reducer: { combo: comboReducer } });
    store.dispatch(
      setDuelist({ character: { name: "  Yami Yugi " }, skill: first }),
    );
    expect(store.getState().combo.doc).toMatchObject({
      character: { name: "Yami Yugi" },
      skill: first,
    });
    store.dispatch(undo());
    expect(store.getState().combo.doc.skill).toBeUndefined();
  });

  it("keeps the Skill text a step was recorded with after the combo's Skill changes", () => {
    const store = configureStore({ reducer: { combo: comboReducer } });
    store.dispatch(setDuelist({ character: null, skill: first }));
    const board = selectReplay(store.getState()).boards.at(-1)!;
    const action = buildDuelAction(board, "activate-skill", { skill: first });
    store.dispatch(record(action));
    store.dispatch(
      setDuelist({
        character: null,
        skill: { name: "My Skill", origin: "custom" },
      }),
    );
    const { doc } = store.getState().combo;
    expect(doc.skill?.name).toBe("My Skill");
    expect(doc.steps[0]!.action.skill).toEqual(first);
    expect(describeAction(doc.steps[0]!.action, board, doc.cards)).toBe(
      "Activate Skill: Destiny Draw.",
    );
    // A Skill activation opens a group for the board changes that follow.
    expect(doc.steps[0]!.groupId).toBe(doc.steps[0]!.id);
  });
});
