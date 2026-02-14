import { memo, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Stable component factories — defined once, never recreated.
// They just stamp data-source-line onto block elements so we can
// use event delegation + CSS for all interactive behaviour.
function makeAnnotatable(Tag) {
  const Component = ({ node, children, ...props }) => {
    const line = node?.position?.start?.line;
    if (line == null) return <Tag {...props}>{children}</Tag>;
    return <Tag {...props} data-source-line={line}>{children}</Tag>;
  };
  Component.displayName = `Annotatable(${Tag})`;
  return Component;
}

const annotatableComponents = {
  p: makeAnnotatable('p'),
  h1: makeAnnotatable('h1'),
  h2: makeAnnotatable('h2'),
  h3: makeAnnotatable('h3'),
  h4: makeAnnotatable('h4'),
  h5: makeAnnotatable('h5'),
  h6: makeAnnotatable('h6'),
  li: makeAnnotatable('li'),
  pre: makeAnnotatable('pre'),
  blockquote: makeAnnotatable('blockquote'),
  table: makeAnnotatable('table'),
  tr: makeAnnotatable('tr'),
  hr: ({ node, ...props }) => {
    const line = node?.position?.start?.line;
    return <hr {...props} data-source-line={line || undefined} />;
  },
};

function PlanCommentViewer({ content, comments, onAddComment, onRemoveComment }) {
  const [activeLine, setActiveLine] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputPos, setInputPos] = useState(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const rawLines = useMemo(() => (content || '').split('\n'), [content]);

  // Sync comment highlights onto the DOM (avoids re-rendering the markdown tree)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll('[data-source-line]').forEach(el => {
      const key = el.dataset.sourceLine;
      el.classList.toggle('plan-line-commented', comments.has(key));
    });
  }, [comments]);

  // Focus input when it appears
  useEffect(() => {
    if (activeLine !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeLine]);

  // Event-delegated click handler
  const handleContainerClick = useCallback((e) => {
    if (e.target.classList.contains('plan-line-input')) return;
    const block = e.target.closest('[data-source-line]');
    if (!block) return;
    const lineNum = parseInt(block.dataset.sourceLine, 10);
    if (isNaN(lineNum)) return;

    const key = String(lineNum);
    if (comments.has(key)) {
      onRemoveComment(key);
      return;
    }

    // Position the input just below the clicked block
    const containerEl = containerRef.current;
    const blockRect = block.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    setInputPos({
      top: blockRect.bottom - containerRect.top + containerEl.scrollTop,
      left: 0,
      width: '100%',
    });
    setActiveLine(lineNum);
    setInputValue('');
  }, [comments, onRemoveComment]);

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || activeLine === null) {
      setActiveLine(null);
      return;
    }
    const key = String(activeLine);
    const lineText = rawLines[activeLine - 1] || '';
    onAddComment(key, lineText, inputValue.trim(), `Line ${activeLine}`, activeLine);
    setActiveLine(null);
    setInputValue('');
  }, [inputValue, activeLine, rawLines, onAddComment]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setActiveLine(null);
      setInputValue('');
    }
  }, [handleSubmit]);

  return (
    <div
      ref={containerRef}
      className="plan-comment-viewer plan-comment-viewer--rendered"
      onClick={handleContainerClick}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={annotatableComponents}>
        {content || '*No content*'}
      </ReactMarkdown>

      {activeLine !== null && inputPos && (
        <div
          className="plan-rendered-input-row"
          style={{ position: 'absolute', top: inputPos.top, left: inputPos.left, width: inputPos.width }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            className="plan-line-input"
            type="text"
            placeholder="Add a comment..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => { setActiveLine(null); setInputValue(''); }, 150)}
          />
        </div>
      )}
    </div>
  );
}

export default memo(PlanCommentViewer);
