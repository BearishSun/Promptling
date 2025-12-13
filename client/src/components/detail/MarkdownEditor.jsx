import { memo, useState, useCallback, lazy, Suspense } from 'react';
import { useDebouncedCallback } from '../../hooks/useDebounce';

// Lazy load the markdown preview
const ReactMarkdown = lazy(() => import('react-markdown'));

function MarkdownEditor({ value, onChange, placeholder = 'Add a description...' }) {
  const [isPreview, setIsPreview] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  // Debounced save
  const debouncedSave = useDebouncedCallback((newValue) => {
    onChange(newValue);
  }, 500);

  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    debouncedSave(newValue);
  }, [debouncedSave]);

  // Sync local value when external value changes
  if (value !== localValue && !document.activeElement?.classList?.contains('markdown-textarea')) {
    setLocalValue(value);
  }

  return (
    <div className="markdown-editor">
      <div className="markdown-toolbar">
        <button
          className={!isPreview ? 'active' : ''}
          onClick={() => setIsPreview(false)}
        >
          Edit
        </button>
        <button
          className={isPreview ? 'active' : ''}
          onClick={() => setIsPreview(true)}
        >
          Preview
        </button>
      </div>

      {isPreview ? (
        <div className="markdown-preview">
          <Suspense fallback={<div>Loading preview...</div>}>
            {localValue ? (
              <ReactMarkdown>{localValue}</ReactMarkdown>
            ) : (
              <span style={{ color: 'var(--text-muted)' }}>No description</span>
            )}
          </Suspense>
        </div>
      ) : (
        <textarea
          className="markdown-textarea"
          value={localValue}
          onChange={handleChange}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}

export default memo(MarkdownEditor);
