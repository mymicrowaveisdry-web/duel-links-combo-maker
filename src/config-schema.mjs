import { z } from "zod";

// Every location is relative: served paths to the public folder and the deployed base,
// local paths to the repository root. Absolute or parent paths are rejected so the
// repository runs the same on any machine.
const relative = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !/^([a-z]:|[\\/])/i.test(value) && !value.split(/[\\/]/).includes(".."),
    "Use a path relative to the project without '..'.",
  );
const folder = relative.refine(
  (value) => value.endsWith("/"),
  "Folder paths end with '/'.",
);

export const appConfigSchema = z.object({
  version: z.literal(1),
  base: z.string().min(1),
  publicDir: relative,
  served: z.object({
    catalog: relative,
    imageManifest: relative,
    cardImages: folder,
    skills: relative,
  }),
  local: z.object({
    cardResponse: relative,
  }),
  sources: z.object({
    cardInfo: z.string().url(),
    cardImages: z.string().url(),
    attribution: z.string().url(),
  }),
});
