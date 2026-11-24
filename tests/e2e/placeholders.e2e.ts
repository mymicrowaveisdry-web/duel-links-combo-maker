// Guide §11.1: placeholder hand cards, alternative starters and turn order.
import { expect, test } from "@playwright/test";
import {
  addToHand,
  exportText,
  openApp,
  pickCard,
  recordMove,
  setMode,
  showDetails,
  timelineSteps,
} from "./helpers";

test("documents an opening hand with placeholders, alternatives and turn order", async ({
  page,
}) => {
  await openApp(page);

  // Placeholders come from their own browser view.
  await page.getByRole("button", { name: "Placeholders" }).click();
  await expect(page.getByText(/^\d+ placeholders$/)).toBeVisible();
  await pickCard(page, "Any Spell Card");
  await expect(page.locator(".inspector")).toContainText("Placeholder");
  await page.getByRole("button", { name: "Add to Hand" }).click();
  await page.getByLabel("Archetype placeholder").selectOption("Dark Magician");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Add to Hand" }).click();
  await expect(
    page.locator(
      '[aria-label^="Any Spell Card, copy"] .card-face.is-placeholder',
    ),
  ).toBeVisible();

  // An alternative starter for a real card.
  await page.getByRole("button", { name: "All", exact: true }).click();
  await addToHand(page, "Magician's Rod");
  await page.locator('[aria-label^="Magician\'s Rod, copy"]').click();
  await showDetails(page);
  await page.getByRole("button", { name: "Add Alternative" }).click();
  await pickCard(page, "Skilled Dark Magician");
  await expect(page.locator(".alternatives li")).toHaveText(
    /Skilled Dark Magician/,
  );

  // Turn order.
  await page.getByRole("button", { name: "Board settings" }).click();
  await page.getByLabel("Turn order").selectOption("first");
  await page.getByRole("button", { name: "Apply Settings" }).click();

  // A typed placeholder follows its own rules when recorded.
  await setMode(page, "Record");
  await recordMove(
    page,
    "Any Spell Card",
    "Player Spell/Trap 1",
    "Set Spell/Trap",
  );
  expect(await timelineSteps(page)).toEqual(["Set Any Spell Card."]);

  const { text } = await exportText(page);
  expect(text).toContain("Turn order: Going first");
  expect(text).toContain("1x Any Spell Card");
  expect(text).toContain('1x Any "Dark Magician" card');
  expect(text).toContain("1x Magician's Rod (or Skilled Dark Magician)");
});
