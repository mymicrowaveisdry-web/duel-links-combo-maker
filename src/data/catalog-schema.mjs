import { z } from "zod";

export const monsterKinds = [
  "Normal",
  "Effect",
  "Ritual",
  "Fusion",
  "Synchro",
  "Xyz",
  "Pendulum",
  "Link",
  "Tuner",
  "Flip",
  "Spirit",
  "Union",
  "Gemini",
  "Toon",
];

const rating = z.number().int().nonnegative().optional();
const stat = z.number().int().min(-1).optional();

export const cardSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  description: z.string(),
  type: z.string().min(1),
  category: z.enum(["Monster", "Spell", "Trap", "Token"]),
  kinds: z.array(z.string()),
  attribute: z.string().optional(),
  race: z.string().optional(),
  archetype: z.string().optional(),
  level: rating,
  rank: rating,
  linkRating: rating,
  scale: rating,
  attack: stat,
  defense: stat,
  /**
   * Opening-hand placeholders such as "Any Spell Card". They are not real cards:
   * "wildcard" placeholders may go in any zone, the others follow their category.
   */
  placeholder: z.enum(["wildcard", "typed"]).optional(),
  /** Card whose artwork represents this definition, used by placeholders. */
  artworkId: z.number().int().nonnegative().optional(),
});

export const catalogSchema = z.object({
  version: z.literal(1),
  source: z.string().min(1),
  retrievedAt: z.string().datetime({ offset: true }),
  scope: z.literal("Duel Links (approximate)"),
  cards: z.array(cardSchema).min(1),
});
