import { memo, useState, useCallback } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import Terminal from './Terminal';

function TerminalPanel({ terminalId }) {
  const { terminals, killTerminal, setMinimized, removeTerminal } = useTerminals();
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const terminal = terminals.get(terminalId);
  if (!terminal) return null;

  const { title, exited, minimized, waitingForInput } = terminal;

  const handleClose = useCallback(() => {
    if (exited) {
      removeTerminal(terminalId);
    } else {
      setShowCloseConfirm(true);
    }
  }, [exited, terminalId, removeTerminal]);

  const handleConfirmClose = useCallback(() => {
    killTerminal(terminalId);
    removeTerminal(terminalId);
    setShowCloseConfirm(false);
  }, [terminalId, killTerminal, removeTerminal]);

  const handleToggleMinimize = useCallback(() => {
    setMinimized(terminalId, !minimized);
  }, [terminalId, minimized, setMinimized]);

  return (
    <div className={`terminal-panel${minimized ? ' minimized' : ''}${exited ? ' exited' : ''}`}>
      <div className="terminal-titlebar">
        <span className="terminal-title-text">
          {waitingForInput && <span className="terminal-input-indicator" />}
          {title || 'Terminal'}
          {exited && ' [exited]'}
        </span>
        <button
          className="terminal-minimize-btn"
          onClick={handleToggleMinimize}
          title={minimized ? 'Expand' : 'Minimize'}
          aria-label={minimized ? 'Expand terminal' : 'Minimize terminal'}
        >
          {minimized ? '\u25B3' : '\u25BD'}
        </button>
        <button
          className="terminal-close-btn"
          onClick={handleClose}
          title="Close terminal"
          aria-label="Close terminal"
        >
          {'\u00D7'}
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {waitingForInput ? 'Terminal is waiting for input' : ''}
      </span>
      <Terminal terminalId={terminalId} minimized={minimized} />

      {showCloseConfirm && (
        <div className="terminal-close-confirm">
          <p>Terminal is still running. Close anyway?</p>
          <div className="terminal-close-confirm-actions">
            <button className="btn btn-sm btn-secondary" onClick={() => setShowCloseConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-sm btn-danger" onClick={handleConfirmClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TerminalPanel);
