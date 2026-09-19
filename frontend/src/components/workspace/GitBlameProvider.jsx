import { useCallback, useEffect, useRef } from 'react';
import { useMonaco } from '@monaco-editor/react';

/**
 * GitBlameProvider — shows colored dots in the glyph margin for each
 * remote collaborator's cursor position, using Yjs awareness data.
 *
 * Props:
 *   awareness — the Yjs Awareness instance (from useCollaboration)
 *   editor    — the Monaco editor instance (from handleEditorDidMount)
 */
const GitBlameProvider = ({ awareness, editor }) => {
  const monaco = useMonaco();
  const decorationsRef = useRef([]);

  const applyBlameDecorations = useCallback(() => {
    const ed = editor;
    if (!ed || !monaco || !awareness) return;
    if (!ed.getModel()) return;

    const states = awareness.getStates();
    const newDecs = [];

    states.forEach((state, clientId) => {
      if (!state || !state.user) return;
      if (clientId === awareness.clientID) return;

      // y-monaco writes the remote selection under `cursor`. Accept the
      // several shapes it can take so we stay compatible across versions.
      const cursor = state.cursor;
      if (!cursor) return;

      const line =
        typeof cursor === 'number'
          ? cursor
          : cursor.line ??
            cursor.lineNumber ??
            cursor.head?.lineNumber ??
            cursor.position?.lineNumber;

      if (!line || line < 1) return;

      const color = state.user.color || '#6366f1';
      const name = state.user.name || 'Unknown';

      newDecs.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: 'git-blame-glyph',
          glyphMarginHoverMessage: {
            value: `**${name}** · editing line ${line}`,
          },
          overviewRuler: {
            color,
            position: monaco.editor.OverviewRulerLane.Full,
          },
          stickiness:
            monaco.editor.TrackedRangeStickiness
              .NeverGrowsWhenTypingAtEdges,
        },
      });
    });

    decorationsRef.current = ed.deltaDecorations(
      decorationsRef.current,
      newDecs
    );
  }, [monaco, awareness, editor]);

  // Repaint whenever any peer's awareness state changes. Without this
  // subscription the decorations were computed once and never updated,
  // which is why no blame markers ever appeared.
  useEffect(() => {
    if (!awareness) return;
    const handler = () => applyBlameDecorations();
    awareness.on('change', handler);
    applyBlameDecorations();
    return () => awareness.off('change', handler);
  }, [awareness, applyBlameDecorations]);

  // Also repaint when the editor swaps model (switching files).
  useEffect(() => {
    if (!editor) return;
    const disposable = editor.onDidChangeModel(() =>
      applyBlameDecorations()
    );
    return () => disposable.dispose();
  }, [editor, applyBlameDecorations]);

  // Drop our decorations on unmount so they don't linger on the model.
  useEffect(() => {
    return () => {
      if (editor && decorationsRef.current.length) {
        try {
          editor.deltaDecorations(decorationsRef.current, []);
        } catch {
          // editor already disposed — nothing to clean up
        }
      }
    };
  }, [editor]);

  return null;
};

export default GitBlameProvider;
