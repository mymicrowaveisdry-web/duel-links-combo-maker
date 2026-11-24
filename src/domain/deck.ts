// YDK deck files and non-blocking deck warnings. Duel Links limits that are not
// confirmed by a current official source are labelled provisional, and the
// Limited 1/2/3 list is reported as unavailable rather than guessed.
import type { CardDefinition } from "../data/catalog";

export interface YdkDeck {
  main: number[];
  extra: number[];
  side: number[];
}

export const maximumYdkBytes = 200 * 1024;

/** Parses a YDK file: "#main", "#extra" and "!side" sections of passcodes. */
export function parseYdk(text: string): YdkDeck | { error: string } {
  if (text.length > maximumYdkBytes)
    return { error: "The deck file is too large." };
  const deck: YdkDeck = { main: [], extra: [], side: [] };
  let section: keyof YdkDeck | null = null;
  let sawSection = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.toLowerCase();
    if (header.startsWith("#main")) section = "main";
    else if (header.startsWith("#extra")) section = "extra";
    else if (header.startsWith("!side")) section = "side";
    else if (line.startsWith("#") || line.startsWith("!")) continue;
    else if (/^\d{1,10}$/.test(line)) {
      if (!section) return { error: "Card IDs appear before a #main section." };
      deck[section].push(Number(line));
      continue;
    } else
      return { error: `Unexpected line in deck file: "${line.slice(0, 40)}"` };
    sawSection = true;
  }
  if (!sawSection)
    return { error: "This is not a YDK file (no #main section)." };
  if (deck.main.length + deck.extra.length > 200)
    return { error: "The deck file lists more than 200 cards." };
  return deck;
}

export interface ResolvedDeck {
  main: CardDefinition[];
  extra: CardDefinition[];
  /** Passcodes not found in the bundled catalog. */
  missing: number[];
}

export function resolveYdk(
  deck: YdkDeck,
  lookup: (id: number) => CardDefinition | undefined,
): ResolvedDeck {
  const missing: number[] = [];
  const pick = (ids: number[]) =>
    ids.flatMap((id) => {
      const card = lookup(id);
      if (!card) missing.push(id);
      return card ? [card] : [];
    });
  return { main: pick(deck.main), extra: pick(deck.extra), missing };
}

export interface DeckWarning {
  level: "warning" | "info";
  message: string;
}

/** Non-blocking checks. Never claims the deck is legal. */
export function deckWarnings(
  main: readonly CardDefinition[],
  extra: readonly CardDefinition[],
  inCatalog: (id: number) => boolean,
): DeckWarning[] {
  const warnings: DeckWarning[] = [];
  if (main.length && (main.length < 20 || main.length > 30))
    warnings.push({
      level: "warning",
      message: `Main Deck has ${main.length} cards. Speed Duel decks usually hold 20–30 (provisional limit).`,
    });
  if (extra.length > 5)
    warnings.push({
      level: "info",
      message: `Extra Deck has ${extra.length} cards. The in-game capacity depends on unlocked slots and is unconfirmed.`,
    });
  // Placeholders stand for unknown cards, so copy and catalog checks skip them.
  const real = [...main, ...extra].filter((card) => !card.placeholder);
  const copies = new Map<string, number>();
  for (const card of real)
    copies.set(card.name, (copies.get(card.name) ?? 0) + 1);
  for (const [name, count] of copies)
    if (count > 3)
      warnings.push({
        level: "warning",
        message: `${count} copies of ${name}. Decks allow at most 3.`,
      });
  // Custom cards are missing from the catalog by definition.
  const unknown = real.filter((card) => !card.custom && !inCatalog(card.id));
  if (unknown.length)
    warnings.push({
      level: "warning",
      message: `${unknown.length} card${unknown.length === 1 ? " is" : "s are"} not in the bundled Duel Links catalog.`,
    });
  if (main.length || extra.length)
    warnings.push({
      level: "info",
      message:
        "Limited 1/2/3 checks are unavailable: no dated Duel Links list is bundled.",
    });
  return warnings;
}
