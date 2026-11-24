import { cardLine, countNames } from "./model";
import type { ExportCard, ExportModel, ExportSlot } from "./model";

export interface TextOptions {
  notes: boolean;
  /** No blank lines between steps and no empty zones. */
  compact: boolean;
  /** Markdown headings and bold that read well in Discord. */
  discord: boolean;
  attribution: boolean;
}

export const defaultTextOptions: TextOptions = {
  notes: true,
  compact: false,
  discord: false,
  attribution: true,
};

/** Plain UTF-8 combo guide. Uses edited step descriptions, never stale generated text. */
export function comboText(model: ExportModel, options: TextOptions): string {
  const lines: string[] = [];
  const gap = () => {
    if (lines.length && lines.at(-1) !== "") lines.push("");
  };
  const heading = (text: string, main = false) => {
    gap();
    if (options.discord) lines.push(`${main ? "#" : "##"} ${text}`);
    else lines.push(text.toUpperCase(), (main ? "=" : "-").repeat(text.length));
    if (!options.compact || main) lines.push("");
  };
  const label = (name: string, value: string) =>
    lines.push(options.discord ? `**${name}:** ${value}` : `${name}: ${value}`);

  heading(model.title, true);
  if (model.description) {
    lines.push(model.description);
    lines.push("");
  }
  label("Format", model.format);
  label("Turn order", model.going ?? "Not specified");
  label("Character", model.character ?? "Not specified");
  label(
    "Skill",
    model.skill
      ? `${model.skill.name}${model.skill.custom ? " (custom)" : ""}`
      : "None",
  );
  if (model.skill?.description && !options.compact)
    for (const line of model.skill.description.split("\n"))
      lines.push(`  ${line}`);

  heading("Starting hand");
  if (model.hand.length) lines.push(...countNames(model.hand));
  else lines.push("No cards specified.");

  heading("Combo steps");
  if (model.warning) {
    lines.push(`Warning: ${model.warning}`);
    if (!options.compact) lines.push("");
  }
  if (!model.steps.length) lines.push("No steps recorded.");
  for (const step of model.steps) {
    const number = String(step.number).padStart(2, "0");
    const indent = step.grouped ? "    " : "";
    lines.push(`${indent}${number}. ${step.text}`);
    if (options.notes && step.notes)
      for (const note of step.notes.split("\n"))
        lines.push(`${indent}    ${options.discord ? "> " : ""}${note}`);
    if (!options.compact) lines.push("");
  }

  heading("Endboard");
  const zone = (name: string, slots: readonly ExportSlot[]) => {
    const used = slots.filter((entry) => entry.card);
    if (options.compact && !used.length) return;
    lines.push(`${name}:`);
    for (const entry of options.compact ? used : slots)
      lines.push(`- ${entry.card ? cardLine(entry.card) : "Empty"}`);
    if (!options.compact) lines.push("");
  };
  const pile = (name: string, cards: readonly ExportCard[]) => {
    if (options.compact && !cards.length) return;
    lines.push(
      `${name}: ${cards.length ? cards.map(cardLine).join(", ") : "None"}`,
    );
  };
  const { endboard } = model;
  if (endboard.extraMonsters.some((entry) => entry.card))
    zone(
      "Extra Monster Zones",
      endboard.extraMonsters.filter((entry) => entry.card),
    );
  zone("Monster Zones", endboard.monsters);
  zone("Spell/Trap Zones", endboard.spells);
  if (endboard.field.card || !options.compact)
    lines.push(
      `Field Zone: ${endboard.field.card ? cardLine(endboard.field.card) : "Empty"}`,
    );
  if (endboard.pendulum.length) zone("Pendulum Zones", endboard.pendulum);
  pile("Hand", endboard.hand);
  pile("Graveyard", endboard.graveyard);
  pile("Banished", endboard.banished);

  if (options.attribution) {
    gap();
    lines.push(
      "Card effects are documented manually; game legality is not verified.",
      "Created with Duel Links Combo Maker.",
    );
  }
  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}
