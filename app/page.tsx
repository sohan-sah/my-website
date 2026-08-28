'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clearHistory, deleteHistoryEntry, getHistory, HistoryEntry } from '@/lib/history';

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(getHistory());
  }, []);

  function remove(id: string) {
    deleteHistoryEntry(id);
    setEntries(getHistory());
  }

  function clearAll() {
    clearHistory();
    setEntries([]);
  }

  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand">
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-dim)' }}>‹ Home</Link>
          <span className="brand-title">History</span>
        </div>
      </header>

      <div style={{ padding: 18 }}>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>
          Stored only in this browser (localStorage) — there's no account or server-side
          database yet, so this list won't follow you to another device.
        </p>

        {entries.length === 0 && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No activity yet.</p>}

        {entries.map((e) => (
          <div key={e.id} className="card" style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{e.tool}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {e.inputName || '—'} · {new Date(e.timestamp).toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: e.status === 'success' ? '#1a9e6b' : 'var(--danger)', fontWeight: 600 }}>
                {e.status === 'success' ? `Success${e.model ? ` · ${e.model}` : ''}` : `Failed${e.detail ? ` · ${e.detail}` : ''}`}
              </div>
            </div>
            <button className="btn-secondary" style={{ width: 'auto', padding: '6px 12px', fontSize: 12, alignSelf: 'center' }} onClick={() => remove(e.id)}>
              Delete
            </button>
          </div>
        ))}

        {entries.length > 0 && (
          <button className="btn-secondary" style={{ marginTop: 8 }} onClick={clearAll}>Clear all history</button>
        )}
      </div>
    </div>
  );
}
