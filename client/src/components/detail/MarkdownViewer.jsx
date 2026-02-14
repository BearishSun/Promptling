import { memo, useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DiffViewer from './DiffViewer';
import PlanCommentViewer from './PlanCommentViewer';
import CommentPanel from './CommentPanel';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function MarkdownViewer({ title, content, onClose, versionSelector, diffMode, diffContent, diffControls, diffViewMode, commentMode, commentControls }) {
  const [comments, setComments] = useState(new Map());
  const [showToast, setShowToast] = useState(false);

  // Clear comments when content changes (version switch)
  useEffect(() => {
    setComments(new Map());
  }, [content]);

  // Handle Escape key - don't close modal when comment input is active
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (commentMode) {
          const activeEl = document.activeElement;
          if (activeEl && activeEl.classList.contains('plan-line-input')) {
            return;
          }
        }
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, commentMode]);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const handleAddComment = useCallback((key, lineText, comment, lineLabel, sortKey) => {
    setComments(prev => {
      const next = new Map(prev);
      next.set(key, { lineText, comment, lineLabel, sortKey });
      return next;
    });
  }, []);

  const handleRemoveComment = useCallback((key) => {
    setComments(prev => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const handleCopied = useCallback(() => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, []);

  const splitClass = diffMode && diffViewMode === 'split' ? ' markdown-viewer--split' : '';
  const commentClass = commentMode ? ' markdown-viewer--commenting' : '';

  const renderContent = () => {
    if (commentMode) {
      return (
        <div className="markdown-viewer-comment-layout">
          <div className="markdown-viewer-comment-lines">
            {diffMode && diffContent ? (
              <DiffViewer
                oldContent={diffContent.oldContent}
                newContent={content}
                oldLabel={`v${diffContent.oldVersion}`}
                newLabel={`v${diffContent.newVersion}`}
                viewMode={diffViewMode}
                commentMode={true}
                comments={comments}
                onAddComment={handleAddComment}
              />
            ) : (
              <PlanCommentViewer
                content={content}
                comments={comments}
                onAddComment={handleAddComment}
                onRemoveComment={handleRemoveComment}
              />
            )}
          </div>
          <div className="markdown-viewer-comment-panel">
            <CommentPanel
              comments={comments}
              onRemoveComment={handleRemoveComment}
              diffMode={diffMode}
              onCopied={handleCopied}
            />
          </div>
        </div>
      );
    }

    if (diffMode && diffContent) {
      return (
        <DiffViewer
          oldContent={diffContent.oldContent}
          newContent={content}
          oldLabel={`v${diffContent.oldVersion}`}
          newLabel={`v${diffContent.newVersion}`}
          viewMode={diffViewMode}
        />
      );
    }

    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content || '*No content*'}
      </ReactMarkdown>
    );
  };

  return (
    <div className="markdown-viewer-overlay" onClick={handleOverlayClick}>
      <div className={`markdown-viewer${splitClass}${commentClass}`}>
        <div className="markdown-viewer-header">
          <div className="markdown-viewer-title-area">
            <h2 className="markdown-viewer-title">{title}</h2>
            {versionSelector}
            {diffControls}
            {commentControls}
          </div>
          <button className="markdown-viewer-close" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>
        <div className={`markdown-viewer-content${commentMode ? ' markdown-viewer-content--commenting' : ''}`}>
          {renderContent()}
        </div>
      </div>
      {showToast && (
        <div className="toast">Copied to clipboard</div>
      )}
    </div>
  );
}

export default memo(MarkdownViewer);
