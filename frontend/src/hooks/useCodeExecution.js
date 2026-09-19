import { useState, useRef } from 'react';
import { api } from '../context/AuthContext';

export const useCodeExecution = (roomId, historyHandler) => {
    const [isRunning, setIsRunning] = useState(false);
    const [showTerminal, setShowTerminal] = useState(false);

    // Streaming terminal output is now a string
    const [terminalOutput, setTerminalOutput] = useState('');
    const outputRef = useRef('');

    // Final execution information
    // { exitCode, executionTime, error }
    const [execResult, setExecResult] = useState(null);

    const [activeTab, setActiveTab] = useState('console');
    const [previewContent, setPreviewContent] = useState('');

    /*
     * Handle all execution messages coming from WebSocket.
     *
     * Message types:
     * EXECUTION_START
     * EXECUTION_OUTPUT
     * EXECUTION_END
     * EXECUTION_RESULT
     */
    const handleExecutionMessage = (msg) => {
        if (msg.messageType === 'EXECUTION_START') {
            setIsRunning(true);
            setShowTerminal(true);
            setActiveTab('console');
            outputRef.current = '';
            setTerminalOutput('');
            setExecResult(null);

        } else if (msg.messageType === 'EXECUTION_OUTPUT') {
            outputRef.current += msg.content;
            setTerminalOutput(prev => prev + msg.content);

        } else if (msg.messageType === 'EXECUTION_END') {
            setIsRunning(false);
            try {
                const { exitCode, executionTime } = JSON.parse(msg.content);
                setExecResult({ exitCode, executionTime, error: null });
                // Notify parent with history record
                if (historyHandler) {
                    historyHandler({
                        language: msg.language || 'unknown',
                        exitCode,
                        executionTimeMs: executionTime,
                        output: outputRef.current,
                        error: '',
                        executedAt: new Date().toISOString(),
                        executorEmail: msg.creator || ''
                    });
                }
            } catch {
                setExecResult({ exitCode: null, executionTime: null, error: 'Failed to parse exit info' });
            }

        } else if (msg.messageType === 'EXECUTION_RESULT') {
            setIsRunning(false);
            setShowTerminal(true);
            try {
                const result = JSON.parse(msg.content);
                const out = (result.stdout || '') + (result.stderr || '');
                setTerminalOutput(out);
                setExecResult({ exitCode: result.exitCode, executionTime: result.executionTime, error: null });
                if (historyHandler) {
                    historyHandler({
                        language: result.language || 'unknown',
                        exitCode: result.exitCode,
                        executionTimeMs: result.executionTime || 0,
                        output: out,
                        error: result.stderr || '',
                        executedAt: new Date().toISOString(),
                        executorEmail: msg.creator || ''
                    });
                }
            } catch {
                setExecResult({ exitCode: null, executionTime: null, error: 'Error parsing execution result: ' + msg.content });
            }
        }
    };

    /*
     * Run JavaScript locally inside a sandboxed iframe.
     */
    const runJavaScriptLocal = (code) => {
        const startTime = Date.now();

        const logs = [];
        const errors = [];

        const iframe = document.createElement('iframe');

        iframe.style.display = 'none';
        iframe.sandbox = 'allow-scripts';

        document.body.appendChild(iframe);

        const iframeSrc = `
            <!DOCTYPE html>
            <html>
            <body>
            <script>
                const customConsole = {

                    log: (...args) => {
                        const str = args
                            .map(a =>
                                typeof a === 'object'
                                    ? JSON.stringify(a)
                                    : String(a)
                            )
                            .join(' ');

                        window.parent.postMessage(
                            {
                                type: 'JS_CONSOLE_LOG',
                                data: str
                            },
                            '*'
                        );
                    },

                    error: (...args) => {
                        const str = args
                            .map(a =>
                                typeof a === 'object'
                                    ? JSON.stringify(a)
                                    : String(a)
                            )
                            .join(' ');

                        window.parent.postMessage(
                            {
                                type: 'JS_CONSOLE_ERROR',
                                data: str
                            },
                            '*'
                        );
                    }
                };

                window.console = {
                    ...window.console,
                    ...customConsole
                };

                window.onerror = (
                    message,
                    source,
                    lineno,
                    colno,
                    error
                ) => {

                    window.parent.postMessage(
                        {
                            type: 'JS_CONSOLE_ERROR',
                            data:
                                message +
                                " (Line " +
                                lineno +
                                ")"
                        },
                        '*'
                    );

                    return true;
                };

                window.onunhandledrejection = (event) => {
                    window.parent.postMessage(
                        {
                            type: 'JS_CONSOLE_ERROR',
                            data:
                                'Uncaught (in promise) ' +
                                (event.reason && event.reason.message
                                    ? event.reason.message
                                    : String(event.reason))
                        },
                        '*'
                    );
                };

                /*
                 * The run isn't actually finished just because the
                 * synchronous top-level code has returned — code like
                 * setTimeout(fn, 3000) schedules work that hasn't happened
                 * yet. Wrap setTimeout so we can count outstanding timers
                 * and only report JS_DONE once every one of them has
                 * fired (or the caller's own hard timeout cuts things off).
                 * setInterval is intentionally left unwrapped: a repeating
                 * timer is expected to keep running until the caller's
                 * hard timeout or an explicit clearInterval, not to block
                 * completion forever.
                 */
                const realSetTimeout = window.setTimeout;
                let pendingTimers = 0;
                let mainDone = false;

                window.setTimeout = function (fn, delay, ...args) {
                    pendingTimers++;
                    return realSetTimeout(function () {
                        try {
                            if (typeof fn === 'function') fn(...args);
                        } catch (e) {
                            window.parent.postMessage(
                                {
                                    type: 'JS_CONSOLE_ERROR',
                                    data: e.message
                                },
                                '*'
                            );
                        } finally {
                            pendingTimers--;
                            maybeSignalDone();
                        }
                    }, delay);
                };

                function maybeSignalDone() {
                    if (mainDone && pendingTimers <= 0) {
                        window.parent.postMessage(
                            {
                                type: 'JS_DONE'
                            },
                            '*'
                        );
                    }
                }

                try {
                    ${code}
                } catch (e) {

                    window.parent.postMessage(
                        {
                            type: 'JS_CONSOLE_ERROR',
                            data: e.message
                        },
                        '*'
                    );
                }

                // Deferred via the *real* setTimeout (not our wrapped one,
                // which would count against itself) so that any promise
                // .then()/async-await microtasks queued during the
                // synchronous run above get to execute first — the
                // browser always drains the microtask queue before
                // running the next macrotask.
                realSetTimeout(() => {
                    mainDone = true;
                    maybeSignalDone();
                }, 0);

            </script>
            </body>
            </html>
        `;

        let finished = false;

        const cleanup = () => {
            if (finished) return;

            finished = true;

            window.removeEventListener(
                'message',
                handleIframeMessage
            );

            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }

            // Convert local execution output to string
            setTerminalOutput(
                logs.join('\n') +
                (
                    errors.length
                        ? '\n' + errors.join('\n')
                        : ''
                )
            );

            // Store execution result separately
            setExecResult({
                exitCode: errors.length > 0 ? 1 : 0,
                executionTime: Date.now() - startTime,
                error: null
            });

            setIsRunning(false);
        };

        const handleIframeMessage = (event) => {
            if (event.data?.type === 'JS_CONSOLE_LOG') {

                logs.push(event.data.data);

            } else if (
                event.data?.type === 'JS_CONSOLE_ERROR'
            ) {

                errors.push(event.data.data);

            } else if (
                event.data?.type === 'JS_DONE'
            ) {

                setTimeout(cleanup, 100);
            }
        };

        window.addEventListener(
            'message',
            handleIframeMessage
        );

        iframe.srcdoc = iframeSrc;

        // 5 second timeout
        setTimeout(cleanup, 5000);
    };

    /*
     * Run HTML locally.
     */
    const runHtmlLocal = (code) => {
        setPreviewContent(code);
        setActiveTab('preview');

        setTerminalOutput('');
        setExecResult(null);

        setTimeout(() => {
            setIsRunning(false);
        }, 300);
    };

    /*
     * Run CSS locally.
     */
    const runCssLocal = (code) => {
        const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    ${code}
                </style>
            </head>

            <body
                style="
                    background:#1e1e1e;
                    color:#cccccc;
                    font-family:sans-serif;
                    padding:20px;
                "
            >

                <h1
                    style="
                        color:#ffffff;
                        border-bottom:1px solid #333;
                        padding-bottom:10px;
                    "
                >
                    CSS Preview Sandbox
                </h1>

                <p>
                    This paragraph is styled by the CSS
                    editor code above.
                </p>

                <div
                    class="box"
                    style="
                        margin:20px 0;
                        padding:15px;
                        border:1px dashed #666;
                        display:inline-block;
                    "
                >
                    Class:
                    <code style="color:#f89820">
                        .box
                    </code>
                </div>

                <br />

                <button
                    class="btn"
                    style="
                        padding:6px 12px;
                        cursor:pointer;
                    "
                >
                    Class:
                    <code style="color:#f89820">
                        .btn
                    </code>
                </button>

            </body>
            </html>
        `;

        setPreviewContent(fullHtml);
        setActiveTab('preview');

        setTerminalOutput('');
        setExecResult(null);

        setTimeout(() => {
            setIsRunning(false);
        }, 300);
    };

    /*
     * Main code execution function.
     */
    const handleRunCode = async (
        language,
        currentCode,
        files = {},
        activeFile = null
    ) => {
        setIsRunning(true);
        setShowTerminal(true);

        // Clear previous terminal result
        setTerminalOutput('');
        setExecResult(null);

        if (language === 'javascript') {

            setActiveTab('console');

            runJavaScriptLocal(currentCode);

        } else if (language === 'html') {

            runHtmlLocal(currentCode);

        } else if (language === 'css') {

            runCssLocal(currentCode);

        } else if (language === 'java' || language === 'python') {

            setActiveTab('console');

            try {
                await api.post(
                    '/execute/run',
                    {
                        files,
                        language,
                        roomId,
                        // Tells the backend which open file is the entry
                        // point. Without this it falls back to scanning
                        // every file in the room for a matching main
                        // method/class, which can run whichever file the
                        // scan happens to land on first — not the one
                        // that's actually open.
                        activeFile
                    }
                );

            } catch (err) {
                console.error(
                    'Code execution failed:',
                    err
                );

                const errorMessage =
                    err.response?.data?.message ||
                    err.message ||
                    'Unknown network error';

                setTerminalOutput('');

                setExecResult({
                    exitCode: null,
                    executionTime: null,
                    error:
                        `Network Error: ${errorMessage}`
                });

                setIsRunning(false);
            }

        } else {

            setIsRunning(false);
        }
    };

    /*
     * Clear terminal output and preview.
     */
    const clearTerminal = () => {
        setTerminalOutput('');
        setExecResult(null);
        setPreviewContent('');
    };

    return {
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
    };
};