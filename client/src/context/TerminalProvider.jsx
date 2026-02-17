import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

const TerminalContext = createContext(null);

export function TerminalProvider({ children }) {
  const [terminals, setTerminals] = useState(() => new Map());
  const wsRef = useRef(null);
  const terminalRefsRef = useRef(new Map()); // terminalId -> { write, dispose }
  const reconnectTimerRef = useRef(null);
  const pendingMetaRef = useRef([]); // Queue of metadata for pending spawn responses
  const connectingRef = useRef(false);
  const pendingMessagesRef = useRef([]); // Messages queued before WS is open
  const waitingTimersRef = useRef(new Map()); // terminalId -> idle timer for input detection
  const terminalCountRef = useRef(0); // Track terminal count for reconnect logic
  const waitingForInputRef = useRef(new Set()); // Track which terminals are waitingForInput (avoids setTerminals in hot path)

  // Keep count of non-exited terminals and waitingForInput set in sync via ref
  useEffect(() => {
    let active = 0;
    const waiting = new Set();
    for (const t of terminals.values()) {
      if (!t.exited) active++;
      if (t.waitingForInput) waiting.add(t.id);
    }
    terminalCountRef.current = active;
    waitingForInputRef.current = waiting;
  }, [terminals]);

  // Persistent message handler - no monkey-patching
  const handleMessage = useCallback((event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      console.error('Failed to parse WebSocket message');
      return;
    }

    switch (msg.type) {
      case 'spawned': {
        // Match metadata by correlation ID if available, otherwise FIFO
        let meta = {};
        if (msg.correlationId) {
          const idx = pendingMetaRef.current.findIndex(m => m.correlationId === msg.correlationId);
          if (idx >= 0) {
            meta = pendingMetaRef.current.splice(idx, 1)[0];
          }
        } else {
          meta = pendingMetaRef.current.shift() || {};
        }
        // Remove internal correlationId from stored terminal state
        delete meta.correlationId;
        setTerminals(prev => {
          const next = new Map(prev);
          next.set(msg.terminalId, {
            id: msg.terminalId,
            title: msg.title,
            minimized: false,
            exited: false,
            exitCode: null,
            waitingForInput: false,
            ...meta,
          });
          return next;
        });
        break;
      }
      case 'output': {
        // Pipe directly to xterm via ref - never store in React state
        const ref = terminalRefsRef.current.get(msg.terminalId);
        if (ref) {
          ref.write(msg.data);
        }

        // Clear any existing idle timer for this terminal
        const existingTimer = waitingTimersRef.current.get(msg.terminalId);
        if (existingTimer) clearTimeout(existingTimer);

        // Only call setTerminals if this terminal was actually waitingForInput (avoids
        // invoking updater function on every output chunk in the hot path)
        if (waitingForInputRef.current.has(msg.terminalId)) {
          waitingForInputRef.current.delete(msg.terminalId);
          setTerminals(prev => {
            const t = prev.get(msg.terminalId);
            if (t?.waitingForInput) {
              const next = new Map(prev);
              next.set(msg.terminalId, { ...t, waitingForInput: false });
              return next;
            }
            return prev;
          });
        }

        // Conservative input detection: only specific interactive patterns,
        // and only after 500ms idle (reduces false positives from shell prompts)
        const trimmed = msg.data.trimEnd();
        const lastLine = trimmed.split('\n').pop() || '';
        const isInteractivePrompt =
          /\?\s*$/.test(lastLine) ||
          /\(y\/n\)\s*$/i.test(lastLine) ||
          /\(yes\/no\)\s*$/i.test(lastLine) ||
          /\(Y\/n\)\s*$/i.test(lastLine);

        if (isInteractivePrompt) {
          waitingTimersRef.current.set(msg.terminalId, setTimeout(() => {
            waitingTimersRef.current.delete(msg.terminalId);
            setTerminals(prev => {
              const t = prev.get(msg.terminalId);
              if (t && !t.exited) {
                const next = new Map(prev);
                next.set(msg.terminalId, { ...t, waitingForInput: true });
                return next;
              }
              return prev;
            });
          }, 500));
        }
        break;
      }
      case 'title': {
        setTerminals(prev => {
          const next = new Map(prev);
          const t = next.get(msg.terminalId);
          if (t) next.set(msg.terminalId, { ...t, title: msg.title });
          return next;
        });
        break;
      }
      case 'exit': {
        // Clear any idle timer
        const timer = waitingTimersRef.current.get(msg.terminalId);
        if (timer) {
          clearTimeout(timer);
          waitingTimersRef.current.delete(msg.terminalId);
        }
        setTerminals(prev => {
          const next = new Map(prev);
          const t = next.get(msg.terminalId);
          if (t) next.set(msg.terminalId, { ...t, exited: true, exitCode: msg.exitCode, waitingForInput: false });
          return next;
        });
        break;
      }
      case 'error': {
        console.error('Terminal server error:', msg.message);
        // Pop the pending metadata since the spawn failed
        if (msg.correlationId) {
          const idx = pendingMetaRef.current.findIndex(m => m.correlationId === msg.correlationId);
          if (idx >= 0) pendingMetaRef.current.splice(idx, 1);
        } else {
          pendingMetaRef.current.shift();
        }
        break;
      }
    }
  }, []);

  // Send message - queues if WebSocket not yet open
  const send = useCallback((msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      pendingMessagesRef.current.push(msg);
    }
  }, []);

  // Connect WebSocket - lazy, called on first spawn
  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;
    if (connectingRef.current) return;
    connectingRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      connectingRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Flush queued messages
      for (const msg of pendingMessagesRef.current) {
        ws.send(JSON.stringify(msg));
      }
      pendingMessagesRef.current = [];
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      connectingRef.current = false;
      // Capture active count before marking all exited (setTerminals is async)
      const hadActiveTerminals = terminalCountRef.current > 0;
      // Synchronously update ref since all terminals will be marked exited
      terminalCountRef.current = 0;
      waitingForInputRef.current.clear();

      // Mark all terminals as exited since server kills PTYs on disconnect
      setTerminals(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [id, t] of next) {
          if (!t.exited) {
            next.set(id, { ...t, exited: true, exitCode: -1, waitingForInput: false });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      // Clear pending queues
      pendingMetaRef.current = [];
      pendingMessagesRef.current = [];
      // Clear idle timers
      for (const timer of waitingTimersRef.current.values()) {
        clearTimeout(timer);
      }
      waitingTimersRef.current.clear();

      // Reconnect if we had active terminals (keeps WS ready for future spawns)
      if (hadActiveTerminals) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 2000);
      }
    };

    ws.onerror = () => {
      connectingRef.current = false;
    };
  }, [handleMessage, send]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      for (const timer of waitingTimersRef.current.values()) {
        clearTimeout(timer);
      }
      waitingTimersRef.current.clear();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const spawnTerminal = useCallback(({ cols, rows, cwd, claudeArgs, itemId, taskId, action, projectId, title }) => {
    // Ensure connection (lazy connect)
    connect();

    const correlationId = crypto.randomUUID();
    const meta = { itemId, taskId, action, projectId, correlationId };
    if (title) meta.title = title;
    pendingMetaRef.current.push(meta);

    const msg = { type: 'spawn', correlationId, cols: cols || 80, rows: rows || 24 };
    if (cwd) msg.cwd = cwd;
    if (claudeArgs) msg.claudeArgs = claudeArgs;
    if (title) msg.title = title;

    send(msg); // Will be queued if WS not yet open, flushed on open
  }, [send, connect]);

  const sendInput = useCallback((terminalId, data) => {
    send({ type: 'input', terminalId, data });
    // Reset waiting for input
    setTerminals(prev => {
      const t = prev.get(terminalId);
      if (t?.waitingForInput) {
        const next = new Map(prev);
        next.set(terminalId, { ...t, waitingForInput: false });
        return next;
      }
      return prev;
    });
  }, [send]);

  const resizeTerminal = useCallback((terminalId, cols, rows) => {
    send({ type: 'resize', terminalId, cols, rows });
  }, [send]);

  const killTerminal = useCallback((terminalId) => {
    send({ type: 'kill', terminalId });
  }, [send]);

  const setMinimized = useCallback((terminalId, minimized) => {
    setTerminals(prev => {
      const next = new Map(prev);
      const t = next.get(terminalId);
      if (t) next.set(terminalId, { ...t, minimized });
      return next;
    });
  }, []);

  const removeTerminal = useCallback((terminalId) => {
    const ref = terminalRefsRef.current.get(terminalId);
    if (ref) {
      ref.dispose();
      terminalRefsRef.current.delete(terminalId);
    }
    setTerminals(prev => {
      const next = new Map(prev);
      next.delete(terminalId);
      return next;
    });
  }, []);

  const registerTerminalRef = useCallback((terminalId, ref) => {
    if (ref) {
      terminalRefsRef.current.set(terminalId, ref);
    } else {
      terminalRefsRef.current.delete(terminalId);
    }
  }, []);

  const value = useMemo(() => ({
    terminals,
    spawnTerminal,
    sendInput,
    resizeTerminal,
    killTerminal,
    setMinimized,
    removeTerminal,
    registerTerminalRef,
  }), [terminals, spawnTerminal, sendInput, resizeTerminal, killTerminal, setMinimized, removeTerminal, registerTerminalRef]);

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminals() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminals must be used within TerminalProvider');
  }
  return context;
}

export default TerminalProvider;
