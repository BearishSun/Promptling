import { memo, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

function MarkdownViewer({ title, content, onClose, versionSelector }) {
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

  return (
    <div className="markdown-viewer-overlay" onClick={handleOverlayClick}>
      <div className="markdown-viewer">
        <div className="markdown-viewer-header">
          <div className="markdown-viewer-title-area">
            <h2 className="markdown-viewer-title">{title}</h2>
            {versionSelector}
          </div>
          <button className="markdown-viewer-close" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
        </div>
        <div className="markdown-viewer-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || '*No content*'}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default memo(MarkdownViewer);
