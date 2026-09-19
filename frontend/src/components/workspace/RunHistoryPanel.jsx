import { useState, useEffect, useCallback } from 'react';
import { api } from '../../context/AuthContext';

const RunHistoryPanel = ({ roomId, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

 const loadHistory = useCallback(async () => {
    try {
        const { data } = await api.get(`/execute/history/${roomId}`);
        setHistory(data || []);
    } catch {
        setHistory([]);
    } finally {
        setLoading(false);
    }
}, [roomId]);

useEffect(() => {
    // The request completes asynchronously before updating local state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
}, [loadHistory]);

const formatTime = (ts) => {
    if (!ts) return 'just now';

    const d = new Date(ts);
    const diff = new Date().getTime() - d.getTime();

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

  const langIcon = (lang) => {
    const map = {
      java:   { bg: 'bg-amber-500',     text: 'JAVA' },
      python: { bg: 'bg-blue-500',      text: 'PY' },
      javascript: { bg: 'bg-yellow-500', text: 'JS' },
      html:   { bg: 'bg-orange-500',    text: 'HTML' },
      css:    { bg: 'bg-sky-400',       text: 'CSS' },
    };
    const c = map[lang] || { bg: 'bg-zinc-600', text: (lang || '?').toUpperCase() };
    return (
      <span className={`${c.bg} text-white text-[10px] font-bold px-1.5 py-0.5 rounded leading-none`}>
        {c.text}
      </span>
    );
  };

  const statusBadge = (exitCode) => {
    if (exitCode === 0) return <span className="text-[11px] text-emerald-400 font-medium">Success</span>;
    if (exitCode === -1) return <span className="text-[11px] text-red-400 font-medium">Error</span>;
    return <span className="text-[11px] text-amber-400 font-medium">Exit {exitCode}</span>;
  };

  const selected = history.find(h => h.id === selectedId);

  return (
    <div className="h-full flex flex-col bg-zinc-900 text-zinc-300">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <h3 className="text-sm font-semibold text-zinc-200">Run History</h3>
          <span className="text-[11px] text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded-full">
            {history.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 border-none cursor-pointer bg-transparent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : history.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 px-6">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-30">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="text-xs text-center text-zinc-500 leading-relaxed">
              No runs yet.<br />Execute some code to see history here.
            </p>
          </div>
        ) : selected ? (
          /* Detail view */
          <div className="h-full flex flex-col">
            <button
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 border-none bg-transparent cursor-pointer"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to list
            </button>
            <div className="flex-1 overflow-auto px-4 pb-4 space-y-3">
              <div className="flex items-center gap-2">
                {langIcon(selected.language)}
                {statusBadge(selected.exitCode)}
                <span className="text-[11px] text-zinc-500">
                  {selected.executionTimeMs}ms
                </span>
              </div>
              <div className="text-[11px] text-zinc-500">
                <span className="text-zinc-400">{selected.executorEmail}</span>
                <span className="mx-1.5">·</span>
                <span>{formatTime(selected.executedAt)}</span>
              </div>
              {selected.output && (
                <div>
                  <div className="text-[11px] text-zinc-500 mb-1 font-medium uppercase tracking-wider">Output</div>
                  <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 overflow-auto max-h-64 whitespace-pre-wrap font-mono leading-relaxed">
                    {selected.output}
                  </pre>
                </div>
              )}
              {selected.error && (
                <div>
                  <div className="text-[11px] text-red-400 mb-1 font-medium uppercase tracking-wider">Error</div>
                  <pre className="bg-red-950/40 border border-red-900/50 rounded-lg p-3 text-xs text-red-300 overflow-auto max-h-40 whitespace-pre-wrap font-mono leading-relaxed">
                    {selected.error}
                  </pre>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* List view */
          <div className="h-full overflow-auto">
            <div className="divide-y divide-zinc-800/40">
              {history.map((run) => (
                <div
                  key={run.id}
                  onClick={() => setSelectedId(run.id)}
                  className="px-4 py-3 hover:bg-white/[0.03] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    {langIcon(run.language)}
                    {statusBadge(run.exitCode)}
                    <span className="text-[11px] text-zinc-600 ml-auto">
                      {run.executionTimeMs}ms
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-1">
                    <span className="truncate max-w-[120px]">{run.executorEmail}</span>
                    <span className="text-zinc-700">·</span>
                    <span className="shrink-0">{formatTime(run.executedAt)}</span>
                  </div>
                  {run.output && (
                    <p className="text-[11px] text-zinc-600 truncate group-hover:text-zinc-500 transition-colors">
                      {run.output.substring(0, 80)}{run.output.length > 80 ? '…' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RunHistoryPanel;
