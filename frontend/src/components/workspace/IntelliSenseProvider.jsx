import { useCallback, useEffect, useRef } from 'react';
import { useMonaco } from '@monaco-editor/react';

/**
 * IntelliSenseProvider — registers rich code completions for
 * JavaScript, Java, and Python directly inside Monaco.
 *
 * Features:
 * - Language-specific code snippets (for, if, class, function, etc.)
 * - Word-based completions from the current document
 * - Auto-closing brackets, quotes, and tags
 * - Bracket colorization and matching
 * - Parameter hints on function calls
 *
 * Works entirely client-side — no external LSP required.
 */
const IntelliSenseProvider = () => {
  const monaco = useMonaco();
  const registeredRef = useRef(false);
  // Every registerCompletionItemProvider call returns a disposable. We keep
  // them so remounting the workspace doesn't stack duplicate providers,
  // which showed every suggestion twice, three times, four times...
  const disposablesRef = useRef([]);

  const registerFeatures = useCallback(() => {
    if (!monaco || registeredRef.current) return;

    // ── Snippet definitions ──────────────────────────────────
    const snippets = {
      javascript: [
        { label: 'for',     detail: 'for loop',           insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:arr}.length; ${1:i}++) {\n\t$0\n}' },
        { label: 'for..of', detail: 'for..of loop',        insertText: 'for (const ${1:item} of ${2:iterable}) {\n\t$0\n}' },
        { label: 'for..in', detail: 'for..in loop',        insertText: 'for (const ${1:key} in ${2:obj}) {\n\t$0\n}' },
        { label: 'if',      detail: 'if statement',        insertText: 'if (${1:condition}) {\n\t$0\n}' },
        { label: 'if..else',detail: 'if..else',            insertText: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}' },
        { label: 'while',   detail: 'while loop',          insertText: 'while (${1:condition}) {\n\t$0\n}' },
        { label: 'do..while',detail:'do..while loop',      insertText: 'do {\n\t$0\n} while (${1:condition});' },
        { label: 'fn',      detail: 'arrow function',      insertText: 'const ${1:name} = (${2:params}) => {\n\t$0\n}' },
        { label: 'function',detail: 'function',            insertText: 'function ${1:name}(${2:params}) {\n\t$0\n}' },
        { label: 'class',   detail: 'class',               insertText: 'class ${1:Name} {\n\tconstructor(${2:params}) {\n\t\t$0\n\t}\n}' },
        { label: 'try/catch',detail:'try/catch',           insertText: 'try {\n\t$1\n} catch (${2:err}) {\n\t$0\n}' },
        { label: 'switch',  detail: 'switch statement',    insertText: 'switch (${1:expr}) {\n\tcase ${2:val}:\n\t\t$0\n\t\tbreak;\n\tdefault:\n\t\tbreak;\n}' },
        { label: 'log',     detail: 'console.log',         insertText: 'console.log($0)' },
        { label: 'logerr',  detail: 'console.error',       insertText: 'console.error($0)' },
        { label: 'logwarn', detail: 'console.warn',        insertText: 'console.warn($0)' },
        { label: 'settimeout', detail: 'setTimeout',       insertText: 'setTimeout(() => {\n\t$0\n}, ${1:1000});' },
        { label: 'setinterval', detail: 'setInterval',     insertText: 'setInterval(() => {\n\t$0\n}, ${1:1000});' },
        { label: 'promise', detail: 'Promise',             insertText: 'new Promise((resolve, reject) => {\n\t$0\n});' },
        { label: 'fetch',   detail: 'fetch API',           insertText: 'fetch(\'${1:url}\')\n\t.then(res => res.json())\n\t.then(data => {\n\t\t$0\n\t})\n\t.catch(err => console.error(err));' },
        { label: 'map',     detail: 'Array.map',           insertText: '.map((${1:item}) => {\n\t$0\n})' },
        { label: 'filter',  detail: 'Array.filter',        insertText: '.filter((${1:item}) => ${2:condition})' },
        { label: 'reduce',  detail: 'Array.reduce',        insertText: '.reduce((${1:acc}, ${2:item}) => {\n\t$0\n}, ${3:initial})' },
        { label: 'foreach', detail: 'Array.forEach',       insertText: '.forEach((${1:item}) => {\n\t$0\n});' },
        { label: 'find',    detail: 'Array.find',          insertText: '.find((${1:item}) => ${2:condition})' },
        { label: 'import',  detail: 'import module',       insertText: 'import { ${1:name} } from \'${2:module}\';' },
        { label: 'export',  detail: 'export',              insertText: 'export ${1:default} ${2:name};' },
        { label: 'async',   detail: 'async function',      insertText: 'async function ${1:name}(${2:params}) {\n\t$0\n}' },
        { label: 'await',   detail: 'await',               insertText: 'const result = await ${1:promise};' },
      ],
      java: [
        { label: 'sout',    detail: 'System.out.println',  insertText: 'System.out.println($0);' },
        { label: 'soutf',   detail: 'System.out.printf',   insertText: 'System.out.printf($0);' },
        { label: 'psvm',    detail: 'main method',         insertText: 'public static void main(String[] args) {\n\t$0\n}' },
        { label: 'for',     detail: 'for loop',            insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t$0\n}' },
        { label: 'for-each',detail: 'enhanced for',        insertText: 'for (${1:Type} ${2:item} : ${3:collection}) {\n\t$0\n}' },
        { label: 'while',   detail: 'while loop',          insertText: 'while (${1:condition}) {\n\t$0\n}' },
        { label: 'if',      detail: 'if statement',        insertText: 'if (${1:condition}) {\n\t$0\n}' },
        { label: 'if..else',detail: 'if..else',            insertText: 'if (${1:condition}) {\n\t$2\n} else {\n\t$0\n}' },
        { label: 'try/catch',detail:'try/catch',           insertText: 'try {\n\t$1\n} catch (${2:Exception} e) {\n\t$0\n}' },
        { label: 'class',   detail: 'class',               insertText: 'public class ${1:Name} {\n\t$0\n}' },
        { label: 'interface',detail:'interface',            insertText: 'public interface ${1:Name} {\n\t$0\n}' },
        { label: 'sop',     detail: 'System.out.print',    insertText: 'System.out.print($0);' },
        { label: 'serr',    detail: 'System.err.println',  insertText: 'System.err.println($0);' },
        { label: 'string',  detail: 'String declaration',  insertText: 'String ${1:name} = ${2:"value"};' },
        { label: 'arraylist',detail:'ArrayList',           insertText: 'ArrayList<${1:String}> ${2:list} = new ArrayList<>();' },
        { label: 'hashmap', detail: 'HashMap',             insertText: 'HashMap<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();' },
        { label: 'scanner', detail: 'Scanner input',       insertText: 'Scanner scanner = new Scanner(System.in);\n${1:String} input = scanner.nextLine();' },
        { label: 'public',  detail: 'public method',       insertText: 'public ${1:void} ${2:methodName}(${3:params}) {\n\t$0\n}' },
        { label: 'private', detail: 'private method',      insertText: 'private ${1:void} ${2:methodName}(${3:params}) {\n\t$0\n}' },
        { label: 'getset',  detail: 'getter/setter',       insertText: 'public ${1:String} get${2:Field}() {\n\treturn this.${2:field};\n}\n\npublic void set${2:Field}(${1:String} ${2:field}) {\n\tthis.${2:field} = ${2:field};\n}' },
        { label: 'switch',  detail: 'switch statement',    insertText: 'switch (${1:expr}) {\ncase ${2:val}:\n\t$0\n\tbreak;\ndefault:\n\tbreak;\n}' },
      ],
      python: [
        { label: 'print',   detail: 'print()',             insertText: 'print($0)' },
        { label: 'if',      detail: 'if statement',        insertText: 'if ${1:condition}:\n\t$0' },
        { label: 'if..else',detail: 'if..else',            insertText: 'if ${1:condition}:\n\t$2\nelse:\n\t$0' },
        { label: 'elif',    detail: 'elif',                insertText: 'elif ${1:condition}:\n\t$0' },
        { label: 'while',   detail: 'while loop',          insertText: 'while ${1:condition}:\n\t$0' },
        { label: 'for',     detail: 'for loop',            insertText: 'for ${1:item} in ${2:iterable}:\n\t$0' },
        { label: 'for..in', detail: 'range for loop',      insertText: 'for ${1:i} in range(${2:n}):\n\t$0' },
        { label: 'def',     detail: 'function',            insertText: 'def ${1:name}(${2:params}):\n\t$0' },
        { label: 'class',   detail: 'class',               insertText: 'class ${1:Name}:\n\tdef __init__(self${2:, params}):\n\t\t$0' },
        { label: 'try/except',detail:'try/except',         insertText: 'try:\n\t$1\nexcept ${2:Exception} as ${3:e}:\n\t$0' },
        { label: 'with',    detail: 'with statement',      insertText: 'with ${1:expr} as ${2:var}:\n\t$0' },
        { label: 'lambda',  detail: 'lambda',              insertText: 'lambda ${1:x}: $0' },
        { label: 'listcomp',detail: 'list comprehension',  insertText: '[${1:x} for ${2:x} in ${3:iterable}]' },
        { label: 'import',  detail: 'import module',       insertText: 'import ${1:module}' },
        { label: 'fromimport',detail:'from...import',      insertText: 'from ${1:module} import ${2:name}' },
        { label: 'async def',detail:'async function',      insertText: 'async def ${1:name}(${2:params}):\n\t$0' },
        { label: 'await',   detail: 'await',               insertText: 'result = await ${1:coroutine}' },
        { label: 'self',    detail: 'self parameter',      insertText: 'def __init__(self, ${1:params}):\n\t$0' },
        { label: 'main',    detail: 'main block',          insertText: 'if __name__ == "__main__":\n\t$0' },
      ],
      typescript: [
        { label: 'interface', detail: 'interface', insertText: 'interface ${1:Name} {\n\t$0\n}' },
        { label: 'type',      detail: 'type alias', insertText: 'type ${1:Name} = ${2:Type};' },
      ]
    };

    // ── Register snippet providers ───────────────────────────
    Object.entries(snippets).forEach(([lang, items]) => {
      const d = monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: (model, position) => {
          const wordInfo = model.getWordUntilPosition(position);
          const suggestions = items.map(s => ({
            label: s.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: s.detail,
            insertText: s.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: wordInfo.startColumn,
              endColumn: wordInfo.endColumn,
            },
          }));
          return { suggestions };
        }
      });
      disposablesRef.current.push(d);
    });

    // ── Word-based completions (suggest words from the document) ─
    ['javascript', 'java', 'python', 'typescript'].forEach(lang => {
      const d = monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: (model, position) => {
          const wordInfo = model.getWordUntilPosition(position);
          const word = wordInfo.word;
          if (!word || word.length < 2) return { suggestions: [] };

          const matches = [];
          const seen = new Set();
          const text = model.getValue();
          const regex = new RegExp(`\\b(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*)\\b`, 'gi');
          let m;

          while ((m = regex.exec(text)) !== null && matches.length < 20) {
            const match = m[1];
            if (match !== word && !seen.has(match)) {
              seen.add(match);
              matches.push({
                label: match,
                kind: monaco.languages.CompletionItemKind.Word,
                insertText: match,
                range: {
                  startLineNumber: position.lineNumber,
                  endLineNumber: position.lineNumber,
                  startColumn: wordInfo.startColumn,
                  endColumn: wordInfo.endColumn,
                },
              });
            }
          }
          return { suggestions: matches };
        }
      });
      disposablesRef.current.push(d);
    });

    // Auto-closing pairs, bracket matching and parameter hints are already
    // built into Monaco's bundled language configurations — nothing to
    // register here.

    registeredRef.current = true;
  }, [monaco]);

  useEffect(() => {
    if (monaco) registerFeatures();

    return () => {
      disposablesRef.current.forEach(d => {
        try { d.dispose(); } catch { /* already disposed */ }
      });
      disposablesRef.current = [];
      registeredRef.current = false;
    };
  }, [monaco, registerFeatures]);

  // This component renders nothing — it configures Monaco silently
  return null;
};

export default IntelliSenseProvider;
