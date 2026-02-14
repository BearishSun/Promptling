import { memo, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DiffViewer from './DiffViewer';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function MarkdownViewer({ title, content, onClose, versionSelector, diffMode, diffContent, diffControls, diffViewMode }) {
  // Handle Escape key to close
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

  const splitClass = diffMode && diffViewMode === 'split' ? ' markdown-viewer--split' : '';

  return (
    <div className="markdown-viewer-overlay" onClick={handleOverlayClick}>
      <div className={`markdown-viewer${splitClass}`}>
        <div className="markdown-viewer-header">
          <div className="markdown-viewer-title-area">
            <h2 className="markdown-viewer-title">{title}</h2>
            {versionSelector}
            {diffControls}
          </div>
          <button className="markdown-viewer-close" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="markdown-viewer-content">
          {diffMode && diffContent ? (
            <DiffViewer
              oldContent={diffContent.oldContent}
              newContent={content}
              oldLabel={`v${diffContent.oldVersion}`}
              newLabel={`v${diffContent.newVersion}`}
              viewMode={diffViewMode}
            />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '*No content*'}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(MarkdownViewer);
