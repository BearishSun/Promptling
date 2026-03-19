import { memo, useMemo } from 'react';

const RemoveIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function CommentPanel({ comments, onRemoveComment, onIteratePlan }) {
  const sortedEntries = useMemo(() =>
    [...comments.entries()].sort(([, a], [, b]) => a.sortKey - b.sortKey),
    [comments]
  );

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

      {onIteratePlan && sortedEntries.length > 0 && (
        <div className="comment-panel-footer">
          <button
            className="btn btn-sm btn-primary comment-panel-iterate-btn"
            onClick={() => onIteratePlan()}
          >
            Iterate Plan
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(CommentPanel);
