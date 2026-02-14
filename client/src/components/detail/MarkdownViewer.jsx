import { memo, useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import RenderedDiffViewer from './RenderedDiffViewer';
import PlanCommentViewer from './PlanCommentViewer';
import CommentPanel from './CommentPanel';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function MarkdownViewer({ title, content, onClose, versionSelector, diffMode, diffContent, diffControls, diffViewMode, commentMode, commentControls, comments, onAddComment, onRemoveComment }) {
  const [showToast, setShowToast] = useState(false);

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

  const handleCopied = useCallback(() => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, []);

  const splitClass = diffMode && diffViewMode === 'split' ? ' markdown-viewer--split' : '';
  const commentClass = commentMode ? ' markdown-viewer--commenting' : '';

  const renderContent = () => {
    if (commentMode && diffMode && diffContent) {
      return (
        <div className="markdown-viewer-comment-layout">
          <div className="markdown-viewer-comment-lines">
            <RenderedDiffViewer
              oldContent={diffContent.oldContent}
              newContent={content}
              oldLabel={`v${diffContent.oldVersion}`}
              newLabel={`v${diffContent.newVersion}`}
              viewMode={diffViewMode}
              commentMode={true}
              comments={comments}
              onAddComment={onAddComment}
              onRemoveComment={onRemoveComment}
            />
          </div>
          <div className="markdown-viewer-comment-panel">
            <CommentPanel
              comments={comments}
              onRemoveComment={onRemoveComment}
              diffMode={diffMode}
              onCopied={handleCopied}
            />
          </div>
        </div>
      );
    }

    if (commentMode) {
      return (
        <div className="markdown-viewer-comment-layout">
          <div className="markdown-viewer-comment-lines">
            <PlanCommentViewer
              content={content}
              comments={comments}
              onAddComment={onAddComment}
              onRemoveComment={onRemoveComment}
            />
          </div>
          <div className="markdown-viewer-comment-panel">
            <CommentPanel
              comments={comments}
              onRemoveComment={onRemoveComment}
              diffMode={diffMode}
              onCopied={handleCopied}
            />
          </div>
        </div>
      );
    }

    if (diffMode && diffContent) {
      return (
        <RenderedDiffViewer
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
