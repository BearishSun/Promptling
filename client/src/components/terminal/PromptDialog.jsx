import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import { useProjects } from '../../context/ProjectProvider';

function PromptDialog({ action, entityId, entityTitle, onClose }) {
  const [prompt, setPrompt] = useState('');
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
      sendInput(existingTerminal.id, command + '\r');
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

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRun();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleRun, onClose]);

  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{actionLabel}: {entityTitle}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
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
        </div>

        <div className="modal-footer">
          <div className="modal-footer-actions">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleRun}>
              Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PromptDialog);
