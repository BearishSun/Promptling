import { useEffect, useRef, memo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useTerminals } from '../../context/TerminalProvider';
import '@xterm/xterm/css/xterm.css';

function Terminal({ terminalId, minimized }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const lastDimsRef = useRef({ cols: 0, rows: 0 });
  const { sendInput, resizeTerminal, registerTerminalRef } = useTerminals();

  // Store callbacks in refs to stabilize effect dependencies
  const sendInputRef = useRef(sendInput);
  sendInputRef.current = sendInput;
  const resizeRef = useRef(resizeTerminal);
  resizeRef.current = resizeTerminal;
  const registerRef = useRef(registerTerminalRef);
  registerRef.current = registerTerminalRef;

  // Create and mount xterm instance
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#1e1e1e',
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#e5e5e5',
      },
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Consolas', 'Courier New', monospace",
      cursorBlink: true,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Register ref for output piping
    registerRef.current(terminalId, {
      write: (data) => term.write(data),
      dispose: () => term.dispose(),
    });

    // Wire input
    term.onData((data) => {
      sendInputRef.current(terminalId, data);
    });

    // Helper: fit and only send resize if dimensions actually changed
    const fitAndResize = () => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        if (cols !== lastDimsRef.current.cols || rows !== lastDimsRef.current.rows) {
          lastDimsRef.current = { cols, rows };
          resizeRef.current(terminalId, cols, rows);
        }
      } catch {
        // Container may not have dimensions yet
      }
    };

    // Fit after a frame
    requestAnimationFrame(fitAndResize);

    // ResizeObserver for responsive fitting (debounced)
    let resizeTimer = null;
    const observer = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        requestAnimationFrame(fitAndResize);
      }, 50);
    });
    observer.observe(containerRef.current);

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      observer.disconnect();
      registerRef.current(terminalId, null);
      term.dispose();
    };
  }, [terminalId]); // Only depends on terminalId - callbacks accessed via refs

  // Re-fit when un-minimized
  useEffect(() => {
    if (!minimized && fitAddonRef.current && termRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current.fit();
          resizeRef.current(terminalId, termRef.current.cols, termRef.current.rows);
        } catch {
          // Ignore
        }
      });
    }
  }, [minimized, terminalId]);

  return (
    <div
      ref={containerRef}
      className="terminal-xterm-container"
      style={{ display: minimized ? 'none' : undefined }}
    />
  );
}

export default memo(Terminal);
