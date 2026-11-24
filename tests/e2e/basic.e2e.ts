// Guide §25.3 scenario 1: basic combo with TXT and PNG export.
import { expect, test } from "@playwright/test";
import {
  addToDeck,
  addToHand,
  openApp,
  openExport,
  pngSignature,
  readDownload,
  recordFromPile,
  recordMove,
  setMode,
  timelineSteps,
} from "./helpers";

test("records a basic combo and exports TXT and PNG", async ({ page }) => {
  await openApp(page);
  await addToHand(page, "Magician's Rod");
  await addToDeck(page, "Dark Magical Circle");
  await expect(page.locator(".hand-cards .board-card")).toHaveCount(1);

  await setMode(page, "Record");
  await recordMove(page, "Magician's Rod", "Player Monster 1", "Normal Summon");
  await page.locator(`[aria-label^="Magician's Rod, copy"]`).click();
  await page.getByRole("button", { name: "Activate Effect" }).click();
  await recordFromPile(
    page,
    "Player Main Deck",
    "Dark Magical Circle",
    "Player Hand",
    "Search from Deck",
  );

  expect(await timelineSteps(page)).toEqual([
    "Normal Summon Magician's Rod.",
    "Activate Magician's Rod's effect.",
    "Add Dark Magical Circle from the Deck to the hand.",
  ]);

  const dialog = await openExport(page);
  await dialog.getByLabel("Combo title").fill("Rod Starter");
  await dialog.getByLabel("Combo title").press("Enter");

  await dialog.getByRole("button", { name: "Text", exact: true }).click();
  const text = await dialog.locator("textarea.text-preview").inputValue();
  expect(text).toContain("ROD STARTER");
  expect(text).toContain("01. Normal Summon Magician's Rod.");
  expect(text).toContain(
    "03. Add Dark Magical Circle from the Deck to the hand.",
  );
  const txt = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download TXT" }).click();
  const txtFile = await txt;
  expect(txtFile.suggestedFilename()).toBe("rod-starter.txt");
  expect((await readDownload(txtFile)).toString("utf8")).toBe(text);

  await dialog.getByRole("button", { name: "PNG image" }).click();
  await expect(dialog.getByText("Preview ready.")).toBeVisible({
    timeout: 20_000,
  });
  const png = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  const pngFile = await png;
  expect(pngFile.suggestedFilename()).toBe("rod-starter.png");
  const bytes = await readDownload(pngFile);
  expect(bytes.subarray(0, 8).equals(pngSignature)).toBe(true);
  expect(bytes.length).toBeGreaterThan(10_000);
});
