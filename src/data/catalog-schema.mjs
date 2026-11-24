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
});

export const catalogSchema = z.object({
  version: z.literal(1),
  source: z.string().min(1),
  retrievedAt: z.string().datetime({ offset: true }),
  scope: z.literal("Duel Links (approximate)"),
  cards: z.array(cardSchema).min(1),
});
