// Guide §25.3 scenario 2: Skill combo with a card from outside the Deck and replay.
import { expect, test } from "@playwright/test";
import {
  actionDialog,
  addToHand,
  finishAction,
  openApp,
  pickCard,
  recordMove,
  setMode,
  timelineSteps,
} from "./helpers";

test("activates a Skill, adds a card from outside the Deck and replays", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "Character & Skill" }).click();
  const dialog = page.locator("dialog.skill-dialog");
  await dialog.getByLabel("Character (optional)").fill("Example Duelist");
  await dialog.getByLabel("From the Skill list").check();
  await dialog.getByLabel("Search Skills").fill("I Was Quicker Than You");
  await dialog.getByLabel("I Was Quicker Than You").check();
  await expect(dialog.locator(".skill-text")).toContainText("2000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".duelist")).toContainText(
    "I Was Quicker Than You",
  );

  await addToHand(page, "Magician's Rod");
  await setMode(page, "Record");
  await page.getByRole("button", { name: "Activate Skill" }).click();
  await pickCard(page, "Dark Magician");
  await page.getByRole("button", { name: "Add to Hand" }).click();
  await finishAction(page, "Add from outside the Deck");
  await recordMove(page, "Magician's Rod", "Player Graveyard", "Discard");

  expect(await timelineSteps(page)).toEqual([
    "Activate Skill: I Was Quicker Than You.",
    "Add Dark Magician from outside the Deck to the hand.",
    "Discard Magician's Rod.",
  ]);
  await expect(page.locator(".timeline li.in-group")).toHaveCount(2);

  await setMode(page, "Replay");
  await page.getByRole("button", { name: "Jump to starting hand" }).click();
  await expect(page.locator(".hand-cards .board-card")).toHaveCount(1);
  for (let step = 1; step <= 3; step++)
    await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator(".step-indicator")).toHaveText("Step 3 / 3");
  await expect(page.locator(".hand-cards .board-card")).toHaveCount(1);
  await expect(
    page.locator('[aria-label^="Dark Magician, copy"]'),
  ).toBeVisible();
  await expect(page.locator('[aria-label="Player Graveyard"]')).toHaveAttribute(
    "aria-description",
    "1 cards",
  );
  // Replay is read-only.
  await pickCard(page, "Dark Magician");
  await page.getByRole("button", { name: "Add to Hand" }).click();
  await expect(actionDialog(page)).toBeHidden();
  expect(await timelineSteps(page)).toHaveLength(3);
});
