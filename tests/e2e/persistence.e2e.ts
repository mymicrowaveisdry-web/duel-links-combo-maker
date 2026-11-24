// Guide §25.3 scenarios 4 (local persistence) and 5 (JSON round trip).
import { expect, test } from "@playwright/test";
import {
  addToHand,
  exportText,
  notice,
  openApp,
  recordMove,
  setMode,
  timelineSteps,
} from "./helpers";

async function sampleCombo(page: import("@playwright/test").Page) {
  await openApp(page);
  await addToHand(page, "Magician's Rod");
  await addToHand(page, "Dark Magician");
  await setMode(page, "Record");
  await recordMove(page, "Magician's Rod", "Player Monster 1", "Normal Summon");
  await recordMove(page, "Dark Magician", "Player Graveyard", "Discard");
}

test("saves a combo, recovers it after reload and reopens it", async ({
  page,
}) => {
  await sampleCombo(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(notice(page)).toContainText(
    "Saved Untitled combo in this browser.",
  );
  await expect(page.locator(".save-state")).toContainText("Draft saved");
  const before = await timelineSteps(page);

  await page.reload();
  await expect(notice(page)).toHaveText(
    "Recovered your last session from this browser.",
  );
  expect(await timelineSteps(page)).toEqual(before);

  await page.getByRole("button", { name: "New Combo" }).click();
  expect(await timelineSteps(page)).toEqual([]);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const dialog = page.locator("dialog.combos-dialog");
  await expect(dialog.locator(".saved-list li")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Open Untitled combo" }).click();
  await expect(dialog).toBeHidden();
  expect(await timelineSteps(page)).toEqual(before);
  await setMode(page, "Replay");
  await expect(
    page.locator('[aria-label^="Magician\'s Rod, copy"]'),
  ).toBeVisible();
});

test("exports a JSON backup and imports it into a fresh combo", async ({
  page,
}) => {
  await sampleCombo(page);
  const { dialog, text: before } = await exportText(page);
  await dialog.getByRole("button", { name: "JSON backup" }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download .*\.json/ }).click();
  const file = await download;
  const path = await file.path();
  await dialog.getByRole("button", { name: "Close export" }).click();

  await page.getByRole("button", { name: "New Combo" }).click();
  expect(await timelineSteps(page)).toEqual([]);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page
    .locator("dialog.combos-dialog")
    .locator('input[type="file"]')
    .setInputFiles(path);
  await expect(notice(page)).toContainText("Imported Untitled combo");
  const { text: after } = await exportText(page);
  expect(after).toBe(before);
});

test("rejects a malformed backup without changing the open combo", async ({
  page,
}) => {
  await sampleCombo(page);
  const before = await timelineSteps(page);
  await page.getByRole("button", { name: "Open", exact: true }).click();
  const dialog = page.locator("dialog.combos-dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      '{"app":"duel-links-combo-maker","combo":{"schemaVersion":1}}',
    ),
  });
  await expect(dialog.locator(".form-error")).toContainText("Import failed.");
  await dialog.getByRole("button", { name: "Close combos" }).click();
  expect(await timelineSteps(page)).toEqual(before);
});
