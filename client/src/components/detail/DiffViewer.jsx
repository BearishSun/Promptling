import { memo, useMemo } from 'react';
import * as Diff from 'diff';

function DiffViewer({ oldContent, newContent, oldLabel, newLabel, contextLines = 3, viewMode = 'unified' }) {
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

  if (hunks.length === 0) {
    return (
      <div className="diff-empty-message">
        No changes between {oldLabel} and {newLabel}
      </div>
    );
  }

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
                {buildSplitSide(hunk.lines, 'left')}
              </div>
              <div className="diff-split-side diff-split-right">
                {buildSplitSide(hunk.lines, 'right')}
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
            {hunk.lines.map((line, li) => (
              <div key={li} className={`diff-line diff-line-${line.type}`}>
                <span className="diff-line-num diff-line-num-old">{line.oldLine ?? ''}</span>
                <span className="diff-line-num diff-line-num-new">{line.newLine ?? ''}</span>
                <span className="diff-line-prefix">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                <span className="diff-line-content">{line.content}</span>
              </div>
            ))}
          </div>
          {hunk.gapAfter > 0 && (
            <div className="diff-separator">{hunk.gapAfter} lines hidden</div>
          )}
        </div>
      ))}
    </div>
  );
}

function buildSplitSide(lines, side) {
  const result = [];
  // For split view: left shows remove+context, right shows add+context
  // We need to pair them up properly
  const removes = [];
  const adds = [];
  const flush = () => {
    const max = Math.max(removes.length, adds.length);
    for (let i = 0; i < max; i++) {
      if (side === 'left') {
        const line = removes[i];
        if (line) {
          result.push(
            <div key={result.length} className="diff-line diff-line-remove">
              <span className="diff-line-num">{line.oldLine ?? ''}</span>
              <span className="diff-line-prefix">-</span>
              <span className="diff-line-content">{line.content}</span>
            </div>
          );
        } else {
          result.push(<div key={result.length} className="diff-line diff-line-pad"><span className="diff-line-num"></span><span className="diff-line-prefix"></span><span className="diff-line-content"></span></div>);
        }
      } else {
        const line = adds[i];
        if (line) {
          result.push(
            <div key={result.length} className="diff-line diff-line-add">
              <span className="diff-line-num">{line.newLine ?? ''}</span>
              <span className="diff-line-prefix">+</span>
              <span className="diff-line-content">{line.content}</span>
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
      result.push(
        <div key={result.length} className="diff-line diff-line-context">
          <span className="diff-line-num">{side === 'left' ? (line.oldLine ?? '') : (line.newLine ?? '')}</span>
          <span className="diff-line-prefix"> </span>
          <span className="diff-line-content">{line.content}</span>
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
