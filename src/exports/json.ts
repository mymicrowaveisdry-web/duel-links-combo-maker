// Versioned JSON backups. Imports are untrusted: they are size-limited, parsed as
// plain data, schema-validated and replayed before they can replace the open combo.
import { z } from "zod";
import { cardSchema } from "../data/catalog-schema.mjs";
import { phases, sides, statKeys, zones } from "../domain/board";
import type { ZoneId } from "../domain/board";
import { actionKinds, comboSchemaVersion, replay } from "../domain/combo";
import type { ComboDocument } from "../domain/combo";

export const maximumImportBytes = 5 * 1024 * 1024;
const appName = "duel-links-combo-maker";

const zoneIds = new Set<string>(zones.map(({ id }) => id));
const zoneId = z.custom<ZoneId>(
  (value) => typeof value === "string" && zoneIds.has(value),
  "Unknown zone",
);
const side = z.enum(sides);
const position = z.enum(["attack", "defense"]);
const id = z.number().int().min(1).max(1_000_000);
const whole = z.number().int();
const text = (max: number) => z.string().max(max);

const instanceSchema = z.object({
  id,
  definitionId: whole.nonnegative(),
  owner: side,
  controller: side,
  zone: zoneId,
  position,
  faceUp: z.boolean(),
  attachedTo: id.optional(),
  counters: z.record(text(40), whole.nonnegative()).optional(),
  stats: z.partialRecord(z.enum(statKeys), whole.min(0).max(99_999)).optional(),
  markers: z.array(text(60)).max(20).optional(),
  alternatives: z.array(whole.nonnegative()).max(8).optional(),
});

const boardSchema = z.object({
  instances: z.array(instanceSchema).max(600),
  nextId: id,
  handSize: whole.min(0).max(20),
  life: z.object({ player: whole, opponent: whole }),
  pendulum: z.object({ player: z.boolean(), opponent: z.boolean() }),
  turn: whole.min(1).max(999),
  active: side,
  phase: z.enum(phases),
  going: z.enum(["first", "second"]).optional(),
});

const at = z.enum(["top", "bottom"]).optional();
const operationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("create"),
    id,
    definitionId: whole.nonnegative(),
    zone: zoneId,
    owner: side,
    position: position.optional(),
    faceUp: z.boolean().optional(),
    at,
  }),
  z.object({
    op: z.literal("move"),
    id,
    zone: zoneId,
    position: position.optional(),
    faceUp: z.boolean().optional(),
    at,
  }),
  z.object({ op: z.literal("attach"), id, to: id }),
  z.object({ op: z.literal("pose"), id, position, faceUp: z.boolean() }),
  z.object({ op: z.literal("control"), id, side }),
  z.object({ op: z.literal("counter"), id, counter: text(40), delta: whole }),
  z.object({
    op: z.literal("stat"),
    id,
    stat: z.enum(statKeys),
    value: whole.nullable(),
  }),
  z.object({
    op: z.literal("marker"),
    id,
    marker: text(60),
    active: z.boolean(),
  }),
  z.object({ op: z.literal("remove"), id }),
  z.object({ op: z.literal("life"), side, value: whole }),
  z.object({
    op: z.literal("duel"),
    turn: whole.optional(),
    active: side.optional(),
    phase: z.enum(phases).optional(),
  }),
]);

const skillSchema = z.object({
  id: text(200).optional(),
  name: text(200).min(1),
  description: text(5000).optional(),
  origin: z.enum(["dataset", "custom", "unspecified"]),
  sourceName: text(200).optional(),
  sourceUrl: z.string().url().max(500).optional(),
  capturedAt: text(40).optional(),
});

const stepSchema = z.object({
  id: text(100).min(1),
  action: z.object({
    kind: z.enum(actionKinds),
    cards: z.array(id).max(20),
    materials: z.array(id).max(20).optional(),
    operations: z.array(operationSchema).max(100),
    detail: text(500).optional(),
    skill: skillSchema.optional(),
  }),
  customDescription: text(1000).optional(),
  notes: text(2000).optional(),
  groupId: text(100).optional(),
});

const documentSchema = z.object({
  schemaVersion: z.literal(comboSchemaVersion),
  id: text(100).min(1),
  title: text(120).min(1),
  description: text(2000).optional(),
  format: z.literal("speed-duel"),
  deckAware: z.boolean().optional(),
  character: z.object({ name: text(60).min(1) }).optional(),
  skill: skillSchema.optional(),
  initialBoard: boardSchema,
  steps: z.array(stepSchema).max(500),
  cards: z.record(text(20), cardSchema),
  createdAt: text(40),
  updatedAt: text(40),
});

export type ParseResult =
  { ok: true; doc: ComboDocument } | { ok: false; error: string };

/** Wraps a combo in a small envelope so other JSON is not mistaken for a combo. */
export function serializeCombo(doc: ComboDocument, exportedAt: string) {
  return `${JSON.stringify({ app: appName, exportedAt, combo: doc }, null, 2)}\n`;
}

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "The file is not a valid combo.";
  const path = issue.path.join(".");
  if (path.endsWith("kind")) return "The file uses an unknown action type.";
  return `Invalid combo data at ${path || "the top level"}: ${issue.message}`;
}

/**
 * Validates an untrusted value as a combo document, including references and replay.
 * Older schema versions would be migrated here; version 1 is the first one.
 */
export function validateComboDocument(value: unknown): ParseResult {
  if (!value || typeof value !== "object")
    return { ok: false, error: "The file is not a combo." };
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (typeof version !== "number")
    return { ok: false, error: "The file has no combo schema version." };
  if (version > comboSchemaVersion)
    return {
      ok: false,
      error: `This combo uses schema version ${version}, made by a newer version of the app.`,
    };
  if (version < 1)
    return { ok: false, error: `Schema version ${version} is not supported.` };
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const doc = parsed.data as ComboDocument;
  for (const [key, card] of Object.entries(doc.cards))
    if (String(card.id) !== key)
      return { ok: false, error: `Card snapshot ${key} has a mismatched ID.` };
  const stepIds = new Set(doc.steps.map((step) => step.id));
  if (stepIds.size !== doc.steps.length)
    return { ok: false, error: "Two steps share the same ID." };
  const failure = replay(doc).failure;
  if (failure)
    return {
      ok: false,
      error:
        failure.index < 0
          ? `The starting board is invalid. ${failure.message}`
          : `Step ${failure.index + 1} cannot be replayed. ${failure.message}`,
    };
  return { ok: true, doc };
}

/** Parses an imported file's text. Imported content is never executed. */
export function parseComboFile(text: string): ParseResult {
  if (new Blob([text]).size > maximumImportBytes)
    return { ok: false, error: "The file is larger than 5 MB." };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
  if (value && typeof value === "object" && "app" in value) {
    if ((value as { app: unknown }).app !== appName)
      return {
        ok: false,
        error: "The file was not made by Duel Links Combo Maker.",
      };
    return validateComboDocument((value as { combo?: unknown }).combo);
  }
  return validateComboDocument(value);
}
