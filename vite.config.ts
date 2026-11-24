import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import rawConfig from "./app.config.json";
import { appConfigSchema } from "./src/config-schema.mjs";

const config = appConfigSchema.parse(rawConfig);

export default defineConfig({
  base: config.base,
  publicDir: config.publicDir,
  plugins: [react()],
});
