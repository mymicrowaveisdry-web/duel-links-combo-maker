// Guide §25.3 scenario 3 (undo and redo) and a keyboard-only authoring check.
import { expect, test } from "@playwright/test";
import {
  addToHand,
  notice,
  openApp,
  recordMove,
  setMode,
  timelineSteps,
} from "./helpers";

test("undo and redo keep the board and timeline consistent", async ({
  page,
}) => {
  await openApp(page);
  await addToHand(page, "Magician's Rod");
  await addToHand(page, "Dark Magician");
  await setMode(page, "Record");
  await recordMove(page, "Magician's Rod", "Player Monster 1", "Normal Summon");
  await recordMove(page, "Dark Magician", "Player Monster 2", "Special Summon");
  await recordMove(
    page,
    "Magician's Rod",
    "Player Graveyard",
    "Send to Graveyard",
  );
  expect(await timelineSteps(page)).toHaveLength(3);

  const undo = page.getByRole("button", { name: "Undo", exact: true });
  await undo.click();
  await undo.click();
  expect(await timelineSteps(page)).toEqual(["Normal Summon Magician's Rod."]);
  await expect(page.locator('[aria-label="Player Monster 2"]')).toBeVisible();
  await expect(
    page.locator('[aria-label^="Magician\'s Rod, copy"]'),
  ).toHaveCount(1);

  await page.keyboard.press("Control+Shift+Z");
  await page.keyboard.press("Control+y");
  expect(await timelineSteps(page)).toHaveLength(3);
  await expect(page.locator('[aria-label="Player Graveyard"]')).toHaveAttribute(
    "aria-description",
    "1 cards",
  );

  // A new action after undo discards the redo history.
  await undo.click();
  await recordMove(page, "Magician's Rod", "Player Banished", "Banish");
  await expect(
    page.getByRole("button", { name: "Redo", exact: true }),
  ).toBeDisabled();
  expect((await timelineSteps(page)).at(-1)).toBe("Banish Magician's Rod.");
});

test("cards can be placed with the keyboard alone", async ({ page }) => {
  await openApp(page);
  await page.getByPlaceholder("Search cards…").fill("Dark Magician");
  const row = page.locator(".catalog-row").first();
  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Place on Board" }).focus();
  await page.keyboard.press("Enter");
  await page.locator('[aria-label="Player Monster 2"]').focus();
  await page.keyboard.press("Enter");
  await expect(
    page.locator('[aria-label^="Dark Magician, copy"]'),
  ).toBeVisible();
  await expect(notice(page)).toContainText("added to Player Monster 2");

  // Escape cancels a pending placement.
  await page.locator('[aria-label^="Dark Magician, copy"]').focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Move Card", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Choose a highlighted zone.")).toBeHidden();
});
