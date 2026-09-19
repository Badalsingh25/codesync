import { useState } from 'react';
import { useToast } from '../../context/ToastContext.jsx';

const AVATAR_COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899'];
const getAvatarColor = (i) => AVATAR_COLORS[i % AVATAR_COLORS.length];
const getShort       = (email) => (email?.split('@')[0] || 'U').substring(0, 2).toUpperCase();
const getDisplay     = (email) => email?.split('@')[0] || email;

const Toggle = ({ checked, onChange, disabled, label, description }) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <div className="min-w-0">
      <div className="text-[11.5px] font-medium text-zinc-300">{label}</div>
      {description && <div className="text-[10px] text-zinc-500 mt-0.5">{description}</div>}
    </div>
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative w-9 h-5 rounded-full shrink-0 border-none cursor-pointer transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${checked ? 'bg-indigo-500' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  </div>
);

const Crown = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#f59e0b">
    <path d="M2 8l4 4 6-8 6 8 4-4-2 12H4L2 8z" />
  </svg>
);

const Star = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#a1a1aa">
    <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 6.9L12 17.3 5.7 20.8l1.7-6.9L2 9.2l7.1-.6z" />
  </svg>
);

const FileIcon = ({ name }) => {
  const ext = name.split('.').pop();
  const colors = { java:'#f89820', js:'#f7df1e', jsx:'#61dafb', ts:'#3178c6', xml:'#ef4444', css:'#38bdf8', html:'#e44d26' };
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 4px', borderRadius: 3, background: colors[ext] || '#555', color: ext === 'js' ? '#000' : '#fff', flexShrink: 0 }}>
      {ext?.toUpperCase().slice(0, 2)}
    </span>
  );
};

const Sidebar = ({
  roomName, roomCode, members = [], userEmail, activeSidePanel, onFileOpen, fileNames = [], onCreateFile, onCreateFolder,
  onRenameFile, onRenameFolder, onDeleteFile, onDeleteFolder,
  getFileText, getAllFiles,
  roomState = { primaryHostEmail: null, coHosts: [], locked: false, readOnly: false },
  isPrimaryHost = false, isCoHost = false, isModerator = false,
  onLockToggle, onReadOnlyToggle, onPromote, onDemote, onKick
}) => {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creatingType, setCreatingType] = useState('file'); // 'file' | 'folder'
  const [newFileName, setNewFileName] = useState('');
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'kick'|'transfer', email }
  const [busy, setBusy] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState(() => new Set());
  const [renamingPath, setRenamingPath] = useState(null); // { path, type, value }
  const [dragOverPath, setDragOverPath] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Build a real nested tree from the flat "path/to/file.js" keys.
  // "folder/.folder" marker keys let an empty folder exist and render
  // before any real file is added to it.
  const buildTree = (names) => {
    const root = { name: '', type: 'folder', path: '', children: {} };
    for (const path of names) {
      const isFolderMarker = path.endsWith('/.folder');
      const cleanPath = isFolderMarker ? path.slice(0, -'/.folder'.length) : path;
      const parts = cleanPath.split('/').filter(Boolean);
      let node = root;
      let currentPath = '';
      for (let i = 0; i < parts.length - (isFolderMarker ? 0 : 1); i++) {
        currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
        if (!node.children[parts[i]]) {
          node.children[parts[i]] = { name: parts[i], type: 'folder', path: currentPath, children: {} };
        }
        node = node.children[parts[i]];
      }
      if (!isFolderMarker) {
        const fileName = parts[parts.length - 1];
        node.children[fileName] = { name: fileName, type: 'file', path: cleanPath };
      }
    }
    return root;
  };

  const tree = buildTree(fileNames);

  const toggleFolder = (path) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };


  const copy = () => {
    navigator.clipboard.writeText(roomCode || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Two-click confirm pattern: first click arms it, second click (within 3s) executes.
  const handleConfirmable = (type, email, action) => {
    if (confirmAction && confirmAction.type === type && confirmAction.email === email) {
      setBusy(true);
      action(email)
        .catch(err => alert(err.response?.data?.message || err.message || 'Action failed'))
        .finally(() => { setBusy(false); setConfirmAction(null); });
    } else {
      setConfirmAction({ type, email });
      setTimeout(() => {
        setConfirmAction(curr => (curr && curr.type === type && curr.email === email ? null : curr));
      }, 3000);
    }
  };

  const handleCreateEntry = (e) => {
    if (e.key === 'Enter' && newFileName.trim()) {
      const name = newFileName.trim();

      if (creatingType === 'folder') {
        // The exact confusion from the bug report: naming a *folder* like
        // "abc.html" makes it look and behave like a file, but it's really
        // an empty folder you can never open — so we catch it here.
        const lastSegment = name.split('/').pop();
        if (/\.[A-Za-z0-9]{1,5}$/.test(lastSegment)) {
          toast.error(`"${lastSegment}" looks like a file name, not a folder. Use "New File" instead if you meant to create a file.`);
          return;
        }
        if (onCreateFolder) onCreateFolder(name);
      } else {
        const exists = fileNames.includes(name);
        if (exists) {
          toast.error(`A file named ${name} already exists.`);
          return;
        }
        if (onCreateFile) onCreateFile(name);
        if (onFileOpen) onFileOpen(name);
      }
      setIsCreating(false);
      setNewFileName('');
    } else if (e.key === 'Escape') {
      setIsCreating(false);
      setNewFileName('');
    }
  };

  const startCreating = (type) => {
    setCreatingType(type);
    setIsCreating(true);
  };

  const handleDownloadProject = async () => {
    try {
      const JSZipModule = await import('jszip');
      const JSZip = JSZipModule.default;
      const zip = new JSZip();
      const files = getAllFiles ? getAllFiles() : {};
      Object.entries(files).forEach(([path, content]) => zip.file(path, content));
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(roomName || 'project').replace(/\s+/g, '-')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Download failed — make sure the "jszip" package is installed (npm install jszip).');
      console.error(err);
    }
  };

  // Recursive tree node renderer — folders collapse/expand, files open on click.
  const submitRename = () => {
    if (!renamingPath) return;
    const { path, type, value } = renamingPath;
    const trimmed = value.trim();
    setRenamingPath(null);
    if (!trimmed || trimmed === path.split('/').pop()) return;

    const parentDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${trimmed}` : trimmed;

    if (type === 'folder') {
      if (onRenameFolder) onRenameFolder(path, newPath);
    } else {
      if (onRenameFile) onRenameFile(path, newPath);
    }
  };

  const handleDrop = (e, targetFolderPath) => {
    e.preventDefault();
    setDragOverPath(null);
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const { path: sourcePath, type: sourceType } = JSON.parse(raw);
    const baseName = sourcePath.split('/').pop();
    const newPath = targetFolderPath ? `${targetFolderPath}/${baseName}` : baseName;
    if (newPath === sourcePath) return;
    if (sourceType === 'folder') {
      if (onRenameFolder) onRenameFolder(sourcePath, newPath);
    } else {
      if (onRenameFile) onRenameFile(sourcePath, newPath);
    }
  };

  const renderNode = (node, depth = 0) => {
    const entries = Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries.map((child) => {
      const isRenaming = renamingPath?.path === child.path;

      if (child.type === 'folder') {
        const isExpanded = expandedFolders.has(child.path);
        return (
          <div key={child.path}>
            <div
              draggable={!isRenaming}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ path: child.path, type: 'folder' }))}
              onDragOver={(e) => { e.preventDefault(); setDragOverPath(child.path); }}
              onDragLeave={() => setDragOverPath(curr => curr === child.path ? null : curr)}
              onDrop={(e) => handleDrop(e, child.path)}
              onClick={() => !isRenaming && toggleFolder(child.path)}
              style={{ paddingLeft: 12 + depth * 14 }}
              className={`group flex items-center gap-1.5 pr-2 py-1 cursor-pointer text-[13px] text-zinc-300 transition-colors ${dragOverPath === child.path ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className={`text-zinc-500 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5" className="shrink-0">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              {isRenaming ? (
                <input
                  autoFocus
                  value={renamingPath.value}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenamingPath(p => ({ ...p, value: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingPath(null); }}
                  onBlur={submitRename}
                  className="flex-1 bg-zinc-900 text-white border border-indigo-500 px-1 text-xs outline-none min-w-0"
                />
              ) : (
                <span className="truncate flex-1">{child.name}</span>
              )}
              {!isRenaming && (
                <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                  <button
                    title="Rename"
                    onClick={(e) => { e.stopPropagation(); setRenamingPath({ path: child.path, type: 'folder', value: child.name }); }}
                    className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-zinc-500 hover:text-zinc-200 flex items-center justify-center"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
                  </button>
                  <button
                    title="Delete folder"
                    onClick={(e) => { e.stopPropagation(); if (onDeleteFolder) onDeleteFolder(child.path); }}
                    className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-zinc-500 hover:text-red-400 flex items-center justify-center"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
                  </button>
                </div>
              )}
            </div>
            {isExpanded && renderNode(child, depth + 1)}
          </div>
        );
      }
      return (
        <div
          key={child.path}
          draggable={!isRenaming}
          onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ path: child.path, type: 'file' }))}
          onClick={() => !isRenaming && onFileOpen && onFileOpen(child.path)}
          style={{ paddingLeft: 12 + depth * 14 + 16 }}
          className="group flex items-center gap-2 pr-2 py-1 cursor-pointer text-[13px] text-zinc-300 hover:bg-white/5 transition-colors"
        >
          <FileIcon name={child.name} />
          {isRenaming ? (
            <input
              autoFocus
              value={renamingPath.value}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRenamingPath(p => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenamingPath(null); }}
              onBlur={submitRename}
              className="flex-1 bg-zinc-900 text-white border border-indigo-500 px-1 text-xs outline-none min-w-0"
            />
          ) : (
            <span className="flex-1 truncate">{child.name}</span>
          )}
          {!isRenaming && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0">
              <button
                title="Rename"
                onClick={(e) => { e.stopPropagation(); setRenamingPath({ path: child.path, type: 'file', value: child.name }); }}
                className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-zinc-500 hover:text-zinc-200 flex items-center justify-center"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>
              </button>
              <button
                title="Delete file"
                onClick={(e) => { e.stopPropagation(); if (onDeleteFile) onDeleteFile(child.path); }}
                className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-zinc-500 hover:text-red-400 flex items-center justify-center"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
              </button>
            </div>
          )}
        </div>
      );
    });
  };

  // Search: matches filenames and file content, case-insensitive.
  const searchResults = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || !getFileText) return [];
    const results = [];
    const seenFolders = new Set();

    for (const name of fileNames) {
      if (name.endsWith('/.folder')) {
        const folderPath = name.slice(0, -'/.folder'.length);
        const folderName = folderPath.split('/').pop();
        if (folderName.toLowerCase().includes(q) && !seenFolders.has(folderPath)) {
          seenFolders.add(folderPath);
          results.push({ type: 'folder', name: folderPath, snippet: null, line: null });
        }
        continue;
      }
      const content = getFileText(name).toString();
      const nameMatches = name.toLowerCase().includes(q);
      const lines = content.split('\n');
      const matchingLineIdx = lines.findIndex(l => l.toLowerCase().includes(q));
      if (nameMatches || matchingLineIdx !== -1) {
        results.push({
          type: 'file',
          name,
          snippet: matchingLineIdx !== -1 ? lines[matchingLineIdx].trim().slice(0, 80) : null,
          line: matchingLineIdx !== -1 ? matchingLineIdx + 1 : null,
        });
      }
    }
    return results;
  })();

  // const revealInTree = (path) => {
  //   // Expand every ancestor folder so the item is actually visible, then
  //   // switch to the Explorer panel — matches how VS Code's search "reveal" works.
  //   const parts = path.split('/');
  //   setExpandedFolders(prev => {
  //     const next = new Set(prev);
  //     let current = '';
  //     for (let i = 0; i < parts.length - 1; i++) {
  //       current = current ? `${current}/${parts[i]}` : parts[i];
  //       next.add(current);
  //     }
  //     return next;
  //   });
  // };

  if (!activeSidePanel) return null;

  const S = {
    root: "flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-hidden",
    panelHeader: "flex items-center justify-between px-4 h-9 shrink-0 border-b border-zinc-800",
    panelTitle: "text-[10px] font-bold uppercase tracking-widest text-zinc-400",
    scroll: "flex-1 overflow-y-auto",
    roomCodeBox: "border-t border-zinc-800 p-3 shrink-0",
    roomCodeInner: "flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg py-2 px-3",
  };

  return (
    <aside className={S.root} style={{ gridArea: 'side', width: '100%', height: '100%', minWidth: 0 }}>

      {/* ── FILES ── */}
      {activeSidePanel === 'files' && (
        <>
          <div className={S.panelHeader}>
            <span className={S.panelTitle}>Explorer</span>
            <div className="flex items-center gap-2">
              <button onClick={handleDownloadProject} title="Download project as .zip" className="bg-transparent border-none text-zinc-400 hover:text-white cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button onClick={() => startCreating('folder')} title="New Folder" className="bg-transparent border-none text-zinc-400 hover:text-white cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
              </button>
              <button onClick={() => startCreating('file')} title="New File" className="bg-transparent border-none text-zinc-400 hover:text-white cursor-pointer text-base leading-none">+</button>
            </div>
          </div>
          <div
            className={S.scroll}
            onDragOver={(e) => { e.preventDefault(); setDragOverPath(''); }}
            onDragLeave={() => setDragOverPath(curr => curr === '' ? null : curr)}
            onDrop={(e) => { if (e.target === e.currentTarget) handleDrop(e, ''); }}
          >
            <div className="pt-1.5 pb-0.5 px-3 text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">
              {roomName || 'Workspace'}
            </div>
            <div className={`min-h-[40px] ${dragOverPath === '' ? 'bg-indigo-500/10' : ''}`}>
                {renderNode(tree, 0)}
                {isCreating && (
                  <div style={{ paddingLeft: 12 }} className="pr-3 py-1">
                    <input
                      autoFocus
                      type="text"
                      value={newFileName}
                      onChange={e => setNewFileName(e.target.value)}
                      onKeyDown={handleCreateEntry}
                      onBlur={() => { setIsCreating(false); setNewFileName(''); }}
                      placeholder={creatingType === 'folder' ? 'folderName' : 'FileName.java'}
                      className="w-full bg-zinc-900 text-white border border-indigo-500 px-1.5 py-0.5 text-xs outline-none"
                    />
                  </div>
                )}
            </div>
          </div>
          <div className={S.roomCodeBox}>
            <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1.5">Room Code</div>
            <div className={S.roomCodeInner}>
              <span className="font-mono text-[13px] font-semibold flex-1 text-cyan-400">{roomCode || '------'}</span>
              <button onClick={copy} className={`bg-transparent border-none cursor-pointer text-[11px] font-semibold ${copied ? 'text-emerald-500' : 'text-indigo-500'}`}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── SEARCH ── */}
      {activeSidePanel === 'search' && (
        <>
          <div className={S.panelHeader}>
            <span className={S.panelTitle}>Search</span>
          </div>
          <div className="p-3">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search in workspace…"
              autoFocus
              className="w-full px-3 py-2 bg-zinc-900 text-zinc-300 border border-zinc-800 rounded-lg text-xs outline-none box-border"
            />
            {!searchQuery.trim() && (
              <p className="text-[11px] text-zinc-500 mt-3 text-center">Type to search across files</p>
            )}
            {searchQuery.trim() && searchResults.length === 0 && (
              <p className="text-[11px] text-zinc-500 mt-3 text-center">No matches found</p>
            )}
          </div>
          {searchQuery.trim() && searchResults.length > 0 && (
            <div className={`${S.scroll} px-1`}>
              {searchResults.map((r, idx) => (
                <div
                  key={idx}
                  onClick={() => onFileOpen && onFileOpen(r.name)}
                  className="px-2.5 py-2 rounded-lg mb-1 cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <FileIcon name={r.name} />
                    <span className="text-xs font-semibold text-zinc-300 truncate">{r.name}</span>
                  </div>
                  {r.snippet && (
                    <div className="text-[11px] text-zinc-500 font-mono pl-1 truncate">
                      L{r.line}: {r.snippet}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── USERS ── */}
      {activeSidePanel === 'users' && (
        <>
          <div className={S.panelHeader}>
            <span className={S.panelTitle}>Collaborators</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500 text-white">
              {members.length + 1}
            </span>
          </div>

          <div className={`${S.scroll} p-2`}>

            {/* Moderator control card — host or co-host */}
            {isModerator && (
              <div className="mb-3 rounded-lg border border-indigo-500/30 bg-indigo-500/[0.06] px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">
                  {isPrimaryHost ? <Crown size={11} /> : <Star size={11} />}
                  {isPrimaryHost ? 'Host controls' : 'Co-host controls'}
                </div>
                <Toggle
                  label="Lock room"
                  description="Block new members from joining"
                  checked={roomState.locked}
                  onChange={onLockToggle}
                />
                <div className="h-px bg-zinc-800 my-0.5" />
                <Toggle
                  label="Read-only mode"
                  description="Only host & co-hosts can edit"
                  checked={roomState.readOnly}
                  onChange={onReadOnlyToggle}
                />
              </div>
            )}

            {/* Status banners for regular members */}
            {!isModerator && roomState.readOnly && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 text-[10.5px] text-amber-400">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Read-only — only host & co-hosts can edit
              </div>
            )}
            {!isModerator && roomState.locked && (
              <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-zinc-800/60 border border-zinc-700 px-2.5 py-1.5 text-[10.5px] text-zinc-400">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Room is locked to new members
              </div>
            )}

            {/* Self */}
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-1 bg-indigo-500/10 border-l-2 border-indigo-500">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: getAvatarColor(0) }}>
                {getShort(userEmail)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-zinc-300 truncate">{getDisplay(userEmail)}</span>
                  {isPrimaryHost && <Crown />}
                  {isCoHost && <Star />}
                </div>
                <div className="text-[10px] text-indigo-500">
                  you {isPrimaryHost ? '· host' : isCoHost ? '· co-host' : '· member'}
                </div>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            </div>

            {/* Others */}
            {members.filter(m => m !== userEmail).map((em, idx) => {
              const theyAreHost = em === roomState.primaryHostEmail;
              const theyAreCoHost = (roomState.coHosts || []).some(e => e.toLowerCase() === em.toLowerCase());
              const kickPending = confirmAction?.type === 'kick' && confirmAction?.email === em;
              const promotePending = confirmAction?.type === 'promote' && confirmAction?.email === em;
              const demotePending = confirmAction?.type === 'demote' && confirmAction?.email === em;

              // Kick rule mirrored client-side for a clean UI (server enforces
              // the real rule): a co-host may only kick regular members.
              const canKick = isModerator && !theyAreHost && (isPrimaryHost || !theyAreCoHost);

              return (
                <div key={idx} className="group flex items-center gap-2.5 px-2.5 py-2 rounded-lg mb-1 hover:bg-white/5 transition-colors">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style={{ background: getAvatarColor(idx + 1) }}>
                    {getShort(em)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-zinc-300 truncate">{getDisplay(em)}</span>
                      {theyAreHost && <Crown />}
                      {theyAreCoHost && !theyAreHost && <Star />}
                    </div>
                    <div className="text-[10px] text-emerald-500">
                      {theyAreHost ? 'Host' : theyAreCoHost ? 'Co-host' : 'Member · Online'}
                    </div>
                  </div>

                  <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                    {/* Only the primary host manages co-host status */}
                    {isPrimaryHost && !theyAreHost && !theyAreCoHost && (
                      <button
                        title="Promote to co-host"
                        disabled={busy}
                        onClick={() => handleConfirmable('promote', em, onPromote)}
                        className={`w-6 h-6 rounded flex items-center justify-center border-none cursor-pointer transition-colors ${promotePending ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`}
                      >
                        <Star size={11} />
                      </button>
                    )}
                    {isPrimaryHost && theyAreCoHost && (
                      <button
                        title="Remove co-host status"
                        disabled={busy}
                        onClick={() => handleConfirmable('demote', em, onDemote)}
                        className={`w-6 h-6 rounded flex items-center justify-center border-none cursor-pointer transition-colors ${demotePending ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-amber-400'}`}
                      >
                        <Star size={11} />
                      </button>
                    )}
                    {canKick && (
                      <button
                        title="Kick from room"
                        disabled={busy}
                        onClick={() => handleConfirmable('kick', em, onKick)}
                        className={`w-6 h-6 rounded flex items-center justify-center border-none cursor-pointer text-[13px] leading-none transition-colors ${kickPending ? 'bg-red-500 text-white' : 'bg-zinc-800 text-zinc-400 hover:text-red-400'}`}
                      >
                        {kickPending ? '✓' : '✕'}
                      </button>
                    )}
                  </div>
                  {!isModerator && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                </div>
              );
            })}
          </div>

          <div className={S.roomCodeBox}>
            <div className="text-[10px] text-zinc-400 uppercase tracking-widest mb-1.5">Room Code</div>
            <div className={S.roomCodeInner}>
              <span className="font-mono text-[13px] font-semibold flex-1 text-cyan-400">{roomCode || '------'}</span>
              <button onClick={copy} className={`bg-transparent border-none cursor-pointer text-[11px] font-semibold ${copied ? 'text-emerald-500' : 'text-indigo-500'}`}>
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
};

export default Sidebar;