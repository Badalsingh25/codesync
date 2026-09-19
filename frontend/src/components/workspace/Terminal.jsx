import { useRef, useEffect } from 'react';

const BASE_TABS = [
  { id: 'console', label: 'Console' },
  { id: 'chat', label: 'Chat' },
  { id: 'problems', label: 'Problems' },
  { id: 'activity', label: 'Activity' },
  { id: 'terminal', label: 'Terminal' },
];

const ACTIVITY_ICONS = {
  join: { icon: '→', color: '#10b981' },
  leave: { icon: '←', color: '#ef4444' },
  change: { icon: '✎', color: '#6366f1' },
  cursor: { icon: '◎', color: '#f59e0b' },
};

const fmt = (ts) =>
  new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

const Terminal = ({
  language,
  isRunning,
  terminalOutput,
  setTerminalOutput,
  execResult,
  activeTab,
  setActiveTab,
  previewContent,
  clearTerminal,
  setShowTerminal,
  activityLog = [],
  sendExecutionInput,
  chatMessages = [],
  sendChatMessage,
  deleteChatMessage,
  isModerator = false,
  userEmail,
  height = 240
}) => {
  const bodyRef = useRef(null);
  const chatInputRef = useRef(null);

  // Dynamically add Preview tab when previewContent is set
  const TABS = previewContent
    ? [...BASE_TABS, { id: 'preview', label: 'Preview' }]
    : BASE_TABS;

  /*
   * Automatically scroll terminal to the bottom
   * whenever new output arrives.
   */
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop =
        bodyRef.current.scrollHeight;
    }
  }, [terminalOutput, activityLog, activeTab, chatMessages]);

  return (
    <div style={{ height }} className="border-t border-zinc-800 flex flex-col min-h-[120px] max-h-[75vh] bg-zinc-950 shrink-0">

      {/* Header */}
      <div className="flex items-center justify-between h-9 bg-zinc-900 border-b border-zinc-800 shrink-0 pr-2">

        {/* Tabs */}
        <div className="flex h-full">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 h-full bg-transparent border-none cursor-pointer text-xs font-medium border-b-2 transition-all ${
                  isActive
                    ? 'text-zinc-100 border-indigo-500'
                    : 'text-zinc-500 border-transparent hover:text-zinc-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">

          {activeTab === 'console' && (
            <button
              onClick={clearTerminal}
              className="bg-transparent border-none cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded"
            >
              Clear
            </button>
          )}

          <button
            onClick={() => setShowTerminal(false)}
            className="bg-transparent border-none cursor-pointer text-lg text-zinc-500 hover:text-zinc-300 leading-none px-1"
          >
            ×
          </button>

        </div>
      </div>

      {/* Body */}
      <div
        ref={bodyRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-[12.5px] leading-relaxed"
      >

        {/* =========================
            CONSOLE
        ========================== */}
        {activeTab === 'console' && (
          <div className="flex flex-col gap-1 h-full">

            {/* Output area */}
            <div className="flex-1">

              {/* Running indicator */}
              {isRunning && !terminalOutput && (
                <div className="flex items-center gap-2 text-amber-500">
                  <div className="vs-loader-sm border-t-amber-500" />

                  Executing {language?.toUpperCase()}…
                </div>
              )}

              {/* Initial state */}
              {!isRunning &&
                !terminalOutput &&
                !execResult && (
                  <span className="text-zinc-500 italic">
                    Press Run to execute your{' '}
                    {language?.toUpperCase()} code.
                  </span>
                )}

              {/* Streaming terminal output */}
              {terminalOutput && (
                <div className="text-emerald-300 whitespace-pre-wrap">
                  {terminalOutput}
                </div>
              )}

              {/* Execution error */}
              {execResult?.error && (
                <div className="text-red-300 whitespace-pre-wrap">
                  ✖ {execResult.error}
                </div>
              )}

              {/* Execution result */}
              {execResult && (
                <div className="flex gap-4 mt-2 pt-2 border-t border-zinc-800 text-[11px] text-zinc-500">

                  {/* Exit code */}
                  {execResult.exitCode !== null && (
                    <span
                      className={
                        execResult.exitCode === 0
                          ? 'text-emerald-500'
                          : 'text-red-500'
                      }
                    >
                      {execResult.exitCode === 0
                        ? '✓'
                        : '✖'}{' '}
                      Exit code {execResult.exitCode}
                    </span>
                  )}

                  {/* Execution time */}
                  {execResult.executionTime !== null && (
                    <span>
                      ⏱ {execResult.executionTime}ms
                    </span>
                  )}

                </div>
              )}

            </div>

            {/* =========================
                EXECUTION INPUT
            ========================== */}
            {isRunning && (
              <input
                type="text"
                className="w-full bg-transparent text-white outline-none px-2 py-1 border-t border-zinc-700 mt-1"
                placeholder="Type input and press Enter..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const value = e.target.value;

                    if (!value.trim()) {
                      return;
                    }

                    // Send input to backend
                    sendExecutionInput(value);

                    // Echo input locally like a real terminal
                    setTerminalOutput(
                      prev => prev + value + '\n'
                    );

                    // Clear input box
                    e.target.value = '';
                  }
                }}
              />
            )}

          </div>
        )}

        {/* =========================
            PROBLEMS
        ========================== */}
        {activeTab === 'problems' && (
          <span className="text-zinc-500 italic">
            No problems detected.
          </span>
        )}

        {/* =========================
            CHAT
        ========================== */}
        {activeTab === 'chat' && (
          <div className="flex flex-col h-full">

            {/* Message list */}
            <div className="flex-1 flex flex-col gap-2 overflow-y-auto pb-2">
              {chatMessages.length === 0 && (
                <span className="text-zinc-500 italic">
                  No messages yet — say hi to your collaborators.
                </span>
              )}

              {chatMessages.map((m, idx) => {
                const isOwn = m.creator === userEmail;
                const canDelete = m.id != null && (isOwn || isModerator);
                return (
                  <div
                    key={m.id ?? idx}
                    className={`group flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-[10px] text-zinc-500 px-1 flex items-center gap-1.5">
                      {isOwn ? 'You' : (m.creator?.split('@')[0] || m.creator)}
                      {' · '}
                      {m.localDateTime ? fmt(m.localDateTime) : 'just now'}
                      {canDelete && (
                        <button
                          title="Remove message"
                          onClick={() => {
                            if (!window.confirm('Remove this message for everyone?')) return;
                            deleteChatMessage(m.id).catch(err =>
                              alert(err.response?.data?.message || 'Failed to remove message.')
                            );
                          }}
                          className="hidden group-hover:inline bg-transparent border-none cursor-pointer text-zinc-600 hover:text-red-400 text-[11px] leading-none p-0"
                        >
                          ✕
                        </button>
                      )}
                    </span>
                    <span
                      className={`px-2.5 py-1.5 rounded-lg text-[12.5px] max-w-[80%] whitespace-pre-wrap ${
                        isOwn
                          ? 'bg-indigo-500/20 text-indigo-200'
                          : 'bg-zinc-800 text-zinc-200'
                      }`}
                    >
                      {m.content}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Message input */}
            <input
              ref={chatInputRef}
              type="text"
              className="w-full bg-transparent text-white outline-none px-2 py-1.5 border-t border-zinc-700 mt-1"
              placeholder="Message your collaborators..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const value = e.target.value;
                  if (!value.trim()) return;
                  sendChatMessage(value);
                  e.target.value = '';
                }
              }}
            />
          </div>
        )}

        {/* =========================
            ACTIVITY
        ========================== */}
        {activeTab === 'activity' && (
          <div className="flex flex-col gap-1.5">

            {activityLog.length === 0 && (
              <span className="text-zinc-500 italic">
                Collaboration activity will appear here…
              </span>
            )}

            {activityLog.map((ev, idx) => {
              const cfg =
                ACTIVITY_ICONS[ev.type] ||
                ACTIVITY_ICONS.cursor;

              return (
                <div
                  key={idx}
                  className="flex items-start gap-2 text-xs"
                >

                  <span className="text-zinc-600 shrink-0 w-14">
                    {fmt(ev.timestamp)}
                  </span>

                  <span
                    className="shrink-0 w-3.5 text-center"
                    style={{ color: cfg.color }}
                  >
                    {cfg.icon}
                  </span>

                  <span className="text-zinc-400">

                    <span className="text-cyan-400 font-semibold">
                      {ev.user}
                    </span>

                    {ev.type === 'join' &&
                      ' joined the room'}

                    {ev.type === 'leave' &&
                      ' left the room'}

                    {ev.type === 'change' && (
                      <>
                        {' changed '}
                        <span className="font-mono bg-indigo-500/15 text-indigo-400 px-1.5 py-0.5 rounded ml-1">
                          L{ev.fromLine}–L{ev.toLine}
                        </span>
                      </>
                    )}

                    {ev.type === 'cursor' && (
                      <>
                        {' moved to '}
                        <span className="text-amber-500 ml-1">
                          L{ev.line}
                        </span>
                      </>
                    )}

                  </span>
                </div>
              );
            })}

          </div>
        )}

        {/* =========================
            TERMINAL
        ========================== */}
        {activeTab === 'terminal' && (
          <span className="text-zinc-500 italic">
            <span className="text-emerald-500">$</span>{' '}
            Interactive terminal not available in collaborative mode.
          </span>
        )}

        {/* =========================
            PREVIEW
        ========================== */}
        {activeTab === 'preview' && previewContent && (
          <iframe
            srcDoc={previewContent}
            sandbox="allow-scripts"
            className="w-full h-full border-none rounded-md bg-white"
            title="HTML/CSS Preview"
          />
        )}

      </div>
    </div>
  );
};

export default Terminal;