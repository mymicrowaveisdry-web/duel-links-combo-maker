// Guide §25.3 scenario 9: phone viewport with tap-only interaction and text export.
import { expect, test } from "@playwright/test";
import { readDownload } from "./helpers";

test("records and exports a combo using taps only", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "Cards", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cards", exact: true }).tap();
  await page.getByPlaceholder("Search cards…").fill("Magician's Rod");
  await page.locator(".catalog-row").first().tap();
  await page.getByRole("button", { name: "Add to Hand" }).tap();

  await page.getByRole("button", { name: "Record", exact: true }).tap();
  await page.getByRole("button", { name: "Board", exact: true }).tap();
  await page.locator('[aria-label^="Magician\'s Rod, copy"]').tap();
  await page.getByRole("button", { name: "Move Card", exact: true }).tap();
  await page.locator('[aria-label="Player Monster 1"]').tap();
  const dialog = page.locator("dialog.action-dialog");
  await dialog.getByLabel("Normal Summon", { exact: true }).tap();
  await dialog.getByRole("button", { name: "Record Step" }).tap();
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Steps", exact: true }).tap();
  await expect(
    page.locator(".timeline-entry", {
      hasText: "Normal Summon Magician's Rod.",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  await page.getByRole("button", { name: "Export", exact: true }).tap();
  const exportDialog = page.locator("dialog.export-dialog");
  await exportDialog.getByRole("button", { name: "Text", exact: true }).tap();
  await expect(exportDialog.locator("textarea.text-preview")).toHaveValue(
    /01\. Normal Summon Magician's Rod\./,
  );
  const download = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "Download TXT" }).tap();
  expect((await readDownload(await download)).toString("utf8")).toContain(
    "Normal Summon Magician's Rod.",
  );
});
