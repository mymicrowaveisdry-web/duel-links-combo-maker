import { z } from "zod";
import { appConfig, servedUrl } from "../config";

const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  sourceUrl: z.string().url().optional(),
});

const skillFileSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({ name: z.string(), url: z.string().url() }),
  importedAt: z.string(),
  skills: z.array(skillSchema).min(1),
});

export type SkillRecord = z.infer<typeof skillSchema>;
export interface SkillCatalog {
  sourceName: string;
  importedAt: string;
  skills: SkillRecord[];
}

let pending: Promise<SkillCatalog> | null = null;

/**
 * Loads the Skill snapshot once, on first use, so the 0.6 MB file never delays
 * start-up. A failed load can be retried.
 */
export function loadSkills(): Promise<SkillCatalog> {
  pending ??= fetch(servedUrl(appConfig.served.skills))
    .then((response) => {
      if (!response.ok)
        throw new Error(`Skill list request failed (${response.status}).`);
      return response.json();
    })
    .then((json) => {
      const file = skillFileSchema.parse(json);
      return {
        sourceName: file.source.name,
        importedAt: file.importedAt,
        skills: file.skills,
      };
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

/**
 * Rush Duel Skills in this snapshot use "[REQUIREMENT]" and "[EFFECT]" headings. This
 * is a text heuristic, not verified format data, and the UI labels it that way.
 */
export function looksLikeRushSkill(skill: SkillRecord) {
  return /\[(REQUIREMENT|EFFECT)\]/.test(skill.description ?? "");
}

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’‘]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Case- and punctuation-insensitive search. Name matches come before text matches. */
export function searchSkills(
  skills: readonly SkillRecord[],
  query: string,
  hideRush: boolean,
): SkillRecord[] {
  const terms = normalize(query).split(" ").filter(Boolean);
  const names: SkillRecord[] = [];
  const texts: SkillRecord[] = [];
  for (const skill of skills) {
    if (hideRush && looksLikeRushSkill(skill)) continue;
    const name = normalize(skill.name);
    if (terms.every((term) => name.includes(term))) {
      names.push(skill);
      continue;
    }
    const text = `${name} ${normalize(skill.description ?? "")}`;
    if (terms.length && terms.every((term) => text.includes(term)))
      texts.push(skill);
  }
  const order = (a: SkillRecord, b: SkillRecord) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return [...names.sort(order), ...texts.sort(order)];
}
