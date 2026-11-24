// Guide §25.3 scenario 6: Extra Deck summon with materials, detach, replay and export.
import { expect, test } from "@playwright/test";
import {
  addToExtraDeck,
  exportText,
  openApp,
  placeOnBoard,
  recordFromPile,
  setMode,
  timelineSteps,
} from "./helpers";

test("Xyz Summons with materials, detaches one and replays", async ({
  page,
}) => {
  await openApp(page);
  await placeOnBoard(page, "Dark Magician", "Player Monster 1");
  await placeOnBoard(page, "Dark Magician", "Player Monster 2");
  await addToExtraDeck(page, "Ebon Illusion Magician");

  await setMode(page, "Record");
  await recordFromPile(
    page,
    "Player Extra Deck",
    "Ebon Illusion Magician",
    "Shared Extra Monster 1",
    "Xyz Summon",
    ["Player Monster 1", "Player Monster 2"],
  );
  const xyz = page.locator('[aria-label^="Ebon Illusion Magician, copy"]');
  await expect(xyz).toHaveAttribute("aria-label", /2 Xyz materials/);
  await expect(page.locator('[aria-label="Player Monster 1"]')).toBeVisible();
  await expect(page.locator('[aria-label="Player Monster 2"]')).toBeVisible();

  await xyz.click();
  await page
    .locator(".material-list")
    .getByRole("button", { name: "Detach" })
    .first()
    .click();
  await expect(xyz).toHaveAttribute("aria-label", /1 Xyz material$/);
  await expect(page.locator('[aria-label="Player Graveyard"]')).toHaveAttribute(
    "aria-description",
    "1 cards",
  );
  expect(await timelineSteps(page)).toEqual([
    "Xyz Summon Ebon Illusion Magician using Dark Magician and Dark Magician.",
    "Detach Dark Magician from Ebon Illusion Magician.",
  ]);

  await setMode(page, "Replay");
  await page.getByRole("button", { name: "Jump to starting hand" }).click();
  await expect(page.locator('[aria-label^="Dark Magician, copy"]')).toHaveCount(
    2,
  );
  await page.getByRole("button", { name: "Jump to final step" }).click();
  await expect(xyz).toHaveAttribute("aria-label", /1 Xyz material$/);

  const { text } = await exportText(page);
  expect(text).toContain("Ebon Illusion Magician (1 material: Dark Magician)");
  expect(text).toContain("Graveyard: Dark Magician");
});
