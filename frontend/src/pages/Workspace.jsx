import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import MonacoEditor, { DiffEditor, useMonaco } from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';
import { useAuth, api } from '../context/AuthContext';
import { useToast } from '../context/ToastContext.jsx';
import { useConfirm } from '../context/ConfirmContext';
import { useCollaboration } from '../hooks/useCollaboration';
import { useCodeExecution } from '../hooks/useCodeExecution';
import { useIsMobile } from '../hooks/useIsMobile';
import ActivityBar from '../components/workspace/ActivityBar';
import Sidebar from '../components/workspace/Sidebar';
import Terminal from '../components/workspace/Terminal';
import StatusBar from '../components/workspace/StatusBar';
import SettingsModal from '../components/workspace/SettingsModal';
import RunHistoryPanel from '../components/workspace/RunHistoryPanel';
import IntelliSenseProvider from '../components/workspace/IntelliSenseProvider';
import GitBlameProvider from '../components/workspace/GitBlameProvider';

// ─── Avatar colours (must match Sidebar) ───────────────────
const AVATAR_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899'
];

const getColor = (i) =>
  AVATAR_COLORS[i % AVATAR_COLORS.length];

const getShort = (email) =>
  (email?.split('@')[0] || 'U')
    .substring(0, 2)
    .toUpperCase();

const getDisplay = (email) =>
  email?.split('@')[0] || email;

const EXT_COLOR = {
  java: '#f89820',
  js: '#f7df1e',
  jsx: '#61dafb',
  xml: '#ef4444',
  ts: '#3178c6',
  css: '#38bdf8',
  html: '#e44d26',
  py: '#3572a5'
};

// Custom Monaco theme definitions
const CUSTOM_THEMES = {
  dracula: {
    base: 'vs-dark',
    inherit: true,

    rules: [
      {
        token: 'comment',
        foreground: '6272a4',
        fontStyle: 'italic'
      },
      {
        token: 'keyword',
        foreground: 'ff79c6'
      },
      {
        token: 'string',
        foreground: 'f1fa8c'
      },
      {
        token: 'number',
        foreground: 'bd93f9'
      },
      {
        token: 'type',
        foreground: '8be9fd',
        fontStyle: 'italic'
      },
      {
        token: 'function',
        foreground: '50fa7b'
      },
      {
        token: 'variable',
        foreground: 'f8f8f2'
      },
      {
        token: 'delimiter',
        foreground: 'ff79c6'
      }
    ],

    colors: {
      'editor.background': '#282a36',
      'editor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#6272a4',
      'editorCursor.foreground': '#f8f8f0',
      'editor.selectionBackground': '#44475a',
      'editor.lineHighlightBackground': '#44475a55',
      'editorGutter.background': '#282a36',
      'scrollbarSlider.background': '#44475a99'
    }
  },

  monokai: {
    base: 'vs-dark',
    inherit: true,

    rules: [
      {
        token: 'comment',
        foreground: '75715e',
        fontStyle: 'italic'
      },
      {
        token: 'keyword',
        foreground: 'f92672'
      },
      {
        token: 'string',
        foreground: 'e6db74'
      },
      {
        token: 'number',
        foreground: 'ae81ff'
      },
      {
        token: 'type',
        foreground: '66d9e8',
        fontStyle: 'italic'
      },
      {
        token: 'function',
        foreground: 'a6e22e'
      },
      {
        token: 'variable',
        foreground: 'f8f8f2'
      },
      {
        token: 'delimiter',
        foreground: 'f92672'
      }
    ],

    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#75715e',
      'editorCursor.foreground': '#f8f8f0',
      'editor.selectionBackground': '#49483e',
      'editor.lineHighlightBackground': '#3e3d3255',
      'editorGutter.background': '#272822',
      'scrollbarSlider.background': '#49483e99'
    }
  },

  'github-dark': {
    base: 'vs-dark',
    inherit: true,

    rules: [
      {
        token: 'comment',
        foreground: '8b949e',
        fontStyle: 'italic'
      },
      {
        token: 'keyword',
        foreground: 'ff7b72'
      },
      {
        token: 'string',
        foreground: 'a5d6ff'
      },
      {
        token: 'number',
        foreground: '79c0ff'
      },
      {
        token: 'type',
        foreground: 'ffa657'
      },
      {
        token: 'function',
        foreground: 'd2a8ff'
      },
      {
        token: 'variable',
        foreground: 'c9d1d9'
      },
      {
        token: 'delimiter',
        foreground: 'c9d1d9'
      }
    ],

    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editorLineNumber.foreground': '#6e7681',
      'editorCursor.foreground': '#c9d1d9',
      'editor.selectionBackground': '#388bfd33',
      'editor.lineHighlightBackground': '#161b2255',
      'editorGutter.background': '#0d1117',
      'scrollbarSlider.background': '#6e768199'
    }
  },

  nord: {
    base: 'vs-dark',
    inherit: true,

    rules: [
      {
        token: 'comment',
        foreground: '616e88',
        fontStyle: 'italic'
      },
      {
        token: 'keyword',
        foreground: '81a1c1'
      },
      {
        token: 'string',
        foreground: 'a3be8c'
      },
      {
        token: 'number',
        foreground: 'b48ead'
      },
      {
        token: 'type',
        foreground: '8fbcbb'
      },
      {
        token: 'function',
        foreground: '88c0d0'
      },
      {
        token: 'variable',
        foreground: 'd8dee9'
      },
      {
        token: 'delimiter',
        foreground: 'eceff4'
      }
    ],

    colors: {
      'editor.background': '#2e3440',
      'editor.foreground': '#d8dee9',
      'editorLineNumber.foreground': '#4c566a',
      'editorCursor.foreground': '#d8dee9',
      'editor.selectionBackground': '#434c5e',
      'editor.lineHighlightBackground': '#3b424e55',
      'editorGutter.background': '#2e3440',
      'scrollbarSlider.background': '#434c5e99'
    }
  }
};

const Workspace = () => {
  const { roomId } = useParams();
  const location = useLocation();
  const { userEmail, token } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [roomAccessError, setRoomAccessError] = useState(null);
  const [checkingAccess, setCheckingAccess] = useState(true);

  // Check room access up front — if the room is locked and this user was
  // never a member, or the room doesn't exist, show a real message instead
  // of silently rendering a blank workspace.
  useEffect(() => {
    api.get(`/room/${roomId}/state`)
      .then(() => setCheckingAccess(false))
      .catch(err => {
        setRoomAccessError(
          err.response?.data?.message || 'Unable to access this room.'
        );
        setCheckingAccess(false);
      });
  }, [roomId]);

  const [roomName] = useState(
    location.state?.roomName || 'Workspace'
  );

  const [roomCode] = useState(
    location.state?.roomCode || ''
  );

  const [language, setLanguage] = useState('javascript');
  const [editorLine, setEditorLine] = useState(1);
  const [editorCol, setEditorCol] = useState(1);

  // Sidebar panel: 'files' | 'search' | 'users' | null
  const [activeSidePanel, setActiveSidePanel] =
    useState('files');

  // Run History panel
  const [showHistory, setShowHistory] = useState(false);

  // Settings
  const [showSettings, setShowSettings] =
    useState(false);

  const [fontSize, setFontSize] = useState(14);
  const [currentTheme, setCurrentTheme] =
    useState('vs-dark');

  const [showMinimap, setShowMinimap] =
    useState(true);

  const [wordWrap, setWordWrap] =
    useState('off');

  const [smoothScroll, setSmoothScroll] =
    useState(true);

  // Activity log
  const [activityLog, setActivityLog] =
    useState([]);

  const [editorInstance, setEditorInstance] = useState(null);
  const editorRef = useRef(null);

  // ── Resizable sidebar + terminal panel ──────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(localStorage.getItem('cbc_sidebarWidth'));
    return saved >= 180 && saved <= 520 ? saved : 260;
  });
  const [terminalHeight, setTerminalHeight] = useState(() => {
    const saved = Number(localStorage.getItem('cbc_terminalHeight'));
    return saved >= 120 ? saved : 240;
  });
  const resizeStateRef = useRef(null);

  // Force Monaco to re-layout whenever sidebar width changes, or the
  // viewport crosses the mobile breakpoint (e.g. a phone rotating).
  useEffect(() => {
    const t = setTimeout(() => {
      editorRef.current?.getAction('editor.action.layout')?.run();
    }, 50);
    return () => clearTimeout(t);
  }, [sidebarWidth, isMobile]);

  // ── Split editor state ──────────────────────────────────────
  const [isSplit, setIsSplit] = useState(false);
  const [splitFile, setSplitFile] = useState('');
  // const splitEditorRef = useRef(null);
  const splitBindingRef = useRef(null);
  const awarenessRef = useRef(null);
  const [isDiffMode, setIsDiffMode] = useState(false);
  const [diffFile, setDiffFile] = useState('');

  useEffect(() => {
    localStorage.setItem('cbc_sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem('cbc_terminalHeight', String(terminalHeight));
  }, [terminalHeight]);

  // Reads the drag coordinate from either a mouse or a touch event, so the
  // same resize logic below works with a finger as well as a cursor.
  const getPoint = (e) => {
    if (e.touches && e.touches[0]) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const startSidebarResize = (e) => {
    e.preventDefault();
    const { x } = getPoint(e);
    resizeStateRef.current = { type: 'sidebar', startX: x, startWidth: sidebarWidth };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', handleResizeMove, { passive: false });
    document.addEventListener('touchend', stopResize);
  };

  const startTerminalResize = (e) => {
    e.preventDefault();
    const { y } = getPoint(e);
    resizeStateRef.current = { type: 'terminal', startY: y, startHeight: terminalHeight };
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', handleResizeMove, { passive: false });
    document.addEventListener('touchend', stopResize);
  };

  const handleResizeMove = (e) => {
    const state = resizeStateRef.current;
    if (!state) return;
    // Dragging a touch point also scrolls the page by default — stop that
    // while a resize is in progress.
    if (e.touches) e.preventDefault();
    const { x, y } = getPoint(e);
    if (state.type === 'sidebar') {
      const next = state.startWidth + (x - state.startX);
      setSidebarWidth(Math.min(520, Math.max(180, next)));
    } else if (state.type === 'terminal') {
      const next = state.startHeight - (y - state.startY);
      const maxHeight = isMobile ? window.innerHeight * 0.6 : window.innerHeight * 0.75;
      setTerminalHeight(Math.min(maxHeight, Math.max(120, next)));
    }
  };

  const stopResize = () => {
    resizeStateRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchmove', handleResizeMove);
    document.removeEventListener('touchend', stopResize);
  };

  // ── Activity log helper ─────────────────────────────────────
  // Appends an event to the Activity tab. Capped at 200 entries so a
  // long session can't grow the array without bound.
  const pushActivity = useCallback((event) => {
    setActivityLog(prev => {
      const next = [
        ...prev,
        { ...event, id: `${Date.now()}-${Math.random()}`, at: Date.now() }
      ];
      return next.length > 200 ? next.slice(-200) : next;
    });
  }, []);

  // ── Debounced change tracking (Git Blame feature) ───────────
  // onDidChangeModelContent fires on every keystroke; these refs let us
  // collapse a burst of typing into one "change" activity entry.
  const changeDebounceRef = useRef(null);
  const lastChangeRef = useRef({ fromLine: 1, toLine: 1 });

  useEffect(() => {
    return () => {
      if (changeDebounceRef.current) clearTimeout(changeDebounceRef.current);
    };
  }, []);

  // ── Run History refresh key ─────────────────────────────────
  // RunHistoryPanel fetches its own data from /execute/history/:roomId.
  // Bumping this key remounts it so a finished run shows up immediately.
  const [historyVersion, setHistoryVersion] = useState(0);

  const handleHistoryRecord = useCallback(() => {
    setHistoryVersion(v => v + 1);
  }, []);

  /*
   * Code execution hook.
   *
   * Owns terminal state, the run button, and the handler for
   * EXECUTION_* messages arriving over the collaboration socket.
   */
  const {
    isRunning,
    showTerminal,
    setShowTerminal,
    terminalOutput,
    setTerminalOutput,
    execResult,
    activeTab,
    setActiveTab,
    previewContent,
    handleRunCode,
    handleExecutionMessage,
    clearTerminal
  } = useCodeExecution(roomId, handleHistoryRecord);

  /*
   * Handle messages received from collaboration WebSocket.
   *
   * Execution messages are forwarded to
   * handleExecutionMessage().
   */
  const handleCollabMessage = useCallback(
    (msg) => {
      handleExecutionMessage(msg);

      if (msg.messageType === 'JOIN') {
        pushActivity({
          type: 'join',
          user: getDisplay(msg.creator)
        });

      } else if (msg.messageType === 'LEFT') {
        pushActivity({
          type: 'leave',
          user: getDisplay(msg.creator)
        });
      }
    },
    [
      handleExecutionMessage,
      pushActivity
    ]
  );

  /*
   * Collaboration hook.
   *
   * sendExecutionInput:
   *     sends stdin to the running process
   *
   * stopExecution:
   *     stops the running process
   */
  const {
    members,
    connectionStatus,
    bindEditor,
    getAllFiles,
    getFileText,
    fileNames,
    createFile,
    createFolder,
    renameFile,
    renameFolder,
    deleteFile,
    deleteFolder,
    sendExecutionInput,
    stopExecution,
    chatMessages,
    sendChatMessage,
    deleteChatMessage,
    roomState,
    wasKicked,
    lockRoom,
    setReadOnlyMode,
    promoteToCoHost,
    demoteCoHost,
    kickMember,
    awareness
  } = useCollaboration(
    roomId,
    userEmail,
    token,
    handleCollabMessage
  );

  const isPrimaryHost = roomState.primaryHostEmail === userEmail;
  const isCoHost = (roomState.coHosts || []).some(e => e.toLowerCase() === (userEmail || '').toLowerCase());
  const isModerator = isPrimaryHost || isCoHost;

  // If the host kicks this user, disconnect and leave the room immediately.
  useEffect(() => {
    if (wasKicked) {
      toast.error('You were removed from this room by the host.');
      navigate('/dashboard');
    }
  }, [wasKicked, navigate, toast]);

  const [openTabs, setOpenTabs] = useState([
    {
      name: 'index.js',
      ext: 'js',
      modified: false
    }
  ]);

  const [activeFile, setActiveFile] =
    useState('index.js');

  const handleOpenFile = (name) => {
    if (!openTabs.find(t => t.name === name)) {
      setOpenTabs(prev => [
        ...prev,
        {
          name,
          ext: name.split('.').pop(),
          modified: false
        }
      ]);
    }

    setActiveFile(name);

    // Auto-detect language from file extension
    const ext = name.split('.').pop().toLowerCase();
    const langMap = {
      'js': 'javascript', 'jsx': 'javascript',
      'ts': 'typescript', 'tsx': 'typescript',
      'py': 'python',
      'java': 'java',
      'html': 'html', 'htm': 'html',
      'css': 'css', 'scss': 'scss', 'sass': 'scss',
      'json': 'json',
      'xml': 'xml',
      'yaml': 'yaml', 'yml': 'yaml',
      'md': 'markdown',
      'sql': 'sql',
      'cpp': 'cpp', 'c': 'c',
      'go': 'go',
      'rs': 'rust',
      'rb': 'ruby',
      'php': 'php',
      'sh': 'shell', 'bash': 'shell',
    };
    if (langMap[ext]) {
      setLanguage(langMap[ext]);
    }
  };

  const handleCloseTab = (e, name) => {
    e.stopPropagation();

    setOpenTabs(prev => {
      const newTabs =
        prev.filter(t => t.name !== name);

      if (activeFile === name) {
        if (newTabs.length > 0) {
          setActiveFile(
            newTabs[newTabs.length - 1].name
          );
        } else {
          setActiveFile(null);
        }
      }

      return newTabs;
    });
  };

  // Wrappers around the raw hook functions that also keep open tabs in sync
  // when the file underneath one happens to be renamed or deleted.
  const handleRenameFile = (oldPath, newPath) => {
    renameFile(oldPath, newPath);
    setOpenTabs(prev => prev.map(t => t.name === oldPath ? { ...t, name: newPath, ext: newPath.split('.').pop() } : t));
    if (activeFile === oldPath) setActiveFile(newPath);
  };

  const handleRenameFolder = (oldFolderPath, newFolderPath) => {
    renameFolder(oldFolderPath, newFolderPath);
    const prefix = `${oldFolderPath}/`;
    setOpenTabs(prev => prev.map(t =>
      t.name.startsWith(prefix)
        ? { ...t, name: newFolderPath + '/' + t.name.slice(prefix.length) }
        : t
    ));
    if (activeFile && activeFile.startsWith(prefix)) {
      setActiveFile(newFolderPath + '/' + activeFile.slice(prefix.length));
    }
  };

  const handleDeleteFile = async (path) => {
    const ok = await confirm(`Delete ${path}? This cannot be undone.`, { title: 'Delete file', danger: true });
    if (!ok) return;
    deleteFile(path);
    setOpenTabs(prev => prev.filter(t => t.name !== path));
    if (activeFile === path) setActiveFile(null);
    toast.success(`${path} deleted`);
  };

  const handleDeleteFolder = async (folderPath) => {
    const ok = await confirm(`Delete the folder "${folderPath}" and everything inside it? This cannot be undone.`, { title: 'Delete folder', danger: true });
    if (!ok) return;
    deleteFolder(folderPath);
    const prefix = `${folderPath}/`;
    setOpenTabs(prev => prev.filter(t => !t.name.startsWith(prefix)));
    if (activeFile && activeFile.startsWith(prefix)) setActiveFile(null);
    toast.success(`${folderPath} deleted`);
  };

  const monaco = useMonaco();

  // Force Monaco to re-layout when sidebar width changes
  useEffect(() => {
    const t = setTimeout(() => {
      editorRef.current?.getAction('editor.action.layout')?.run();
    }, 50);
    return () => clearTimeout(t);
  }, [sidebarWidth]);

  // Register all custom themes once Monaco is ready
  useEffect(() => {
    if (!monaco) return;

    Object.entries(CUSTOM_THEMES).forEach(
      ([id, def]) => {
        monaco.editor.defineTheme(id, def);
      }
    );

    // Apply current theme immediately after registration
    monaco.editor.setTheme(currentTheme);
  }, [monaco, currentTheme]);

  // Reactively apply theme whenever user switches it
  useEffect(() => {
    if (!monaco) return;

    monaco.editor.setTheme(currentTheme);
  }, [monaco, currentTheme]);

const activeFileRef = useRef(activeFile);

useEffect(() => {
    activeFileRef.current = activeFile;
}, [activeFile]);

  const handleEditorDidMount = (editor) => {
    editorRef.current = editor;
    setEditorInstance(editor);

    editor.onDidChangeModel(() => {
      bindEditor(
        editor,
        activeFileRef.current
      );
    });

    editor.onDidChangeCursorPosition((e) => {
      setEditorLine(e.position.lineNumber);
      setEditorCol(e.position.column);
    });

    // Debounced activity:
    // fires 1.5s after user STOPS typing
    editor.onDidChangeModelContent((e) => {
      if (e.changes.length === 0) return;

      const minLine = Math.min(
        ...e.changes.map(
          c => c.range.startLineNumber
        )
      );

      const maxLine = Math.max(
        ...e.changes.map(c =>
          c.range.endLineNumber +
          (c.text.split('\n').length - 1)
        )
      );

      // Clear previous debounce timer
      if (changeDebounceRef.current) {
        clearTimeout(
          changeDebounceRef.current
        );
      }

      // Store pending range
      lastChangeRef.current = {
        fromLine: minLine,
        toLine: Math.max(minLine, maxLine)
      };

      // Only push after 1500ms of no typing
      changeDebounceRef.current =
        setTimeout(() => {
          const {
            fromLine,
            toLine
          } = lastChangeRef.current;

          pushActivity({
            type: 'change',
            user: getDisplay(userEmail),
            fromLine,
            toLine
          });
        }, 1500);
    });

    bindEditor(
      editor,
      activeFileRef.current
    );
  };

  const applyTheme = (themeId) => {
    setCurrentTheme(themeId);
  };

  // const langExt = {
  //   javascript: 'js',
  //   java: 'java',
  //   html: 'html',
  //   css: 'css',
  //   python: 'py'
  // };

  const getLang = (filename) => {
    if (!filename) return 'plaintext';
    const ext = filename.split('.').pop().toLowerCase();
    const map = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', java: 'java', py: 'python', html: 'html', css: 'css', json: 'json', md: 'markdown', txt: 'plaintext' };
    return map[ext] || 'plaintext';
  };

  if (checkingAccess) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="vs-loader-sm border-t-indigo-500" />
      </div>
    );
  }

  if (roomAccessError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 px-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-2">Can't access this room</h2>
          <p className="text-sm text-zinc-500 mb-6 leading-relaxed">{roomAccessError}</p>
          <p className="text-xs text-zinc-600 mb-6">
            If this room is locked, ask the host or a coordinator to add you, or share a valid room code with you.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 rounded-lg bg-indigo-500 text-white text-sm font-semibold border-none cursor-pointer hover:bg-indigo-600"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden grid bg-zinc-950 relative"
      style={{
        gridTemplateColumns: isMobile
          // On mobile the sidebar is a fixed-position drawer, not a grid
          // column — it must never claim horizontal space here or the
          // editor would be squeezed even while the drawer is closed.
          ? '48px 0px 1fr'
          : `48px ${activeSidePanel ? sidebarWidth + 'px' : '0px'} 1fr`,

        gridTemplateRows: isMobile
          // 'auto' lets the header wrap onto a second line on narrow
          // screens instead of clipping the Run button off the edge.
          ? 'auto 1fr 22px'
          : '40px 1fr 22px',

        gridTemplateAreas: `
          "nav nav nav"
          "act side main"
          "status status status"
        `
      }}
    >

      {/* Sidebar resize handle — desktop only; the mobile drawer has a
          fixed width instead of a drag handle. */}
      {activeSidePanel && !isMobile && (
        <div
          onMouseDown={startSidebarResize}
          onTouchStart={startSidebarResize}
          className="absolute top-10 bottom-[22px] cursor-col-resize z-40 transition-colors group"
          style={{ left: 48 + sidebarWidth - 4, width: 8 }}
        >
          <div className="w-0.5 h-full bg-zinc-700/50 group-hover:bg-indigo-500/60 transition-colors" />
        </div>
      )}

      {/* ═══════════════════════════════════════
          TOP NAVBAR
      ═══════════════════════════════════════ */}
      <header
        className={`flex items-center bg-zinc-900 border-b border-zinc-800 z-30 select-none ${
          isMobile ? 'flex-wrap overflow-visible' : 'overflow-hidden'
        }`}
        style={{
          gridArea: 'nav'
        }}
      >

        {/* Brand icon */}
        <div className="w-12 shrink-0 h-full flex items-center justify-center border-r border-zinc-800">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
          >
            <rect
              x="3"
              y="3"
              width="8"
              height="8"
              rx="1.5"
              fill="#6366f1"
            />

            <rect
              x="13"
              y="3"
              width="8"
              height="8"
              rx="1.5"
              fill="#6366f1"
              opacity=".7"
            />

            <rect
              x="3"
              y="13"
              width="8"
              height="8"
              rx="1.5"
              fill="#6366f1"
              opacity=".7"
            />

            <rect
              x="13"
              y="13"
              width="8"
              height="8"
              rx="1.5"
              fill="#6366f1"
              opacity=".4"
            />
          </svg>
        </div>

        {/* Brand name */}
        <span className="px-3 text-[13px] font-bold text-zinc-300 shrink-0 tracking-tight">
          CBC
        </span>

        {/* File Tabs */}
        <div
          className={`flex items-stretch h-full overflow-x-auto border-l border-zinc-800 ${
            isMobile ? 'w-full order-3 basis-full' : 'flex-1 overflow-y-hidden'
          }`}
          style={{ scrollbarWidth: 'thin' }}
        >

          {openTabs.map((tab) => {
            const isActive =
              tab.name === activeFile;

            return (
              <div
                key={tab.name}
                onClick={() =>
                  setActiveFile(tab.name)
                }
                className={`group flex items-center gap-2 pl-4 pr-2 cursor-pointer shrink-0 border-r border-zinc-800 text-xs border-t-2 transition-colors ${
                  isActive
                    ? 'bg-zinc-950 text-zinc-100 border-indigo-500'
                    : 'bg-transparent text-zinc-500 border-transparent hover:bg-white/5'
                }`}
              >

                <span
                  className="text-[9px] font-bold px-1 py-0.5 rounded-[3px] shrink-0"
                  style={{
                    background:
                      EXT_COLOR[tab.ext] || '#555',

                    color:
                      tab.ext === 'js'
                        ? '#000'
                        : '#fff'
                  }}
                >
                  {tab.ext
                    ?.toUpperCase()
                    .slice(0, 2)}
                </span>

                {tab.name}

                {tab.modified ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mx-1.5" />
                ) : (
                  <button
                    onClick={(e) =>
                      handleCloseTab(
                        e,
                        tab.name
                      )
                    }
                    className={`ml-1 w-5 h-5 rounded flex items-center justify-center border-none bg-transparent cursor-pointer hover:bg-white/10 ${
                      isActive
                        ? 'text-zinc-300'
                        : 'text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity'
                    }`}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line
                        x1="18"
                        y1="6"
                        x2="6"
                        y2="18"
                      />

                      <line
                        x1="6"
                        y1="6"
                        x2="18"
                        y2="18"
                      />
                    </svg>
                  </button>
                )}

              </div>
            );
          })}

        </div>

        {/* Right side */}
        <div
          className={`flex items-center gap-2 px-3 h-full ${
            isMobile
              ? 'w-full order-2 basis-full flex-wrap py-1.5 gap-y-2'
              : 'gap-2.5 shrink-0'
          }`}
        >

          {/* Room badge — redundant with the sidebar's room-code panel on
              mobile, so it's dropped there to save space. */}
          {!isMobile && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 font-mono text-[11px] font-semibold text-cyan-400 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              Room: {roomCode || '------'}
            </div>
          )}

          {(roomState.locked || roomState.readOnly) && (
            <div className="flex items-center gap-1">
              {roomState.locked && (
                <span title="Room locked to new members" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] font-semibold text-zinc-400">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  {!isMobile && 'Locked'}
                </span>
              )}
              {roomState.readOnly && (
                <span title="Read-only mode is on" className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10px] font-semibold text-amber-400">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                  {!isMobile && 'Read-only'}
                </span>
              )}
            </div>
          )}

          {/* User avatars — on mobile just the current user plus a "+N"
              pill, so a busy room doesn't push the Run button off-screen. */}
          <div className="flex items-center">

            <div
              title={userEmail}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-zinc-900 -ml-1 shrink-0"
              style={{
                background: getColor(0)
              }}
            >
              {getShort(userEmail)}
            </div>

            {(() => {
              const others = members.filter(m => m !== userEmail);
              if (isMobile) {
                return others.length > 0 ? (
                  <div
                    title={others.join(', ')}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-zinc-300 bg-zinc-800 border-2 border-zinc-900 -ml-1 shrink-0"
                  >
                    +{others.length}
                  </div>
                ) : null;
              }
              return others.slice(0, 4).map((email, idx) => (
                <div
                  key={idx}
                  title={email}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-zinc-900 -ml-1 shrink-0"
                  style={{
                    background: getColor(idx + 1)
                  }}
                >
                  {getShort(email)}
                </div>
              ));
            })()}
          </div>

          {/* Language selector */}
          <select
            value={language}
            onChange={e =>
              setLanguage(e.target.value)
            }
            className={`bg-zinc-950 text-zinc-300 border border-zinc-800 rounded-md outline-none cursor-pointer ${
              isMobile ? 'px-2 py-2 text-sm flex-1 min-w-0' : 'px-2 py-1 text-xs'
            }`}
          >
            <option value="javascript">
              JavaScript
            </option>

            <option value="java">
              Java
            </option>

            <option value="html">
              HTML
            </option>

            <option value="css">
              CSS
            </option>

            <option value="python">
              Python
            </option>
          </select>

          {/* Run button */}
          <button
            onClick={() => {
              const currentCode =
                getAllFiles()[activeFile] || '';

              // handleRunCode always opens the Terminal — on mobile that
              // shares a slot with the History sheet, so close History
              // first rather than letting them overlap.
              if (isMobile) setShowHistory(false);

              handleRunCode(
                language,
                currentCode,
                getAllFiles(),
                activeFile
              );
            }}
            disabled={isRunning}
            className={`flex items-center justify-center gap-1.5 rounded-md border-none font-semibold shrink-0 ${
              isMobile ? 'px-4 py-2 text-sm' : 'px-3.5 py-1.5 text-xs'
            } ${
              isRunning
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600'
            }`}
          >
            {isRunning ? (
              <div className="vs-loader-sm border-t-zinc-500" />
            ) : (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}

            {isRunning
              ? 'Running…'
              : 'Run'}
          </button>

          {/* Stop button */}
          {isRunning && (
            <button
              onClick={stopExecution}
              className={`rounded-md bg-red-500 text-white font-semibold border-none cursor-pointer hover:bg-red-600 ${
                isMobile ? 'px-4 py-2 text-sm' : 'px-3 py-1.5 text-xs'
              }`}
            >
              Stop
            </button>
          )}

        </div>
      </header>

      {/* ═══════════════════════════════════════
          ACTIVITY BAR
      ═══════════════════════════════════════ */}
      <ActivityBar
        activeSidePanel={activeSidePanel}
        setActiveSidePanel={setActiveSidePanel}
        onSettingsClick={() =>
          setShowSettings(true)
        }
        showHistory={showHistory}
        setShowHistory={() => {
          setShowHistory(s => {
            const next = !s;
            // History and Terminal share the same bottom-sheet slot on
            // mobile — opening one should close the other.
            if (isMobile && next) setShowTerminal(false);
            return next;
          });
        }}
        isMobile={isMobile}
      />

      {/* ═══════════════════════════════════════
          SIDEBAR
      ═══════════════════════════════════════ */}
      {isMobile && activeSidePanel && (
        <div
          onClick={() => setActiveSidePanel(null)}
          className="bg-black/50"
          style={{ gridRow: '2', gridColumn: '1 / -1', zIndex: 45 }}
        />
      )}
      <div
        className={
          isMobile
            ? 'bg-zinc-950 border-r border-zinc-800 shadow-2xl transition-transform duration-200 ease-out overflow-hidden'
            : 'contents'
        }
        style={
          isMobile
            ? {
                // Placing this as a grid item in the content row (rather
                // than position:fixed with a hardcoded top offset) means
                // it always starts right below the header and ends right
                // above the status bar, however tall the header's wrapped
                // content ends up being on a given screen.
                gridRow: '2',
                gridColumn: '2 / -1',
                justifySelf: 'start',
                zIndex: 50,
                width: 'min(85vw, 320px)',
                transform: activeSidePanel
                  ? 'translateX(0)'
                  : 'translateX(-100%)'
              }
            : undefined
        }
      >
        <Sidebar
          roomName={roomName}
          roomCode={roomCode}
          members={members}
          userEmail={userEmail}
          activeSidePanel={activeSidePanel}
          onFileOpen={(name) => {
            handleOpenFile(name);
            // Closing the drawer after picking a file keeps the flow
            // familiar — tap a file, land straight in the editor —
            // instead of leaving the drawer open over the code.
            if (isMobile) setActiveSidePanel(null);
          }}
          fileNames={fileNames}
          onCreateFile={createFile}
          onCreateFolder={createFolder}
          onRenameFile={handleRenameFile}
          onRenameFolder={handleRenameFolder}
          onDeleteFile={handleDeleteFile}
          onDeleteFolder={handleDeleteFolder}
          getFileText={getFileText}
          getAllFiles={getAllFiles}
          roomState={roomState}
          isPrimaryHost={isPrimaryHost}
          isCoHost={isCoHost}
          isModerator={isModerator}
          onLockToggle={lockRoom}
          onReadOnlyToggle={setReadOnlyMode}
          onPromote={promoteToCoHost}
          onDemote={demoteCoHost}
          onKick={kickMember}
        />
      </div>

      {/* ═══════════════════════════════════════
          MAIN EDITOR AREA
      ═══════════════════════════════════════ */}
      <main
        className="flex flex-col overflow-hidden bg-zinc-950 relative"
        style={{
          gridArea: 'main'
        }}
      >
        {/* Providers — render silently */}
        <IntelliSenseProvider />
        <GitBlameProvider awareness={awareness} editor={editorInstance} />

        {/* Editor toolbar */}
        <div className="h-8 flex items-center justify-between px-3 bg-zinc-900 border-b border-zinc-800 shrink-0 gap-2">

          <div className="flex items-center gap-0.5 overflow-x-auto">

            {[['Undo', 'undo'], ['Redo', 'redo']].map(
              ([label, cmd]) => (
                <button
                  key={label}
                  onClick={() =>
                    editorRef.current?.trigger(
                      'toolbar',
                      cmd,
                      {}
                    )
                  }
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-transparent border-none cursor-pointer text-xs text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                >
                  {label}
                </button>
              )
            )}

            <div className="w-px h-4 bg-zinc-700 mx-1" />

            <button
              onClick={() =>
                setShowTerminal(s => {
                  const next = !s;
                  if (isMobile && next) setShowHistory(false);
                  return next;
                })
              }
              className={`flex items-center gap-1 px-2 py-0.5 rounded bg-transparent border-none cursor-pointer text-xs hover:bg-white/10 ${
                showTerminal
                  ? 'text-indigo-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Panel
            </button>

            <div className="w-px h-4 bg-zinc-700 mx-1" />

            <button
              onClick={() => {
                if (isSplit) {
                  setIsSplit(false);
                  setIsDiffMode(false);
                } else {
                  setIsSplit(true);
                  setIsDiffMode(false);
                  setSplitFile(activeFile);
                }
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded bg-transparent border-none cursor-pointer text-xs hover:bg-white/10 ${
                isSplit
                  ? 'text-indigo-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
              Split
            </button>

            <button
              onClick={() => {
                if (isDiffMode) {
                  setIsDiffMode(false);
                } else {
                  setIsDiffMode(true);
                  setIsSplit(false);
                  if (!diffFile || diffFile === activeFile) {
                    // Pick the first file that isn't the active file
                    const alternatives = fileNames.filter(f => f !== activeFile);
                    setDiffFile(alternatives.length > 0 ? alternatives[0] : activeFile);
                  }
                }
              }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded bg-transparent border-none cursor-pointer text-xs hover:bg-white/10 ${
                isDiffMode
                  ? 'text-indigo-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22V8"/><path d="M20 16l-4-4 4-4"/><path d="M4 8l4 4-4 4"/></svg>
              Diff
            </button>

            {isSplit && (
              <select
                value={splitFile}
                onChange={(e) => setSplitFile(e.target.value)}
                className="bg-zinc-800 text-zinc-300 text-xs border border-zinc-700 rounded px-1.5 py-0.5 outline-none cursor-pointer ml-1"
              >
                {fileNames.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}

            {isDiffMode && (
              <select
                value={diffFile}
                onChange={(e) => setDiffFile(e.target.value)}
                className="bg-zinc-800 text-zinc-300 text-xs border border-zinc-700 rounded px-1.5 py-0.5 outline-none cursor-pointer ml-1"
              >
                {fileNames.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            )}
          </div>

          {!isMobile && (
            <span className="text-[11px] text-zinc-500 shrink-0">
              Spaces: 4
            </span>
          )}

        </div>

        {/* Editor area — single, split, or diff */}
        <div className="flex-1 min-h-0 relative">

          {activeFile ? (
            <>
              {/* ═══ SPLIT VIEW ═══ */}
              {isSplit && (
                <div className={`flex h-full ${isMobile ? 'flex-col' : ''}`}>
                  {/* Left/top editor — active file */}
                  <div className={`flex-1 h-full min-h-0 ${isMobile ? 'border-b' : 'border-r'} border-zinc-800`}>
                    <div className="h-7 flex items-center px-3 bg-zinc-800/50 border-b border-zinc-700/50 shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="text-[11px] text-zinc-400 ml-2 truncate">{activeFile}</span>
                    </div>
                    <MonacoEditor
                      height="calc(100% - 28px)"
                      language={language}
                      path={activeFile}
                      onMount={(editor) => {
                        handleEditorDidMount(editor);
                      }}
                      options={{
                        selectOnLineNumbers: true,
                        automaticLayout: true,
                        fontSize,
                        minimap: { enabled: showMinimap && !isMobile },
                        cursorBlinking: 'smooth',
                        smoothScrolling: smoothScroll,
                        wordWrap,
                        fontFamily: "'Fira Code', Consolas, monospace",
                        fontLigatures: true,
                        renderLineHighlight: 'all',
                        lineNumbers: 'on',
                        readOnly: roomState.readOnly && !isModerator,
                        padding: { top: 12 },
                        scrollBeyondLastLine: false
                      }}
                    />
                  </div>

                  {/* Divider */}
                  <div className={`bg-zinc-800 hover:bg-indigo-500/40 shrink-0 transition-colors ${
                    isMobile ? 'h-1 w-full cursor-row-resize' : 'w-1 cursor-col-resize'
                  }`} />

                  {/* Right/bottom editor — split file */}
                  <div className="flex-1 h-full min-h-0">
                    <div className="h-7 flex items-center px-3 bg-zinc-800/50 border-b border-zinc-700/50 shrink-0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span className="text-[11px] text-zinc-400 ml-2 truncate">{splitFile}</span>
                    </div>
                    <MonacoEditor
                      height="calc(100% - 28px)"
                      language={getLang(splitFile)}
                      path={splitFile}
                      onMount={(editor) => {
                        const monacoBinding = new MonacoBinding(
                          getFileText(splitFile),
                          editor.getModel(),
                          new Set([editor]),
                          awarenessRef.current
                        );
                        splitBindingRef.current = monacoBinding;
                      }}
                      options={{
                        selectOnLineNumbers: true,
                        automaticLayout: true,
                        fontSize,
                        minimap: { enabled: showMinimap && !isMobile },
                        cursorBlinking: 'smooth',
                        smoothScrolling: smoothScroll,
                        wordWrap,
                        fontFamily: "'Fira Code', Consolas, monospace",
                        fontLigatures: true,
                        renderLineHighlight: 'all',
                        lineNumbers: 'on',
                        readOnly: roomState.readOnly && !isModerator,
                        padding: { top: 12 },
                        scrollBeyondLastLine: false
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ═══ DIFF VIEW ═══ */}
              {isDiffMode && (
                <div className="h-full">
                  <div className="h-7 flex items-center px-3 bg-zinc-800/50 border-b border-zinc-700/50 shrink-0">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span className="text-[11px] text-zinc-400 ml-2">
                      Diff: <span className="text-emerald-400 font-medium">{activeFile}</span>
                      <span className="text-zinc-500 mx-2">vs</span>
                      <span className="text-amber-400 font-medium">{diffFile}</span>
                    </span>
                    <div className="ml-auto flex items-center gap-3 text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Added</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Removed</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Modified</span>
                    </div>
                  </div>
                  <DiffEditor
                    height="calc(100% - 28px)"
                    language={getLang(activeFile)}
                    original={getAllFiles()[activeFile] || ''}
                    modified={getAllFiles()[diffFile] || ''}
                    options={{
                      readOnly: true,
                      automaticLayout: true,
                      fontSize,
                      minimap: { enabled: showMinimap && !isMobile },
                      fontFamily: "'Fira Code', Consolas, monospace",
                      fontLigatures: true,
                      renderSideBySide: !isMobile,
                      scrollBeyondLastLine: false,
                      overviewRulerBorder: false,
                      hideCursorInOverviewRuler: true,
                      overviewRulerLanes: 0,
                      lineNumbersMinChars: 3,
                      renderIndicators: true,
                      ignoreTrimWhitespace: false,
                      enableSplitViewResizing: true
                    }}
                  />
                </div>
              )}

              {/* ═══ SINGLE EDITOR ═══ */}
              {!isSplit && !isDiffMode && (
                <MonacoEditor
                  height="100%"
                  language={language}
                  path={activeFile}
                  onMount={handleEditorDidMount}
                  options={{
                    selectOnLineNumbers: true,
                    automaticLayout: true,
                    fontSize: isMobile ? Math.max(fontSize, 15) : fontSize,
                    minimap: {
                      enabled: showMinimap && !isMobile
                    },
                    cursorBlinking: 'smooth',
                    smoothScrolling: smoothScroll,
                    // Horizontal scrolling to read a line of code is
                    // painful on a phone — wrap regardless of the saved
                    // desktop preference.
                    wordWrap: isMobile ? 'on' : wordWrap,
                    fontFamily:
                      "'Fira Code', Consolas, monospace",
                    fontLigatures: true,
                    renderLineHighlight: 'all',
                    lineNumbers: 'on',
                    // Required for GitBlameProvider's collaborator markers
                    glyphMargin: true,
                    readOnly: roomState.readOnly && !isModerator,
                    padding: {
                      top: 12
                    }
                  }}
                />
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 bg-zinc-950">

              <svg
                width="64"
                height="64"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-4 opacity-20"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />

                <polyline points="14 2 14 8 20 8" />

                <line
                  x1="16"
                  y1="13"
                  x2="8"
                  y2="13"
                />

                <line
                  x1="16"
                  y1="17"
                  x2="8"
                  y2="17"
                />

                <polyline points="10 9 9 9 8 9" />
              </svg>

              <p className="text-sm">
                Select a file to edit
              </p>

            </div>
          )}

        </div>

        {/* ═══════════════════════════════════════
            RUN HISTORY PANEL
        ═══════════════════════════════════════ */}
        {showHistory && !isMobile && (
          <div className="shrink-0 border-t border-zinc-800" style={{ height: 200 }}>
            <RunHistoryPanel
              key={historyVersion}
              roomId={roomId}
              onClose={() => setShowHistory(false)}
            />
          </div>
        )}

        {/* ═══════════════════════════════════════
            TERMINAL / OUTPUT PANEL
        ═══════════════════════════════════════ */}
        {showTerminal && !isMobile && (
          <>
            <div
              onMouseDown={startTerminalResize}
              onTouchStart={startTerminalResize}
              className="h-1.5 cursor-row-resize hover:bg-indigo-500/40 transition-colors shrink-0"
            />
            <Terminal
              height={terminalHeight}
              language={language}
              isRunning={isRunning}
              terminalOutput={terminalOutput}
              setTerminalOutput={setTerminalOutput}
              execResult={execResult}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              previewContent={previewContent}
              clearTerminal={clearTerminal}
              setShowTerminal={setShowTerminal}
              activityLog={activityLog}
              sendExecutionInput={sendExecutionInput}
              chatMessages={chatMessages}
              sendChatMessage={sendChatMessage}
              deleteChatMessage={deleteChatMessage}
              isModerator={isModerator}
              userEmail={userEmail}
            />
          </>
        )}

      </main>

      {/* ═══════════════════════════════════════
          RUN HISTORY PANEL (mobile bottom sheet)
          Same top-level-grid-item overlay pattern as the mobile
          Terminal below — mutually exclusive with it via the effects
          near the top of the component, so they never fight for the
          same slot.
      ═══════════════════════════════════════ */}
      {isMobile && showHistory && (
        <>
          <div
            onClick={() => setShowHistory(false)}
            className="bg-black/50"
            style={{ gridRow: '2', gridColumn: '1 / -1', zIndex: 45 }}
          />
          <div
            className="flex flex-col bg-zinc-900 shadow-2xl overflow-hidden"
            style={{
              gridRow: '2',
              gridColumn: '1 / -1',
              alignSelf: 'end',
              zIndex: 50,
              height: Math.min(420, Math.round(window.innerHeight * 0.55))
            }}
          >
            <RunHistoryPanel
              key={historyVersion}
              roomId={roomId}
              onClose={() => setShowHistory(false)}
            />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          TERMINAL / OUTPUT PANEL (mobile bottom sheet)
          Rendered as a top-level grid item — not nested inside <main> —
          so it can overlay the whole content row instead of squeezing
          the editor down to an unusable height on a small screen.
      ═══════════════════════════════════════ */}
      {isMobile && showTerminal && (
        <>
          <div
            onClick={() => setShowTerminal(false)}
            className="bg-black/50"
            style={{ gridRow: '2', gridColumn: '1 / -1', zIndex: 45 }}
          />
          <div
            className="flex flex-col bg-zinc-950 shadow-2xl overflow-hidden"
            style={{
              gridRow: '2',
              gridColumn: '1 / -1',
              alignSelf: 'end',
              zIndex: 50
            }}
          >
            {/* Wider, touch-friendly drag handle with a visible grip */}
            <div
              onMouseDown={startTerminalResize}
              onTouchStart={startTerminalResize}
              className="h-4 cursor-row-resize hover:bg-indigo-500/40 transition-colors shrink-0 flex items-center justify-center"
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>
            <Terminal
              height={Math.min(terminalHeight, Math.round(window.innerHeight * 0.6))}
              language={language}
              isRunning={isRunning}
              terminalOutput={terminalOutput}
              setTerminalOutput={setTerminalOutput}
              execResult={execResult}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              previewContent={previewContent}
              clearTerminal={clearTerminal}
              setShowTerminal={setShowTerminal}
              activityLog={activityLog}
              sendExecutionInput={sendExecutionInput}
              chatMessages={chatMessages}
              sendChatMessage={sendChatMessage}
              deleteChatMessage={deleteChatMessage}
              isModerator={isModerator}
              userEmail={userEmail}
            />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          STATUS BAR
      ═══════════════════════════════════════ */}
      <div
        style={{
          gridArea: 'status'
        }}
      >
        <StatusBar
          connectionStatus={connectionStatus}
          roomCode={roomCode}
          editorLine={editorLine}
          editorCol={editorCol}
          language={language}
          isMobile={isMobile}
        />
      </div>

      {/* ═══════════════════════════════════════
          SETTINGS MODAL
      ═══════════════════════════════════════ */}
      {showSettings && (
        <SettingsModal
          onClose={() =>
            setShowSettings(false)
          }
          fontSize={fontSize}
          setFontSize={setFontSize}
          currentTheme={currentTheme}
          setTheme={applyTheme}
          showMinimap={showMinimap}
          setShowMinimap={setShowMinimap}
          wordWrap={wordWrap}
          setWordWrap={setWordWrap}
          smoothScroll={smoothScroll}
          setSmoothScroll={setSmoothScroll}
          editorRef={editorRef}
        />
      )}

    </div>
  );
};

export default Workspace;