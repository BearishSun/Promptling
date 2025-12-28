import { memo, useState, useEffect, useCallback } from 'react';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const ChevronIcon = ({ expanded }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{
      transition: 'transform 0.15s',
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)'
    }}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

function formatDateTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday at ${timeStr}`;
  } else {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    }) + ` at ${timeStr}`;
  }
}

function PromptHistoryEntry({ entry, isExpanded, onToggle }) {
  const roleColor = entry.role === 'user' ? 'var(--accent-color)' : '#22c55e';
  const roleLabel = entry.role === 'user' ? 'User' : 'Claude';

  return (
    <div className="prompt-history-entry">
      <button
        className="prompt-history-entry-header"
        onClick={onToggle}
      >
        <span className="entry-role" style={{ color: roleColor }}>
          {roleLabel}
        </span>
        <span className="entry-title">{entry.title}</span>
        <span className="entry-timestamp">{formatDateTime(entry.timestamp)}</span>
        <ChevronIcon expanded={isExpanded} />
      </button>
      {isExpanded && (
        <div className="prompt-history-entry-description">
          {entry.description}
        </div>
      )}
    </div>
  );
}

function PromptHistoryViewer({
  history,
  onClose,
  onClear,
  isLoading,
  itemTitle
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleClear = useCallback(() => {
    if (confirm('Clear all prompt history for this item?')) {
      onClear();
    }
  }, [onClear]);

  return (
    <div className="prompt-history-viewer-overlay" onClick={handleOverlayClick}>
      <div className="prompt-history-viewer">
        <div className="prompt-history-viewer-header">
          <h2 className="prompt-history-viewer-title">
            Prompt History
            {itemTitle && <span className="prompt-history-viewer-subtitle">: {itemTitle}</span>}
          </h2>
          <button className="prompt-history-viewer-close" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="prompt-history-viewer-content">
          {isLoading ? (
            <div className="prompt-history-loading">Loading...</div>
          ) : history.length === 0 ? (
            <div className="prompt-history-empty">
              No prompt history yet. Use Claude Code with this item to see conversation history here.
            </div>
          ) : (
            <div className="prompt-history-list">
              {history.map((entry) => (
                <PromptHistoryEntry
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedIds.has(entry.id)}
                  onToggle={() => toggleExpand(entry.id)}
                />
              ))}
            </div>
          )}
        </div>

        {history.length > 0 && (
          <div className="prompt-history-viewer-footer">
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleClear}
            >
              <TrashIcon /> Clear History
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(PromptHistoryViewer);
