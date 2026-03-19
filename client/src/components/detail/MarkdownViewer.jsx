import { memo, useEffect, useCallback } from 'react';
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

function MarkdownViewer({ title, content, onClose, versionSelector, diffMode, diffContent, diffControls, diffViewMode, commentMode, commentControls, comments, onAddComment, onRemoveComment, commentSidebarVisible, reviewControls, onIteratePlan }) {
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

  const splitClass = diffMode && diffViewMode === 'split' ? ' markdown-viewer--split' : '';
  const commentClass = commentMode && commentSidebarVisible ? ' markdown-viewer--commenting' : '';

  const renderContent = () => {
    if (commentMode && diffMode && diffContent) {
      return (
        <div className="markdown-viewer-comment-layout">
          <div className={`markdown-viewer-comment-lines${!commentSidebarVisible ? ' markdown-viewer-comment-lines--full' : ''}`}>
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
          {commentSidebarVisible && (
            <div className="markdown-viewer-comment-panel">
              <CommentPanel
                comments={comments}
                onRemoveComment={onRemoveComment}
                onIteratePlan={onIteratePlan}
              />
            </div>
          )}
        </div>
      );
    }

    if (commentMode) {
      return (
        <div className="markdown-viewer-comment-layout">
          <div className={`markdown-viewer-comment-lines${!commentSidebarVisible ? ' markdown-viewer-comment-lines--full' : ''}`}>
            <PlanCommentViewer
              content={content}
              comments={comments}
              onAddComment={onAddComment}
              onRemoveComment={onRemoveComment}
            />
          </div>
          {commentSidebarVisible && (
            <div className="markdown-viewer-comment-panel">
              <CommentPanel
                comments={comments}
                onRemoveComment={onRemoveComment}
                onIteratePlan={onIteratePlan}
              />
            </div>
          )}
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
          <div className="markdown-viewer-header-top">
            <h2 className="markdown-viewer-title">{title}</h2>
            <button className="markdown-viewer-close" onClick={onClose} title="Close">
              <CloseIcon />
            </button>
          </div>
          {(reviewControls || versionSelector || diffControls || commentControls) && (
            <div className="markdown-viewer-toolbar">
              {reviewControls}
              {(reviewControls && (versionSelector || diffControls || commentControls)) && (
                <div className="markdown-viewer-toolbar-sep" />
              )}
              {versionSelector}
              {diffControls}
              {commentControls}
            </div>
          )}
        </div>
        <div className={`markdown-viewer-content${commentMode ? ' markdown-viewer-content--commenting' : ''}`}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

export default memo(MarkdownViewer);
