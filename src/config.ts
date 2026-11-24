import rawConfig from "../app.config.json";
import { appConfigSchema } from "./config-schema.mjs";

/** Central project configuration from app.config.json, validated at startup. */
export const appConfig = appConfigSchema.parse(rawConfig);

/** Resolves a served path from the config against the deployed base URL. */
export function servedUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path}`;
}
