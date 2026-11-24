// Guide §8.6: custom cards for cards missing from the dataset.
import { expect, test } from "@playwright/test";
import { exportText, openApp } from "./helpers";

// A 1 × 1 PNG, enough to exercise the local image import and resize.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("creates, edits, exports and deletes a custom card", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(page.getByText("No custom cards yet.")).toBeVisible();

  // Create a monster with a local image.
  await page.getByRole("button", { name: "New Custom Card" }).click();
  const dialog = page.locator("dialog.custom-card-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Create Card" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Enter the card name.");
  await dialog.getByLabel("Name").fill("Homebrew Dragon");
  await dialog.getByLabel("Attribute").selectOption("LIGHT");
  await dialog.getByLabel("Monster type").fill("Dragon");
  await dialog.getByLabel("Level").fill("4");
  await dialog.getByLabel("ATK").fill("1800");
  await dialog.getByLabel("DEF").fill("1000");
  await dialog.getByLabel("Card image file").setInputFiles({
    name: "art.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(dialog.locator(".custom-image-frame img")).toBeVisible();
  await dialog.getByRole("button", { name: "Create Card" }).click();
  await expect(dialog).toBeHidden();

  // It is selected, clearly marked and usable like any other card.
  await expect(page.locator(".inspector")).toContainText(
    "Custom card, not from the dataset",
  );
  await expect(page.locator(".catalog-row")).toContainText(
    "Custom card, not from the dataset",
  );
  await page.getByRole("button", { name: "Add to Hand" }).click();
  const face = page.locator(
    '[aria-label^="Homebrew Dragon, copy"] .card-face.is-custom.has-image',
  );
  await expect(face).toBeVisible();

  // Editing updates the combo's copy too.
  await page.getByRole("button", { name: "Edit Custom Card" }).click();
  await dialog.getByLabel("Name").fill("Homebrew Dragon II");
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(
    page.locator('[aria-label^="Homebrew Dragon II, copy"]'),
  ).toBeVisible();

  const { text } = await exportText(page);
  expect(text).toContain(
    "Custom cards (not from the dataset): Homebrew Dragon II",
  );
  expect(text).toContain("1x Homebrew Dragon II");
  await page.keyboard.press("Escape");

  // The library survives a reload.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/in this browser\.$/)).toBeVisible();
  // Autosave is debounced, so wait until the draft holds the edited card.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const open = indexedDB.open("duel-links-combo-maker");
            open.onsuccess = () => {
              const get = open.result
                .transaction("drafts", "readonly")
                .objectStore("drafts")
                .get("current");
              get.onsuccess = () => resolve(JSON.stringify(get.result ?? ""));
            };
          }),
      ),
    )
    .toContain("Homebrew Dragon II");
  await page.reload();
  await expect(page.getByText(/^[\d,]+ cards$/)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.getByText("Recovered your last session from this browser."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(page.locator(".catalog-row")).toHaveCount(1);

  // Deleting from the library leaves the combo's copy in place.
  await page.locator(".catalog-row", { hasText: "Homebrew Dragon II" }).click();
  await page.getByRole("button", { name: "Edit Custom Card" }).click();
  await dialog.getByRole("button", { name: "Delete Card" }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/This combo keeps its copy/)).toBeVisible();
  await expect(
    page.locator('[aria-label^="Homebrew Dragon II, copy"]'),
  ).toBeVisible();
});
