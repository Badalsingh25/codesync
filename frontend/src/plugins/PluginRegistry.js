import { useCallback, useState } from 'react';

// ─── Plugin metadata ──────────────────────────────────────────
export const BUILTIN_PLUGINS = [
  {
    id: 'prettier',
    name: 'Prettier Formatter',
    description: 'Format code on save with Prettier rules',
    icon: '✨',
    category: 'formatter',
    languages: ['javascript', 'typescript', 'json', 'css', 'html'],
  },
  {
    id: 'eslint',
    name: 'JS Linter',
    description: 'Show inline warnings for JS/JSX issues',
    icon: '🔍',
    category: 'linter',
    languages: ['javascript', 'javascriptreact'],
  },
  {
    id: 'pylint',
    name: 'Python Linter',
    description: 'Inline diagnostics for Python code',
    icon: '🐍',
    category: 'linter',
    languages: ['python'],
  },
  {
    id: 'java-lint',
    name: 'Java Linter',
    description: 'Basic Java syntax and style checks',
    icon: '☕',
    category: 'linter',
    languages: ['java'],
  },
  {
    id: 'snippets-js',
    name: 'JS Snippets',
    description: 'Auto-complete snippets for common JS patterns',
    icon: '📝',
    category: 'snippets',
    languages: ['javascript', 'javascriptreact', 'typescript'],
  },
  {
    id: 'snippets-html',
    name: 'HTML Snippets',
    description: 'Auto-complete for HTML boilerplate and tags',
    icon: '🌐',
    category: 'snippets',
    languages: ['html'],
  },
  {
    id: 'bracket-colorize',
    name: 'Bracket Pair Colorizer',
    description: 'Color matching brackets for easier navigation',
    icon: '🌈',
    category: 'decoration',
    languages: ['*'],
  },
  {
    id: 'trailing-whitespace',
    name: 'Trailing Whitespace',
    description: 'Highlight and remove trailing whitespace on save',
    icon: '🧹',
    category: 'editor',
    languages: ['*'],
  },
];

const STORAGE_KEY = 'cbc_enabled_plugins';

const loadEnabled = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set(['prettier', 'eslint', 'pylint', 'snippets-js', 'bracket-colorize']);
};

const saveEnabled = (set) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
};

export const usePlugins = () => {
const [enabledIds, setEnabledIds] = useState(loadEnabled);
const [monacoInstance, setMonacoInstance] = useState(null);

  const toggle = useCallback((id) => {
    setEnabledIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveEnabled(next);
      return next;
    });
  }, []);

  const isEnabled = useCallback((id) => enabledIds.has(id), [enabledIds]);

  const activePlugins = useCallback((language) => {
    return BUILTIN_PLUGINS.filter(p => {
      if (!enabledIds.has(p.id)) return false;
      return p.languages.includes('*') || p.languages.includes(language);
    });
  }, [enabledIds]);

  const registerMonaco = useCallback((monaco) => {
    setMonacoInstance(monaco);
  }, []);

  return {
    plugins: BUILTIN_PLUGINS,
    enabledIds,
    toggle,
    isEnabled,
    activePlugins,
    registerMonaco,
    monacoInstance,
  };
};
