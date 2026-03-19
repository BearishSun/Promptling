import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import { useProjects } from '../../context/ProjectProvider';

function PromptDialog({ action, entityId, entityTitle, onClose, planStatus }) {
  const [prompt, setPrompt] = useState('');
  const [showConfirm, setShowConfirm] = useState(null);
  const textareaRef = useRef(null);
  const { terminals, spawnTerminal, sendInput, setMinimized } = useTerminals();
  const { activeProject, activeProjectId } = useProjects();

  useEffect(() => {
    const timer = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleRun = useCallback(() => {
    // Find existing non-exited terminal for this entity in the current project
    let existingTerminal = null;
    for (const [, t] of terminals) {
      if (!t.exited && t.projectId === activeProjectId && (t.itemId === entityId || t.taskId === entityId)) {
        existingTerminal = t;
        break;
      }
    }

    if (existingTerminal) {
      // Build command to send to existing terminal
      const parts = [`/${action}`, entityId];
      if (prompt.trim()) {
        parts.push(prompt.trim());
      }
      const escaped = parts.join(' ').replace(/"/g, '\\"');
      const command = `claude "${escaped}"`;
      sendInput(existingTerminal.id, command);
      setTimeout(() => sendInput(existingTerminal.id, '\r'), 100);
      if (existingTerminal.minimized) {
        setMinimized(existingTerminal.id, false);
      }
    } else {
      // Build raw claude args - escaping is handled server-side
      const parts = [`/${action}`, entityId];
      if (prompt.trim()) {
        parts.push(prompt.trim());
      }
      const claudeArgs = parts.join(' ');
      const cwd = activeProject?.workingDir || undefined;

      spawnTerminal({
        cwd,
        claudeArgs,
        itemId: entityId,
        taskId: null,
        action,
        projectId: activeProject?.id || null,
        title: entityTitle,
      });
    }
    onClose();
  }, [action, entityId, entityTitle, prompt, activeProject, activeProjectId, terminals, spawnTerminal, sendInput, setMinimized, onClose]);

  const handleRunWithConfirm = useCallback(() => {
    if (action === 'implement' || action === 'breakdown') {
      if (!planStatus?.hasPlan) {
        setShowConfirm('No implementation plan exists. Continue anyway?');
        return;
      }
      if (!planStatus?.isApproved) {
        setShowConfirm("The latest plan hasn't been approved. Continue anyway?");
        return;
      }
    }
    handleRun();
  }, [action, planStatus, handleRun]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (showConfirm) {
        handleRun();
      } else {
        handleRunWithConfirm();
      }
    }
    if (e.key === 'Escape') {
      if (showConfirm) {
        setShowConfirm(null);
      } else {
        onClose();
      }
    }
  }, [handleRun, handleRunWithConfirm, showConfirm, onClose]);

  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{actionLabel}: {entityTitle}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {showConfirm ? (
            <div className="prompt-dialog-warning" onKeyDown={handleKeyDown} tabIndex={-1}>
              <p style={{ color: 'var(--warning)', fontWeight: 500, marginBottom: '8px' }}>
                {showConfirm}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Press Ctrl+Enter to continue anyway, or go back to add a prompt.
              </p>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="terminal-prompt">Optional prompt</label>
                <textarea
                  ref={textareaRef}
                  id="terminal-prompt"
                  className="input"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add additional instructions..."
                  rows={4}
                  maxLength={8000}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Ctrl+Enter to run
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <div className="modal-footer-actions">
            {showConfirm ? (
              <>
                <button className="btn btn-secondary" onClick={() => setShowConfirm(null)}>
                  Go Back
                </button>
                <button className="btn btn-warning" onClick={handleRun}>
                  Continue Anyway
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleRunWithConfirm}>
                  Run
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PromptDialog);
