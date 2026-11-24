// Browser-only helpers for exports: downloads, clipboard and stored preferences.

/** Saves a blob under a file name. The temporary URL is revoked afterwards. */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text: string, fileName: string, type: string) {
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName);
}

/** Copies text, returning a message suitable for a status line. */
export async function copyText(
  text: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard access is unavailable in this browser.");
    await navigator.clipboard.writeText(text);
    return { ok: true, message: "Copied to the clipboard." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message
          ? `Couldn’t copy: ${error.message} Select the text and copy it instead.`
          : "Couldn’t copy. Select the text and copy it instead.",
    };
  }
}

/** Reads a JSON preference. Storage may be blocked, so failures fall back. */
export function readPreference<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return fallback;
    // Only keep known keys whose types match the fallback.
    const merged = { ...fallback };
    for (const key of Object.keys(fallback) as Array<keyof T>) {
      const candidate = (value as Partial<T>)[key];
      if (typeof candidate === typeof fallback[key])
        merged[key] = candidate as T[keyof T];
    }
    return merged;
  } catch {
    return fallback;
  }
}

export function writePreference(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are optional.
  }
}
