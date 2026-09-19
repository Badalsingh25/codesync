import { useEffect, useRef, useState, useCallback } from 'react';
import Stomp from 'stompjs';
import SockJS from 'sockjs-client';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import { MonacoBinding } from 'y-monaco';
import { api, API_BASE_URL } from '../context/AuthContext';

const AVATAR_COLORS = [
    '#6366f1',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#ec4899'
];

const hashStr = (s) =>
    String(s).split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);

const getColor = (email) =>
    AVATAR_COLORS[
        Math.abs(hashStr(email || '')) % AVATAR_COLORS.length
    ];

const uint8ArrayToBase64 = (arr) => {
    let binary = '';
    const len = arr.byteLength;

    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(arr[i]);
    }

    return window.btoa(binary);
};

const base64ToUint8Array = (base64) => {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
};

export const useCollaboration = (
    roomId,
    userEmail,
    token,
    onExecutionMessage
) => {
    const [members, setMembers] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState(
        'DISCONNECTED'
    );
    const [fileNames, setFileNames] = useState(['index.js']);
    const [chatMessages, setChatMessages] = useState([]);
    const [roomState, setRoomState] = useState({
        primaryHostEmail: null,
        coHosts: [],
        locked: false,
        readOnly: false
    });
    const [wasKicked, setWasKicked] = useState(false);

    /*
     * Yjs document, shared file map and awareness instance.
     *
     * These are created exactly once using lazy useState initializers.
     */
    const [yDoc] = useState(() => new Y.Doc());

    const [yMap] = useState(() =>
        yDoc.getMap('workspace-files')
    );

    const [awareness] = useState(
        () => new awarenessProtocol.Awareness(yDoc)
    );

    const stompClientRef = useRef(null);

    const yDocRef = useRef(yDoc);
    const yMapRef = useRef(yMap);
    const monacoBindingRef = useRef(null);
    const awarenessRef = useRef(awareness);

    const hasSyncedRef = useRef(false);
    const syncTimeoutRef = useRef(null);
    const saveTimeoutRef = useRef(null);

    /*
     * Used to start the WebSocket asynchronously from the effect.
     * This avoids the react-hooks/set-state-in-effect error.
     */
    const connectTimeoutRef = useRef(null);

    /*
     * Get or create a Y.Text for a file.
     */
    const getFileText = useCallback((filename) => {
        if (!yMapRef.current.has(filename)) {
            yMapRef.current.set(filename, true);
        }

        return yDocRef.current.getText(filename);
    }, []);

    /*
     * Get all files that should be persisted to the database.
     * Folder marker files are intentionally preserved here.
     */
    const getPersistableFiles = useCallback(() => {
        const files = {};

        for (const name of yMapRef.current.keys()) {
            files[name] = getFileText(name).toString();
        }

        return files;
    }, [getFileText]);

    /*
     * Handle messages received from the WebSocket.
     *
     * This is declared before connectWebSocket because
     * connectWebSocket uses it.
     */
    const handleIncomingMessage = useCallback(
        (msg) => {
            if (msg.messageType === 'JOIN') {
                /*
                 * Do not add yourself to the member list again.
                 */
                if (msg.creator === userEmail) {
                    return;
                }

                setMembers((prev) =>
                    prev.includes(msg.creator)
                        ? prev
                        : [...prev, msg.creator]
                );

            } else if (msg.messageType === 'LEFT') {
                setMembers((prev) =>
                    prev.filter(
                        (email) => email !== msg.creator
                    )
                );

            } else if (
                msg.messageType === 'YJS_SYNC_REQUEST'
            ) {
                /*
                 * Send the current Yjs state to the requester.
                 */
                if (hasSyncedRef.current) {
                    const stateUpdate =
                        Y.encodeStateAsUpdate(
                            yDocRef.current
                        );

                    const syncResponse = {
                        roomId,
                        creator: userEmail,
                        content:
                            uint8ArrayToBase64(
                                stateUpdate
                            ),
                        messageType:
                            'YJS_SYNC_RESPONSE'
                    };

                    if (
                        stompClientRef.current &&
                        stompClientRef.current.connected
                    ) {
                        stompClientRef.current.send(
                            '/app/chat.send',
                            {},
                            JSON.stringify(
                                syncResponse
                            )
                        );
                    }

                    /*
                     * Also send our awareness state.
                     */
                    const awarenessUpdate =
                        awarenessProtocol.encodeAwarenessUpdate(
                            awarenessRef.current,
                            [
                                awarenessRef.current
                                    .clientID
                            ]
                        );

                    const awarenessMsg = {
                        roomId,
                        creator: userEmail,
                        content:
                            uint8ArrayToBase64(
                                awarenessUpdate
                            ),
                        messageType:
                            'YJS_AWARENESS'
                    };

                    if (
                        stompClientRef.current &&
                        stompClientRef.current.connected
                    ) {
                        stompClientRef.current.send(
                            '/app/chat.send',
                            {},
                            JSON.stringify(
                                awarenessMsg
                            )
                        );
                    }
                }

            } else if (
                msg.messageType === 'YJS_SYNC_RESPONSE'
            ) {
                /*
                 * Only apply the first sync response.
                 */
                if (!hasSyncedRef.current) {
                    if (syncTimeoutRef.current) {
                        clearTimeout(
                            syncTimeoutRef.current
                        );
                    }

                    Y.applyUpdate(
                        yDocRef.current,
                        base64ToUint8Array(
                            msg.content
                        ),
                        'websocket-sync'
                    );

                    hasSyncedRef.current = true;
                }

            } else if (
                msg.messageType === 'YJS_UPDATE'
            ) {
                /*
                 * Don't apply our own update again.
                 */
                if (msg.creator !== userEmail) {
                    try {
                        Y.applyUpdate(
                            yDocRef.current,
                            base64ToUint8Array(
                                msg.content
                            ),
                            'websocket-update'
                        );
                    } catch (e) {
                        console.error(
                            'Failed to apply update',
                            e
                        );
                    }
                }

            } else if (
                msg.messageType === 'YJS_AWARENESS'
            ) {
                try {
                    awarenessProtocol.applyAwarenessUpdate(
                        awarenessRef.current,
                        base64ToUint8Array(
                            msg.content
                        ),
                        'websocket'
                    );
                } catch (e) {
                    console.error(
                        'Failed to apply awareness',
                        e
                    );
                }

            } else if (
                msg.messageType === 'CHAT'
            ) {
                /*
                 * Normalize both old and new chat message formats.
                 */
                let normalized = msg;

                try {
                    const parsed =
                        JSON.parse(msg.content);

                    if (
                        parsed &&
                        typeof parsed === 'object' &&
                        'id' in parsed
                    ) {
                        normalized = {
                            ...msg,
                            id: parsed.id,
                            content: parsed.text
                        };
                    }
                } catch {
                    /*
                     * Older/unwrapped message format.
                     * Use the original message as-is.
                     */
                }

                setChatMessages((prev) => [
                    ...prev,
                    normalized
                ]);

            } else if (
                msg.messageType === 'MESSAGE_DELETED'
            ) {
                const deletedId =
                    Number(msg.content);

                setChatMessages((prev) =>
                    prev.filter(
                        (m) => m.id !== deletedId
                    )
                );

            } else if (
                msg.messageType ===
                'ROOM_STATE_UPDATE'
            ) {
                try {
                    setRoomState(
                        JSON.parse(msg.content)
                    );
                } catch (e) {
                    console.error(
                        'Failed to parse room state update',
                        e
                    );
                }

            } else if (
                msg.messageType === 'KICKED'
            ) {
                /*
                 * If we were kicked, mark ourselves as kicked.
                 */
                if (msg.content === userEmail) {
                    setWasKicked(true);
                } else {
                    /*
                     * Otherwise remove the kicked member
                     * from our local member list.
                     */
                    setMembers((prev) =>
                        prev.filter(
                            (email) =>
                                email !==
                                msg.content
                        )
                    );
                }

            } else if (
                msg.messageType ===
                    'EXECUTION_START' ||
                msg.messageType ===
                    'EXECUTION_RESULT' ||
                msg.messageType ===
                    'EXECUTION_OUTPUT' ||
                msg.messageType ===
                    'EXECUTION_END'
            ) {
                onExecutionMessage(msg);
            }
        },
        [
            roomId,
            userEmail,
            onExecutionMessage
        ]
    );

    /*
     * Connect to the WebSocket.
     */
    const connectWebSocket = useCallback(() => {
        setConnectionStatus('CONNECTING');

        const socket = new SockJS(
            `${API_BASE_URL}/ws`
        );

        const client = Stomp.over(socket);

        stompClientRef.current = client;

        client.debug = (str) =>
            console.log(
                '[STOMP Debug] ' + str
            );

        const headers = token
            ? {
                  Authorization:
                      `Bearer ${token}`
              }
            : {};

        client.connect(
            headers,

            () => {
                /*
                 * Check whether the component was
                 * unmounted while connecting.
                 */
                if (
                    stompClientRef.current !==
                    client
                ) {
                    client.disconnect();
                    return;
                }

                setConnectionStatus('CONNECTED');

                /*
                 * Load room state.
                 */
                api.get(
                    `/room/${roomId}/state`
                )
                    .then((response) => {
                        setRoomState(
                            response.data
                        );
                    })
                    .catch((err) => {
                        console.error(
                            'Failed to load room state:',
                            err
                        );
                    });

                /*
                 * Load chat history.
                 */
                api.get(
                    `/room/${roomId}/messages`
                )
                    .then((response) => {
                        const history =
                            (
                                response.data ||
                                []
                            ).map((m) => ({
                                id: m.id,
                                roomId: m.roomId,
                                creator: m.sender,
                                content: m.content,
                                localDateTime:
                                    m.timestamp,
                                messageType:
                                    'CHAT'
                            }));

                        setChatMessages(
                            history
                        );
                    })
                    .catch((err) => {
                        console.error(
                            'Failed to load chat history:',
                            err
                        );
                    });

                /*
                 * Subscribe to room messages.
                 */
                client.subscribe(
                    `/topic/room/${roomId}`,
                    (messageOutput) => {
                        try {
                            const message =
                                JSON.parse(
                                    messageOutput.body
                                );

                            handleIncomingMessage(
                                message
                            );
                        } catch (e) {
                            console.error(
                                'Failed to parse incoming WS message:',
                                e
                            );
                        }
                    }
                );

                /*
                 * Load all current room members.
                 */
                api.get(
                    `/room/${roomId}/members`
                )
                    .then((response) => {
                        const memberList =
                            response.data || [];

                        setMembers((prev) => {
                            const merged =
                                new Set(prev);

                            memberList.forEach(
                                (member) =>
                                    merged.add(
                                        member
                                    )
                            );

                            return [
                                ...merged
                            ];
                        });
                    })
                    .catch((err) => {
                        console.error(
                            'Failed to load room members:',
                            err
                        );
                    });

                /*
                 * Tell other users that we joined.
                 */
                const joinMessage = {
                    roomId,
                    creator: userEmail,
                    content:
                        `${userEmail} joined the session.`,
                    messageType: 'JOIN'
                };

                client.send(
                    '/app/chat.send',
                    {},
                    JSON.stringify(
                        joinMessage
                    )
                );

                /*
                 * Ask peers for the current Yjs state.
                 */
                const syncRequest = {
                    roomId,
                    creator: userEmail,
                    content: '',
                    messageType:
                        'YJS_SYNC_REQUEST'
                };

                client.send(
                    '/app/chat.send',
                    {},
                    JSON.stringify(
                        syncRequest
                    )
                );

                /*
                 * Clear an existing sync timeout.
                 */
                if (syncTimeoutRef.current) {
                    clearTimeout(
                        syncTimeoutRef.current
                    );
                }

                /*
                 * If no peer responds after 1.5 seconds,
                 * restore the workspace from the database.
                 */
                syncTimeoutRef.current =
                    setTimeout(() => {
                        if (
                            hasSyncedRef.current
                        ) {
                            return;
                        }

                        console.log(
                            'No peer response. Initializing Yjs text state from DB...'
                        );

                        api.get(
                            `/room/${roomId}/code`
                        )
                            .then((response) => {
                                if (
                                    hasSyncedRef.current
                                ) {
                                    return;
                                }

                                if (
                                    response.data
                                ) {
                                    try {
                                        const parsedFiles =
                                            typeof response
                                                .data ===
                                            'string'
                                                ? JSON.parse(
                                                      response
                                                          .data
                                                  )
                                                : response.data;

                                        /*
                                         * Restore file contents.
                                         */
                                        for (const [
                                            filename,
                                            content
                                        ] of Object.entries(
                                            parsedFiles
                                        )) {
                                            const fileText =
                                                getFileText(
                                                    filename
                                                );

                                            if (
                                                fileText.length ===
                                                0
                                            ) {
                                                fileText.insert(
                                                    0,
                                                    content
                                                );
                                            }
                                        }

                                        /*
                                         * Restore empty-folder markers.
                                         */
                                        const folderMarkers =
                                            Object.entries(
                                                parsedFiles
                                            )
                                                .filter(
                                                    ([key]) =>
                                                        key.endsWith(
                                                            '/.folder'
                                                        )
                                                )
                                                .map(
                                                    ([key]) =>
                                                        key
                                                );

                                        for (
                                            const markerKey of
                                            folderMarkers
                                        ) {
                                            if (
                                                !yMapRef.current.has(
                                                    markerKey
                                                )
                                            ) {
                                                yMapRef.current.set(
                                                    markerKey,
                                                    true
                                                );
                                            }
                                        }

                                        setFileNames(
                                            Object.keys(
                                                parsedFiles
                                            )
                                        );
                                    } catch {
                                        /*
                                         * Database contains
                                         * plain source code instead
                                         * of JSON.
                                         */
                                        const mainFile =
                                            getFileText(
                                                'index.js'
                                            );

                                        if (
                                            mainFile.length ===
                                            0
                                        ) {
                                            mainFile.insert(
                                                0,
                                                response.data
                                            );
                                        }

                                        setFileNames([
                                            'index.js'
                                        ]);
                                    }
                                } else {
                                    /*
                                     * No saved code exists.
                                     */
                                    const mainFile =
                                        getFileText(
                                            'index.js'
                                        );

                                    if (
                                        mainFile.length ===
                                        0
                                    ) {
                                        mainFile.insert(
                                            0,
                                            'console.log("Hello from index.js!");'
                                        );
                                    }

                                    setFileNames([
                                        'index.js'
                                    ]);
                                }

                                hasSyncedRef.current =
                                    true;
                            })
                            .catch((err) => {
                                console.error(
                                    'Failed to fetch DB fallback state:',
                                    err
                                );

                                if (
                                    !hasSyncedRef.current
                                ) {
                                    const mainFile =
                                        getFileText(
                                            'index.js'
                                        );

                                    if (
                                        mainFile.length ===
                                        0
                                    ) {
                                        mainFile.insert(
                                            0,
                                            'console.log("Hello from index.js!");'
                                        );
                                    }

                                    hasSyncedRef.current =
                                        true;
                                }
                            });
                    }, 1500);
            },

            (error) => {
                if (
                    stompClientRef.current ===
                    client
                ) {
                    setConnectionStatus(
                        'DISCONNECTED'
                    );
                }

                console.error(
                    'STOMP connection failed:',
                    error
                );
            }
        );
    }, [
        token,
        roomId,
        userEmail,
        handleIncomingMessage,
        getFileText
    ]);

    /*
     * Disconnect WebSocket.
     */
    const disconnectWebSocket =
        useCallback(() => {
            const client =
                stompClientRef.current;

            stompClientRef.current = null;

            if (!client) {
                return;
            }

            try {
                if (client.connected) {
                    const leftMessage = {
                        roomId,
                        creator: userEmail,
                        content:
                            `${userEmail} left the session.`,
                        messageType: 'LEFT'
                    };

                    client.send(
                        '/app/chat.send',
                        {},
                        JSON.stringify(
                            leftMessage
                        )
                    );

                    client.disconnect(() => {
                        setConnectionStatus(
                            'DISCONNECTED'
                        );
                    });
                } else if (client.ws) {
                    client.ws.onclose = null;
                    client.ws.close();
                }
            } catch (e) {
                console.error(
                    'Failed clean websocket disconnect:',
                    e
                );
            }
        }, [roomId, userEmail]);

    /*
     * Main Yjs, awareness and WebSocket lifecycle.
     */
    useEffect(() => {
        /*
         * Capture the ref values once for cleanup.
         * This prevents react-hooks/exhaustive-deps
         * cleanup warnings.
         */
        const yDoc = yDocRef.current;
        const awareness =
            awarenessRef.current;
        const yMap = yMapRef.current;

        /*
         * Yjs update handler.
         */
        const handleYjsUpdate = (
            update,
            origin
        ) => {
            if (
                origin !==
                    'websocket-update' &&
                origin !==
                    'websocket-sync'
            ) {
                const base64Update =
                    uint8ArrayToBase64(
                        update
                    );

                const updateMessage = {
                    roomId,
                    creator: userEmail,
                    content: base64Update,
                    messageType:
                        'YJS_UPDATE'
                };

                const client =
                    stompClientRef.current;

                if (
                    client &&
                    client.connected
                ) {
                    client.send(
                        '/app/chat.send',
                        {},
                        JSON.stringify(
                            updateMessage
                        )
                    );
                }
            }

            /*
             * Debounced autosave.
             */
            if (saveTimeoutRef.current) {
                clearTimeout(
                    saveTimeoutRef.current
                );
            }

            saveTimeoutRef.current =
                setTimeout(() => {
                    const files =
                        getPersistableFiles();

                    api.post(
                        `/room/${roomId}/save`,
                        {
                            code: JSON.stringify(
                                files
                            )
                        }
                    ).catch((err) => {
                        console.error(
                            'Failed to auto-save code:',
                            err
                        );
                    });
                }, 2000);
        };

        yDoc.on(
            'update',
            handleYjsUpdate
        );

        /*
         * Update remote cursor CSS.
         */
        const updateCursorStyles = () => {
            let css = '';

            awareness
                .getStates()
                .forEach(
                    (
                        state,
                        clientID
                    ) => {
                        if (
                            state.user
                        ) {
                            const color =
                                state.user
                                    .color ||
                                '#f59e0b';

                            const name =
                                state.user
                                    .name ||
                                'User';

                            css += `
.yRemoteSelection-${clientID} {
  background-color: ${color}33;
}

.yRemoteSelectionHead-${clientID} {
  border-left: 2px solid ${color};
  position: absolute;
  height: 100%;
  box-sizing: border-box;
  z-index: 99;
}

.yRemoteSelectionHead-${clientID}::after {
  content: '${name}';
  display: block;
  position: absolute;
  top: -18px;
  left: -2px;
  color: white;
  background-color: ${color};
  font-size: 11px;
  font-family: sans-serif;
  padding: 2px 6px;
  border-radius: 4px;
  border-bottom-left-radius: 0;
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
`;
                        }
                    }
                );

            let styleEl =
                document.getElementById(
                    'yjs-cursors-style'
                );

            if (!styleEl) {
                styleEl =
                    document.createElement(
                        'style'
                    );

                styleEl.id =
                    'yjs-cursors-style';

                document.head.appendChild(
                    styleEl
                );
            }

            styleEl.innerHTML = css;
        };

        /*
         * Awareness update handler.
         */
        const handleAwarenessUpdate = (
            { added, updated, removed },
            origin
        ) => {
            updateCursorStyles();

            if (
                origin !== 'websocket'
            ) {
                const changedClients =
                    added.concat(
                        updated,
                        removed
                    );

                const update =
                    awarenessProtocol.encodeAwarenessUpdate(
                        awareness,
                        changedClients
                    );

                const base64Update =
                    uint8ArrayToBase64(
                        update
                    );

                const updateMessage = {
                    roomId,
                    creator: userEmail,
                    content:
                        base64Update,
                    messageType:
                        'YJS_AWARENESS'
                };

                const client =
                    stompClientRef.current;

                if (
                    client &&
                    client.connected
                ) {
                    client.send(
                        '/app/chat.send',
                        {},
                        JSON.stringify(
                            updateMessage
                        )
                    );
                }
            }
        };

        awareness.on(
            'update',
            handleAwarenessUpdate
        );

        /*
         * Set local awareness information.
         */
        awareness.setLocalStateField(
            'user',
            {
                name:
                    userEmail?.split(
                        '@'
                    )[0] ||
                    'User',
                color:
                    getColor(
                        userEmail
                    )
            }
        );

        /*
         * Watch changes to the shared file map.
         */
        const handleMapObserve = () => {
            const currentFiles =
                Array.from(
                    yMap.keys()
                );

            if (
                currentFiles.length ===
                0
            ) {
                currentFiles.push(
                    'index.js'
                );
            }

            setFileNames(
                currentFiles
            );
        };

        yMap.observeDeep(
            handleMapObserve
        );

        /*
         * Start WebSocket connection
         * asynchronously.
         *
         * This is necessary because the connection
         * immediately calls setConnectionStatus().
         * Starting it through setTimeout prevents
         * react-hooks/set-state-in-effect from
         * reporting a synchronous state update.
         */
        connectTimeoutRef.current =
            setTimeout(() => {
                connectWebSocket();
            }, 0);

        /*
         * Cleanup.
         */
        return () => {
            /*
             * Cancel the pending WebSocket startup.
             */
            if (
                connectTimeoutRef.current
            ) {
                clearTimeout(
                    connectTimeoutRef.current
                );

                connectTimeoutRef.current =
                    null;
            }

            yDoc.off(
                'update',
                handleYjsUpdate
            );

            awareness.off(
                'update',
                handleAwarenessUpdate
            );

            yMap.unobserveDeep(
                handleMapObserve
            );

            disconnectWebSocket();

            if (
                saveTimeoutRef.current
            ) {
                clearTimeout(
                    saveTimeoutRef.current
                );
            }

            if (
                syncTimeoutRef.current
            ) {
                clearTimeout(
                    syncTimeoutRef.current
                );
            }

            if (
                monacoBindingRef.current
            ) {
                monacoBindingRef.current.destroy();
            }
        };
    }, [
        roomId,
        userEmail,
        getPersistableFiles,
        connectWebSocket,
        disconnectWebSocket
    ]);

    /*
     * Send a chat message.
     */
    const sendChatMessage =
        useCallback(
            (text) => {
                const client =
                    stompClientRef.current;

                if (
                    client &&
                    client.connected &&
                    text.trim()
                ) {
                    const chatMsg = {
                        roomId,
                        creator: userEmail,
                        content: text,
                        messageType:
                            'CHAT'
                    };

                    client.send(
                        '/app/chat.send',
                        {},
                        JSON.stringify(
                            chatMsg
                        )
                    );
                }
            },
            [roomId, userEmail]
        );

    /*
     * Delete a chat message.
     */
    const deleteChatMessage =
        useCallback(
            (messageId) => {
                return api.delete(
                    `/room/${roomId}/messages/${messageId}`
                );
            },
            [roomId]
        );

    /*
     * Host controls.
     */
    const lockRoom =
        useCallback(
            (locked) => {
                return api.post(
                    `/room/${roomId}/lock`,
                    { locked }
                );
            },
            [roomId]
        );

    const setReadOnlyMode =
        useCallback(
            (readOnly) => {
                return api.post(
                    `/room/${roomId}/readonly`,
                    { readOnly }
                );
            },
            [roomId]
        );

    const promoteToCoHost =
        useCallback(
            (targetEmail) => {
                return api.post(
                    `/room/${roomId}/promote`,
                    { targetEmail }
                );
            },
            [roomId]
        );

    const demoteCoHost =
        useCallback(
            (targetEmail) => {
                return api.post(
                    `/room/${roomId}/demote`,
                    { targetEmail }
                );
            },
            [roomId]
        );

    const kickMember =
        useCallback(
            (targetEmail) => {
                return api.post(
                    `/room/${roomId}/kick`,
                    { targetEmail }
                );
            },
            [roomId]
        );

    /*
     * Send input to the currently running execution.
     */
    const sendExecutionInput =
        useCallback(
            (input) => {
                const client =
                    stompClientRef.current;

                if (
                    client &&
                    client.connected
                ) {
                    client.send(
                        '/app/execution.input',
                        {},
                        JSON.stringify({
                            roomId,
                            input
                        })
                    );
                }
            },
            [roomId]
        );

    /*
     * Stop the currently running execution.
     */
    const stopExecution =
        useCallback(
            () => {
                const client =
                    stompClientRef.current;

                if (
                    client &&
                    client.connected
                ) {
                    client.send(
                        '/app/execution.stop',
                        {},
                        JSON.stringify({
                            roomId
                        })
                    );
                }
            },
            [roomId]
        );

    /*
     * Bind Monaco editor to Yjs.
     */
    const bindEditor =
        useCallback(
            (
                editor,
                filename = 'index.js'
            ) => {
                if (
                    monacoBindingRef.current
                ) {
                    monacoBindingRef.current.destroy();
                }

                monacoBindingRef.current =
                    new MonacoBinding(
                        getFileText(
                            filename
                        ),
                        editor.getModel(),
                        new Set([editor]),
                        awarenessRef.current
                    );
            },
            [getFileText]
        );

    /*
     * Get all actual files.
     *
     * Folder markers ending in /.folder
     * are excluded from execution/downloads.
     */
    const getAllFiles =
        useCallback(
            () => {
                const files = {};

                for (
                    const name of
                    yMapRef.current.keys()
                ) {
                    if (
                        name.endsWith(
                            '/.folder'
                        )
                    ) {
                        continue;
                    }

                    files[name] =
                        getFileText(
                            name
                        ).toString();
                }

                if (
                    Object.keys(files)
                        .length ===
                    0
                ) {
                    files['index.js'] =
                        getFileText(
                            'index.js'
                        ).toString();
                }

                return files;
            },
            [getFileText]
        );

    /*
     * Create a new file.
     */
    const createFile =
        useCallback(
            (filename) => {
                if (
                    !yMapRef.current.has(
                        filename
                    )
                ) {
                    yMapRef.current.set(
                        filename,
                        true
                    );

                    /*
                     * Force immediate save.
                     */
                    if (
                        saveTimeoutRef.current
                    ) {
                        clearTimeout(
                            saveTimeoutRef.current
                        );
                    }

                    const files =
                        getPersistableFiles();

                    api.post(
                        `/room/${roomId}/save`,
                        {
                            code:
                                JSON.stringify(
                                    files
                                )
                        }
                    ).catch((err) => {
                        console.error(
                            'Failed to auto-save code:',
                            err
                        );
                    });
                }
            },
            [
                getPersistableFiles,
                roomId
            ]
        );

    /*
     * Create a folder.
     *
     * Empty folders are represented
     * using a /.folder marker.
     */
    const createFolder =
        useCallback(
            (folderPath) => {
                const markerKey =
                    `${folderPath}/.folder`;

                if (
                    !yMapRef.current.has(
                        markerKey
                    )
                ) {
                    yMapRef.current.set(
                        markerKey,
                        true
                    );

                    if (
                        saveTimeoutRef.current
                    ) {
                        clearTimeout(
                            saveTimeoutRef.current
                        );
                    }

                    const files =
                        getPersistableFiles();

                    api.post(
                        `/room/${roomId}/save`,
                        {
                            code:
                                JSON.stringify(
                                    files
                                )
                        }
                    ).catch((err) => {
                        console.error(
                            'Failed to auto-save after folder creation:',
                            err
                        );
                    });
                }
            },
            [
                getPersistableFiles,
                roomId
            ]
        );

    /*
     * Persist current workspace.
     */
    const persistSave =
        useCallback(
            () => {
                if (
                    saveTimeoutRef.current
                ) {
                    clearTimeout(
                        saveTimeoutRef.current
                    );
                }

                const files =
                    getPersistableFiles();

                api.post(
                    `/room/${roomId}/save`,
                    {
                        code:
                            JSON.stringify(
                                files
                            )
                    }
                ).catch((err) => {
                    console.error(
                        'Failed to auto-save:',
                        err
                    );
                });
            },
            [
                getPersistableFiles,
                roomId
            ]
        );

    /*
     * Rename a file.
     */
    const renameFile =
        useCallback(
            (
                oldPath,
                newPath
            ) => {
                if (
                    oldPath === newPath
                ) {
                    return;
                }

                if (
                    yMapRef.current.has(
                        newPath
                    )
                ) {
                    alert(
                        `"${newPath}" already exists.`
                    );

                    return;
                }

                const content =
                    getFileText(
                        oldPath
                    ).toString();

                const newText =
                    getFileText(
                        newPath
                    );

                if (
                    newText.length ===
                    0
                ) {
                    newText.insert(
                        0,
                        content
                    );
                }

                yMapRef.current.delete(
                    oldPath
                );

                persistSave();
            },
            [
                getFileText,
                persistSave
            ]
        );

    /*
     * Rename an entire folder.
     */
    const renameFolder =
        useCallback(
            (
                oldFolderPath,
                newFolderPath
            ) => {
                if (
                    oldFolderPath ===
                    newFolderPath
                ) {
                    return;
                }

                const prefix =
                    `${oldFolderPath}/`;

                const affected =
                    Array.from(
                        yMapRef.current.keys()
                    ).filter((key) =>
                        key.startsWith(
                            prefix
                        )
                    );

                for (
                    const oldKey of
                    affected
                ) {
                    const suffix =
                        oldKey.slice(
                            prefix.length
                        );

                    const newKey =
                        `${newFolderPath}/${suffix}`;

                    if (
                        oldKey.endsWith(
                            '/.folder'
                        )
                    ) {
                        if (
                            !yMapRef.current.has(
                                newKey
                            )
                        ) {
                            yMapRef.current.set(
                                newKey,
                                true
                            );
                        }
                    } else {
                        const content =
                            getFileText(
                                oldKey
                            ).toString();

                        const newText =
                            getFileText(
                                newKey
                            );

                        if (
                            newText.length ===
                            0
                        ) {
                            newText.insert(
                                0,
                                content
                            );
                        }
                    }

                    yMapRef.current.delete(
                        oldKey
                    );
                }

                persistSave();
            },
            [
                getFileText,
                persistSave
            ]
        );

    /*
     * Delete a file.
     */
    const deleteFile =
        useCallback(
            (path) => {
                yMapRef.current.delete(
                    path
                );

                persistSave();
            },
            [persistSave]
        );

    /*
     * Delete an entire folder.
     */
    const deleteFolder =
        useCallback(
            (folderPath) => {
                const prefix =
                    `${folderPath}/`;

                const affected =
                    Array.from(
                        yMapRef.current.keys()
                    ).filter((key) =>
                        key.startsWith(
                            prefix
                        )
                    );

                for (
                    const key of affected
                ) {
                    yMapRef.current.delete(
                        key
                    );
                }

                persistSave();
            },
            [persistSave]
        );

    return {
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
    };
};