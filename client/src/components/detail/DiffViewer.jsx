import { memo, useMemo, useState, useRef, useEffect } from 'react';
import * as Diff from 'diff';

function DiffViewer({ oldContent, newContent, oldLabel, newLabel, contextLines = 3, viewMode = 'unified', commentMode = false, comments, onAddComment, onLineClick }) {
  const [activeLineKey, setActiveLineKey] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (activeLineKey !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeLineKey]);

  const hunks = useMemo(() => {
    const old = oldContent || '';
    const cur = newContent || '';
    const parts = Diff.diffLines(old, cur);

    // Build line-level entries
    const lines = [];
    let oldLine = 1;
    let newLine = 1;

    for (const part of parts) {
      const partLines = part.value.replace(/\n$/, '').split('\n');
      // Handle empty string from trailing newline split
      if (part.value === '' || (partLines.length === 1 && partLines[0] === '' && part.value === '\n')) {
        if (part.added) {
          lines.push({ type: 'add', content: '', oldLine: null, newLine: newLine++ });
        } else if (part.removed) {
          lines.push({ type: 'remove', content: '', oldLine: oldLine++, newLine: null });
        } else {
          lines.push({ type: 'context', content: '', oldLine: oldLine++, newLine: newLine++ });
        }
        continue;
      }

      for (const line of partLines) {
        if (part.added) {
          lines.push({ type: 'add', content: line, oldLine: null, newLine: newLine++ });
        } else if (part.removed) {
          lines.push({ type: 'remove', content: line, oldLine: oldLine++, newLine: null });
        } else {
          lines.push({ type: 'context', content: line, oldLine: oldLine++, newLine: newLine++ });
        }
      }
    }

    // Find changed regions and build hunks with context
    const changedIndices = new Set();
    lines.forEach((line, i) => {
      if (line.type !== 'context') changedIndices.add(i);
    });

    if (changedIndices.size === 0) return [];

    // Expand context around changes
    const visibleIndices = new Set();
    for (const idx of changedIndices) {
      for (let i = Math.max(0, idx - contextLines); i <= Math.min(lines.length - 1, idx + contextLines); i++) {
        visibleIndices.add(i);
      }
    }

    // Group into contiguous hunks
    const sorted = [...visibleIndices].sort((a, b) => a - b);
    const result = [];
    let currentHunk = [];
    let prevIdx = -2;

    for (const idx of sorted) {
      if (idx > prevIdx + 1 && currentHunk.length > 0) {
        result.push({ lines: currentHunk, gapAfter: idx - prevIdx - 1 });
        currentHunk = [];
      }
      currentHunk.push(lines[idx]);
      prevIdx = idx;
    }
    if (currentHunk.length > 0) {
      result.push({ lines: currentHunk, gapAfter: 0 });
    }

    // The gap before the first hunk
    if (sorted[0] > 0) {
      result[0].gapBefore = sorted[0];
    }

    return result;
  }, [oldContent, newContent, contextLines]);

  const getLineCommentInfo = (line) => {
    if (!commentMode) return { key: null, lineLabel: '', sortKey: 0 };
    if (line.type === 'add') {
      return { key: `new:${line.newLine}`, lineLabel: `Line ${line.newLine} (+)`, sortKey: line.newLine };
    } else if (line.type === 'remove') {
      return { key: `old:${line.oldLine}`, lineLabel: `Line ${line.oldLine} (-)`, sortKey: line.oldLine };
    } else if (line.type === 'context') {
      return { key: `new:${line.newLine}`, lineLabel: `Line ${line.newLine}`, sortKey: line.newLine };
    }
    return { key: null, lineLabel: '', sortKey: 0 };
  };

  const handleDiffLineClick = (line) => {
    if (!commentMode || line.type === 'pad') return;
    const { key, lineLabel, sortKey } = getLineCommentInfo(line);
    if (!key) return;

    if (comments && comments.has(key)) {
      // Already has comment - remove it
      if (onAddComment) {
        // Use onLineClick for removal indication, then parent handles
      }
    }
    setActiveLineKey(key);
    setInputValue('');
    if (onLineClick) {
      onLineClick(key, line.content, lineLabel, sortKey);
    }
  };

  const handleInputSubmit = (key, line) => {
    if (!inputValue.trim()) {
      setActiveLineKey(null);
      return;
    }
    const { lineLabel, sortKey } = getLineCommentInfo(line);
    if (onAddComment) {
      onAddComment(key, line.content, inputValue.trim(), lineLabel, sortKey);
    }
    setActiveLineKey(null);
    setInputValue('');
  };

  const handleInputKeyDown = (e, key, line) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit(key, line);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setActiveLineKey(null);
      setInputValue('');
    }
  };

  const isLineCommented = (line) => {
    if (!commentMode || !comments) return false;
    const { key } = getLineCommentInfo(line);
    return key && comments.has(key);
  };

  if (hunks.length === 0) {
    return (
      <div className="diff-empty-message">
        No changes between {oldLabel} and {newLabel}
      </div>
    );
  }

  const renderInlineInput = (key, line) => {
    if (!commentMode || activeLineKey !== key) return null;
    return (
      <div className="plan-line-input-row diff-comment-input-row">
        <span className="diff-line-num"></span>
        <span className="diff-line-num"></span>
        <input
          ref={inputRef}
          className="plan-line-input"
          type="text"
          placeholder="Add a comment..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => handleInputKeyDown(e, key, line)}
          onBlur={() => {
            setTimeout(() => {
              setActiveLineKey(null);
              setInputValue('');
            }, 150);
          }}
        />
      </div>
    );
  };

  if (viewMode === 'split') {
    return (
      <div className="diff-viewer">
        <div className="diff-header-labels">
          <span className="diff-header-label diff-header-old">{oldLabel}</span>
          <span className="diff-header-label diff-header-new">{newLabel}</span>
        </div>
        {hunks.map((hunk, hi) => (
          <div key={hi}>
            {hi === 0 && hunk.gapBefore > 0 && (
              <div className="diff-separator">{hunk.gapBefore} lines hidden</div>
            )}
            <div className="diff-hunk diff-split-hunk">
              <div className="diff-split-side diff-split-left">
                {buildSplitSide(hunk.lines, 'left', commentMode, comments, (line) => handleDiffLineClick(line), getLineCommentInfo, isLineCommented, activeLineKey, inputValue, setInputValue, setActiveLineKey, onAddComment, inputRef)}
              </div>
              <div className="diff-split-side diff-split-right">
                {buildSplitSide(hunk.lines, 'right', commentMode, comments, (line) => handleDiffLineClick(line), getLineCommentInfo, isLineCommented, activeLineKey, inputValue, setInputValue, setActiveLineKey, onAddComment, inputRef)}
              </div>
            </div>
            {hunk.gapAfter > 0 && (
              <div className="diff-separator">{hunk.gapAfter} lines hidden</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Unified view
  return (
    <div className="diff-viewer">
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          {hi === 0 && hunk.gapBefore > 0 && (
            <div className="diff-separator">{hunk.gapBefore} lines hidden</div>
          )}
          <div className="diff-hunk">
            {hunk.lines.map((line, li) => {
              const { key } = getLineCommentInfo(line);
              const commented = isLineCommented(line);
              return (
                <div key={li}>
                  <div
                    className={`diff-line diff-line-${line.type}${commented ? ' plan-line-commented' : ''}${commentMode && line.type !== 'pad' ? ' diff-line-clickable' : ''}`}
                    onClick={() => handleDiffLineClick(line)}
                  >
                    <span className="diff-line-num diff-line-num-old">{line.oldLine ?? ''}</span>
                    <span className="diff-line-num diff-line-num-new">{line.newLine ?? ''}</span>
                    <span className="diff-line-prefix">
                      {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                    </span>
                    <span className="diff-line-content">{line.content}</span>
                                      </div>
                  {renderInlineInput(key, line)}
                </div>
              );
            })}
          </div>
          {hunk.gapAfter > 0 && (
            <div className="diff-separator">{hunk.gapAfter} lines hidden</div>
          )}
        </div>
      ))}
    </div>
  );
}

function buildSplitSide(lines, side, commentMode, comments, onLineClick, getLineCommentInfo, isLineCommented, activeLineKey, inputValue, setInputValue, setActiveLineKey, onAddComment, inputRef) {
  const result = [];
  const removes = [];
  const adds = [];

  const renderSplitInlineInput = (key, line) => {
    if (!commentMode || activeLineKey !== key) return null;
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (inputValue.trim() && onAddComment) {
          const info = getLineCommentInfo(line);
          onAddComment(key, line.content, inputValue.trim(), info.lineLabel, info.sortKey);
        }
        setActiveLineKey(null);
        setInputValue('');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setActiveLineKey(null);
        setInputValue('');
      }
    };

    return (
      <div key={`input-${key}`} className="plan-line-input-row diff-comment-input-row">
        <span className="diff-line-num"></span>
        <input
          ref={inputRef}
          className="plan-line-input"
          type="text"
          placeholder="Add a comment..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setTimeout(() => {
              setActiveLineKey(null);
              setInputValue('');
            }, 150);
          }}
        />
      </div>
    );
  };

  const flush = () => {
    const max = Math.max(removes.length, adds.length);
    for (let i = 0; i < max; i++) {
      if (side === 'left') {
        const line = removes[i];
        if (line) {
          const { key } = getLineCommentInfo(line);
          const commented = isLineCommented(line);
          result.push(
            <div key={result.length}>
              <div
                className={`diff-line diff-line-remove${commented ? ' plan-line-commented' : ''}${commentMode ? ' diff-line-clickable' : ''}`}
                onClick={() => commentMode && onLineClick(line)}
              >
                <span className="diff-line-num">{line.oldLine ?? ''}</span>
                <span className="diff-line-prefix">-</span>
                <span className="diff-line-content">{line.content}</span>
                              </div>
              {renderSplitInlineInput(key, line)}
            </div>
          );
        } else {
          result.push(<div key={result.length} className="diff-line diff-line-pad"><span className="diff-line-num"></span><span className="diff-line-prefix"></span><span className="diff-line-content"></span></div>);
        }
      } else {
        const line = adds[i];
        if (line) {
          const { key } = getLineCommentInfo(line);
          const commented = isLineCommented(line);
          result.push(
            <div key={result.length}>
              <div
                className={`diff-line diff-line-add${commented ? ' plan-line-commented' : ''}${commentMode ? ' diff-line-clickable' : ''}`}
                onClick={() => commentMode && onLineClick(line)}
              >
                <span className="diff-line-num">{line.newLine ?? ''}</span>
                <span className="diff-line-prefix">+</span>
                <span className="diff-line-content">{line.content}</span>
                              </div>
              {renderSplitInlineInput(key, line)}
            </div>
          );
        } else {
          result.push(<div key={result.length} className="diff-line diff-line-pad"><span className="diff-line-num"></span><span className="diff-line-prefix"></span><span className="diff-line-content"></span></div>);
        }
      }
    }
    removes.length = 0;
    adds.length = 0;
  };

  for (const line of lines) {
    if (line.type === 'context') {
      flush();
      const { key } = getLineCommentInfo(line);
      const commented = isLineCommented(line);
      result.push(
        <div key={result.length}>
          <div
            className={`diff-line diff-line-context${commented ? ' plan-line-commented' : ''}${commentMode ? ' diff-line-clickable' : ''}`}
            onClick={() => commentMode && onLineClick(line)}
          >
            <span className="diff-line-num">{side === 'left' ? (line.oldLine ?? '') : (line.newLine ?? '')}</span>
            <span className="diff-line-prefix"> </span>
            <span className="diff-line-content">{line.content}</span>
                      </div>
          {renderSplitInlineInput(key, line)}
        </div>
      );
    } else if (line.type === 'remove') {
      removes.push(line);
    } else if (line.type === 'add') {
      adds.push(line);
    }
  }
  flush();

  return result;
}

export default memo(DiffViewer);
