// Guide §25.3 scenario 10 and performance budgets: an 80-step combo, built with the
// app's own domain code, is imported, navigated, replayed and exported in full.
import { expect, test } from "@playwright/test";
import type { CardDefinition } from "../../src/data/catalog";
import { buildDuelAction } from "../../src/domain/actions";
import { applyBoardAction, createBoard } from "../../src/domain/board";
import {
  applyAction,
  createComboDocument,
  withCards,
} from "../../src/domain/combo";
import type { ComboStep } from "../../src/domain/combo";
import { serializeCombo } from "../../src/exports/json";
import { exportText, notice, openApp, showTimeline } from "./helpers";

const rod: CardDefinition = {
  id: 7084129,
  name: "Magician's Rod",
  description: "",
  type: "Effect Monster",
  category: "Monster",
  kinds: ["Effect"],
  level: 3,
};
const stepCount = 80;

function longCombo() {
  const placed = applyBoardAction(createBoard(), {
    type: "place",
    source: { kind: "catalog", definitionId: rod.id },
    card: rod,
    destination: "player-hand",
  });
  if (!placed.ok) throw new Error(placed.message);
  const cards = withCards({}, [rod]);
  let board = placed.board;
  const steps: ComboStep[] = [];
  for (let index = 1; index <= stepCount; index++) {
    const action =
      index % 2
        ? buildDuelAction(board, "note", {
            detail: `Long combo note ${index}.`,
          })
        : buildDuelAction(board, "change-life", {
            side: "player",
            value: 4000 - index * 10,
          });
    const result = applyAction(board, action, cards);
    if (!result.ok) throw new Error(result.message);
    board = result.board;
    steps.push({ id: `step-${index}`, action });
  }
  return serializeCombo(
    {
      ...createComboDocument("long", "2026-11-24T00:00:00.000Z", placed.board),
      title: "Long Combo",
      cards,
      steps,
    },
    "2026-11-24T00:00:00.000Z",
  );
}

test("handles an 80-step combo without truncating exports", async ({
  page,
}) => {
  const started = Date.now();
  await openApp(page);
  const loadMs = Date.now() - started;

  const searchStart = Date.now();
  await page.getByPlaceholder("Search cards…").fill("magician");
  await expect(page.getByText(/^[\d,]+ cards$/)).not.toHaveText("8,355 cards");
  const searchMs = Date.now() - searchStart;

  const importStart = Date.now();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.locator("dialog.combos-dialog input[type=file]").setInputFiles({
    name: "long.json",
    mimeType: "application/json",
    buffer: Buffer.from(longCombo()),
  });
  await expect(notice(page)).toContainText("Imported Long Combo");
  await showTimeline(page);
  await expect(page.locator(".timeline li[data-board]")).toHaveCount(
    stepCount + 1,
  );
  const importMs = Date.now() - importStart;

  // Replay opens on the latest step.
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  const indicator = page.locator(".step-indicator");
  await expect(indicator).toHaveText(`Step ${stepCount} / ${stepCount}`);
  await expect(page.locator(".seat-life strong").last()).toHaveText("3,200");
  await page.getByRole("button", { name: "Jump to starting hand" }).click();
  await expect(indicator).toHaveText(`Start / ${stepCount}`);
  await expect(page.locator(".seat-life strong").last()).toHaveText("4,000");
  await page.getByRole("button", { name: "Next step" }).click();
  await page.getByRole("button", { name: "Next step" }).click();
  await expect(page.locator(".seat-life strong").last()).toHaveText("3,980");
  await page.getByRole("button", { name: "Jump to final step" }).click();
  await expect(indicator).toHaveText(`Step ${stepCount} / ${stepCount}`);

  const { dialog, text } = await exportText(page);
  expect(text).toContain("01. Long combo note 1.");
  expect(text).toContain(`${stepCount}. Player LP: 3,220 → 3,200.`);
  await dialog.getByRole("button", { name: "PNG image" }).click();
  const renderStart = Date.now();
  await expect(
    dialog.getByText(/Preview ready\.|split into \d+ numbered images/),
  ).toBeVisible({
    timeout: 30_000,
  });
  const renderMs = Date.now() - renderStart;
  const images = dialog.locator(".preview-pages img");
  expect(await images.count()).toBeGreaterThanOrEqual(1);
  for (const height of await images.evaluateAll((list) =>
    list.map((img) => (img as HTMLImageElement).naturalHeight),
  ))
    expect(height).toBeLessThanOrEqual(32_000);

  test.info().annotations.push({
    type: "timings",
    description: `load ${loadMs} ms, search ${searchMs} ms, import ${importMs} ms, PNG ${renderMs} ms, ${await images.count()} image(s)`,
  });
  console.log(test.info().annotations.at(-1)?.description);
  expect(loadMs).toBeLessThan(10_000);
  expect(searchMs).toBeLessThan(2_000);
});
