/**
 * Saved Storyboard Sessions — freezes the full composer state to localStorage
 * so a director can resume a project at a later time. Keyed by project name.
 */

const KEY = 'studio:saved-storyboards:v1';

export interface SavedStoryboard {
  id: string;          // uuid
  name: string;        // project name (label)
  savedAt: number;     // ms epoch
  payload: Record<string, unknown>; // full snapshot of composer state
}

function readAll(): SavedStoryboard[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedStoryboard[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[savedStoryboards] write failed', e);
  }
}

export function listSavedStoryboards(): SavedStoryboard[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

export function saveStoryboard(name: string, payload: Record<string, unknown>): SavedStoryboard {
  const list = readAll();
  const trimmed = name.trim() || 'Untitled Scene';
  // Upsert by name (case-insensitive)
  const existing = list.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const entry: SavedStoryboard = existing
    ? { ...existing, name: trimmed, savedAt: Date.now(), payload }
    : {
        id: crypto.randomUUID(),
        name: trimmed,
        savedAt: Date.now(),
        payload,
      };
  const next = existing
    ? list.map((s) => (s.id === existing.id ? entry : s))
    : [entry, ...list];
  writeAll(next);
  return entry;
}

export function deleteSavedStoryboard(id: string) {
  writeAll(readAll().filter((s) => s.id !== id));
}
