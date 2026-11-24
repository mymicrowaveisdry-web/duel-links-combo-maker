// Guide §25.3 scenario 8: editing earlier steps, incompatible steps and repair.
import { expect, test } from "@playwright/test";
import {
  addToHand,
  exportText,
  finishAction,
  openApp,
  pickCard,
  recordMove,
  setMode,
  showTimeline,
  timelineSteps,
} from "./helpers";

test("flags the first incompatible step and repairs it without stale boards", async ({
  page,
}) => {
  await openApp(page);
  await addToHand(page, "Magician's Rod");
  await setMode(page, "Record");
  await pickCard(page, "Dark Magician");
  await page.getByRole("button", { name: "Add to Hand" }).click();
  await finishAction(page, "Add from outside the Deck");
  await recordMove(page, "Dark Magician", "Player Monster 2", "Special Summon");
  await recordMove(page, "Magician's Rod", "Player Monster 1", "Normal Summon");
  expect(await timelineSteps(page)).toHaveLength(3);

  // Edit a description and a note.
  await showTimeline(page);
  await page.locator(".timeline-entry", { hasText: "Normal Summon" }).click();
  await page
    .getByRole("button", { name: "Edit description and notes" })
    .click();
  await page.getByLabel("Description").fill("Normal Summon Rod to start.");
  await page.getByLabel("Notes").fill("Keep Rod for its search.");
  await page.getByRole("button", { name: "Save Step" }).click();
  await expect(
    page.locator(".timeline-entry", { hasText: "Normal Summon Rod to start." }),
  ).toBeVisible();

  // Removing the card's arrival breaks the next step.
  await page
    .locator(".timeline-entry", { hasText: "from outside the Deck" })
    .click();
  await page.getByRole("button", { name: "Delete step" }).click();
  const banner = page.locator(".repair-banner");
  await expect(banner).toContainText("Step 1 no longer applies.");
  await expect(page.locator(".timeline .entry-error").first()).toHaveText(
    "Fails here",
  );
  await expect(page.locator(".timeline .entry-error")).toHaveCount(2);
  // Only the last valid board is shown: nothing from the broken steps.
  await expect(page.locator('[aria-label^="Dark Magician, copy"]')).toHaveCount(
    0,
  );
  await expect(
    page.locator('[aria-label^="Magician\'s Rod, copy"]'),
  ).toHaveCount(1);
  await expect(page.locator(".hand-cards .board-card")).toHaveCount(1);

  await banner.getByRole("button", { name: "Delete step 1" }).click();
  await expect(banner).toBeHidden();
  expect(await timelineSteps(page)).toEqual(["Normal Summon Rod to start."]);
  const { text } = await exportText(page);
  expect(text).toContain(
    "01. Normal Summon Rod to start.\n    Keep Rod for its search.",
  );
});

test("inserts a step at an earlier point after an explicit choice", async ({
  page,
}) => {
  await openApp(page);
  await addToHand(page, "Magician's Rod");
  await setMode(page, "Record");
  await recordMove(page, "Magician's Rod", "Player Monster 1", "Normal Summon");
  await recordMove(
    page,
    "Magician's Rod",
    "Player Graveyard",
    "Send to Graveyard",
  );
  await showTimeline(page);
  await page.locator(".timeline-entry", { hasText: "Normal Summon" }).click();
  await expect(page.locator(".view-banner")).toContainText(
    "Viewing step 1 of 2",
  );
  await page.getByRole("button", { name: "Insert here" }).click();
  await page.locator('[aria-label^="Magician\'s Rod, copy"]').click();
  await page.getByRole("button", { name: "Activate Effect" }).click();
  expect(await timelineSteps(page)).toEqual([
    "Normal Summon Magician's Rod.",
    "Activate Magician's Rod's effect.",
    "Send Magician's Rod to the Graveyard.",
  ]);
  await expect(page.locator(".repair-banner")).toHaveCount(0);
});
