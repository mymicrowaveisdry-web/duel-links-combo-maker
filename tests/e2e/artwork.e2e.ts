// Guide §25.3 scenario 7: missing artwork keeps placeholders and PNG export working.
import { expect, test } from "@playwright/test";
import {
  addToHand,
  openApp,
  openExport,
  pngSignature,
  readDownload,
  recordMove,
  setMode,
} from "./helpers";

test("shows text faces and still exports a PNG when images fail", async ({
  page,
}) => {
  await page.route("**/images/**", (route) => route.abort());
  await openApp(page);
  await addToHand(page, "Magician's Rod");
  await setMode(page, "Record");
  await recordMove(page, "Magician's Rod", "Player Monster 1", "Normal Summon");

  const card = page.locator('[aria-label^="Magician\'s Rod, copy"]');
  await expect(card.locator(".card-face")).toBeVisible();
  await expect(card.locator(".card-face.has-image")).toHaveCount(0);
  await expect(card.locator(".face-name")).toHaveText("Magician's Rod");

  const dialog = await openExport(page);
  await expect(dialog.getByText("Preview ready.")).toBeVisible({
    timeout: 30_000,
  });
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download PNG" }).click();
  const bytes = await readDownload(await download);
  expect(bytes.subarray(0, 8).equals(pngSignature)).toBe(true);
});
