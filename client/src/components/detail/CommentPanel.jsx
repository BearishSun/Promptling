import { memo, useState, useMemo, useCallback } from 'react';

const ClipboardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const RemoveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function CommentPanel({ comments, onRemoveComment, diffMode, onCopied }) {
  const [copyFeedback, setCopyFeedback] = useState(false);

  const sortedEntries = useMemo(() =>
    [...comments.entries()].sort(([, a], [, b]) => a.sortKey - b.sortKey),
    [comments]
  );

  const promptText = useMemo(() => {
    if (sortedEntries.length === 0) return '';

    const header = "I've made the following comments on the plan, please act on them:";

    const body = sortedEntries.map(([, entry]) =>
      `${entry.lineLabel}: \`${entry.lineText}\`\nComment: ${entry.comment}`
    ).join('\n\n');

    return `${header}\n\n${body}`;
  }, [sortedEntries]);

  const handleCopy = useCallback(async () => {
    if (!promptText) return;
    try {
      await navigator.clipboard.writeText(promptText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
      if (onCopied) onCopied();
    } catch (err) {
      console.error('Failed to copy comments:', err);
    }
  }, [promptText, onCopied]);

  return (
    <div className="comment-panel">
      <div className="comment-panel-header">
        <span className="comment-panel-title">Comments ({comments.size})</span>
      </div>

      <div className="comment-panel-list">
        {sortedEntries.length === 0 ? (
          <div className="comment-panel-empty">
            Click on a line to add a comment
          </div>
        ) : (
          sortedEntries.map(([key, entry]) => (
            <div key={key} className="comment-panel-item">
              <div className="comment-panel-item-header">
                <span className="comment-panel-item-label">{entry.lineLabel}</span>
                <button
                  className="comment-panel-item-remove"
                  onClick={() => onRemoveComment(key)}
                  title="Remove comment"
                >
                  <RemoveIcon />
                </button>
              </div>
              <div className="comment-panel-item-line">{entry.lineText || '\u00A0'}</div>
              <div className="comment-panel-item-comment">{entry.comment}</div>
            </div>
          ))
        )}
      </div>

      {sortedEntries.length > 0 && (
        <div className="comment-panel-footer">
          <div className="comment-panel-preview-label">Prompt preview</div>
          <pre className="comment-panel-preview">{promptText}</pre>
          <button
            className={`btn btn-sm comment-panel-copy-btn${copyFeedback ? ' comment-panel-copy-btn--copied' : ' btn-primary'}`}
            onClick={handleCopy}
          >
            <ClipboardIcon />
            {copyFeedback ? 'Copied!' : 'Copy prompt'}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(CommentPanel);
