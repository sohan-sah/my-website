export type HistoryEntry = {
  id: string;
  tool: string;
  timestamp: number;
  inputName?: string;
  model?: string;
  status: 'success' | 'error';
  detail?: string;
};

const KEY = '4k8k_history_v1';

export function getHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function addHistoryEntry(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getHistory();
    const next: HistoryEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now()
    };
    // Keep the most recent 200 entries so this can't grow unbounded.
    const trimmed = [next, ...existing].slice(0, 200);
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage can throw (private browsing, quota) — history is a
    // convenience, not critical, so we fail silently rather than break the tool.
  }
}

export function deleteHistoryEntry(id: string): void {
  if (typeof window === 'undefined') return;
  const next = getHistory().filter((e) => e.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
}
