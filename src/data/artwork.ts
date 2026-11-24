import { createContext, useContext } from "react";
import { z } from "zod";
import { appConfig, servedUrl } from "../config";

// Card definition IDs (passcodes) map to artwork IDs. Instance IDs never appear here.
const manifestSchema = z.object({
  version: z.literal(1),
  variant: z.literal("small"),
  artwork: z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative()),
});

export type ArtworkLookup = (cardId: number) => string | undefined;

export const noArtwork: ArtworkLookup = () => undefined;

export const ArtworkContext = createContext<ArtworkLookup>(noArtwork);

export function useArtwork(cardId: number) {
  return useContext(ArtworkContext)(cardId);
}

/** Loads the same-origin image manifest. A missing or invalid manifest yields text faces. */
export async function loadArtwork(signal: AbortSignal): Promise<ArtworkLookup> {
  const response = await fetch(servedUrl(appConfig.served.imageManifest), {
    signal,
  });
  if (!response.ok) return noArtwork;
  const manifest = manifestSchema.parse(await response.json());
  const artwork = new Map(
    Object.entries(manifest.artwork).map(([id, art]) => [Number(id), art]),
  );
  const folder = servedUrl(appConfig.served.cardImages);
  return (cardId) => {
    const art = artwork.get(cardId);
    return art === undefined ? undefined : `${folder}${art}.jpg`;
  };
}
