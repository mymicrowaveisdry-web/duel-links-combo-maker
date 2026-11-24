import { expect } from "@playwright/test";
import type { Download, Page } from "@playwright/test";

/** Opens the app with an empty browser profile and waits for the catalog. */
export async function openApp(page: Page) {
  await page.goto("./");
  // The 3.5 MB catalog can take a while when several browsers load it at once.
  await expect(page.getByText(/^[\d,]+ cards$/)).toBeVisible({
    timeout: 20_000,
  });
}

export async function pickCard(page: Page, name: string) {
  await page.getByPlaceholder("Search cards…").fill(name);
  await page.locator(".catalog-row", { hasText: name }).first().click();
}

export async function addToHand(page: Page, name: string) {
  await pickCard(page, name);
  await page.getByRole("button", { name: "Add to Hand" }).click();
}

export async function addToDeck(page: Page, name: string) {
  await pickCard(page, name);
  await page.getByRole("button", { name: "Main Deck", exact: true }).click();
}

export async function addToExtraDeck(page: Page, name: string) {
  await pickCard(page, name);
  await page.getByRole("button", { name: "Extra Deck", exact: true }).click();
}

/** Setup mode: places a card from the browser in a zone. */
export async function placeOnBoard(page: Page, name: string, zone: string) {
  await pickCard(page, name);
  await page.getByRole("button", { name: "Place on Board" }).click();
  await page.locator(`[aria-label="${zone}"]`).click();
}

export async function setMode(page: Page, mode: "Setup" | "Record" | "Replay") {
  await page.getByRole("button", { name: mode, exact: true }).click();
}

export function actionDialog(page: Page) {
  return page.locator("dialog.action-dialog");
}

/** Records a move through the action menu. */
export async function recordMove(
  page: Page,
  card: string,
  zone: string,
  kind: string,
  materials: string[] = [],
) {
  await page.locator(`[aria-label^="${card}, copy"]`).first().click();
  await page.getByRole("button", { name: "Move Card", exact: true }).click();
  await chooseTarget(page, zone);
  await finishAction(page, kind, materials);
}

/** Records a move of a card from a pile such as the Deck or Extra Deck. */
export async function recordFromPile(
  page: Page,
  pile: string,
  card: string,
  zone: string,
  kind: string,
  materials: string[] = [],
) {
  await page.locator(`[aria-label="${pile}"]`).click();
  await page
    .locator(".zone-inspector button", { hasText: card })
    .first()
    .click();
  await page.getByRole("button", { name: "Move Card", exact: true }).click();
  await chooseTarget(page, zone);
  await finishAction(page, kind, materials);
}

async function chooseTarget(page: Page, zone: string) {
  if (zone === "Player Hand")
    await page.getByRole("button", { name: "Player Hand" }).click();
  else await page.locator(`[aria-label="${zone}"]`).first().click();
}

export async function finishAction(
  page: Page,
  kind: string,
  materials: string[] = [],
) {
  const dialog = actionDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(kind, { exact: true }).check();
  for (const zone of materials)
    await dialog
      .locator(".choice-list label")
      .filter({ hasText: zone })
      .locator("input")
      .check();
  await dialog.getByRole("button", { name: "Record Step" }).click();
  await expect(dialog).toBeHidden();
}

export async function showTimeline(page: Page) {
  await page.locator(".side-tabs button", { hasText: "Timeline" }).click();
}

export async function showDetails(page: Page) {
  await page.locator(".side-tabs button", { hasText: "Details" }).click();
}

/** Step descriptions from the timeline, without numbers or badges. */
export async function timelineSteps(page: Page) {
  await showTimeline(page);
  const rows = page.locator(
    ".timeline li[data-board]:not([data-board='0']) .entry-body > span",
  );
  return (await rows.allInnerTexts()).map((text) => text.trim());
}

export function notice(page: Page) {
  return page.locator(".app-footer [role=status]");
}

export async function openExport(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.locator("dialog.export-dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function exportText(page: Page) {
  const dialog = await openExport(page);
  await dialog.getByRole("button", { name: "Text", exact: true }).click();
  const text = await dialog.locator("textarea.text-preview").inputValue();
  return { dialog, text };
}

export async function readDownload(download: Download) {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** PNG files start with this 8-byte signature. */
export const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
