import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RETRY_PREFIX = "lazy-retry:";

function canUseSessionStorage() {
  try {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  } catch {
    return false;
  }
}

function getRetryFlag(key: string) {
  if (!canUseSessionStorage()) return false;
  return window.sessionStorage.getItem(`${RETRY_PREFIX}${key}`) === "true";
}

function setRetryFlag(key: string, value: boolean) {
  if (!canUseSessionStorage()) return;
  const storageKey = `${RETRY_PREFIX}${key}`;
  if (value) {
    window.sessionStorage.setItem(storageKey, "true");
    return;
  }
  window.sessionStorage.removeItem(storageKey);
}

function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message);
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  retryKey: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const module = await importer();
      setRetryFlag(retryKey, false);
      return module;
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error) && !getRetryFlag(retryKey)) {
        setRetryFlag(retryKey, true);
        window.location.reload();
        return new Promise<never>(() => undefined);
      }

      setRetryFlag(retryKey, false);
      throw error;
    }
  });
}
