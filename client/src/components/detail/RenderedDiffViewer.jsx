import { memo, useMemo, useRef, useCallback, useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Diff from 'diff';

// Stable annotatable component factories (same pattern as PlanCommentViewer)
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

function countLines(text) {
  return text.replace(/\n$/, '').split('\n').length;
}

function RenderedDiffViewer({
  oldContent,
  newContent,
  oldLabel,
  newLabel,
  viewMode = 'unified',
  commentMode = false,
  comments,
  onAddComment,
  onRemoveComment
}) {
  const contentRef = useRef(null);
  const inputRef = useRef(null);
  const [activeLine, setActiveLine] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [inputPos, setInputPos] = useState(null);

  const { sections, sectionMap, renderBlocks, newContentLines } = useMemo(() => {
    const old = oldContent || '';
    const cur = newContent || '';
    const parts = Diff.diffLines(old, cur);
    const newContentLines = cur.split('\n');

    // Group adjacent removed+added into "modified" pairs
    // Track newLine to know where each section maps in the new content
    const sections = [];
    let i = 0;
    let newLine = 1;
    while (i < parts.length) {
      const part = parts[i];
      if (part.removed && i + 1 < parts.length && parts[i + 1].added) {
        const addedLineCount = countLines(parts[i + 1].value);
        sections.push({
          type: 'modified',
          removed: part.value,
          added: parts[i + 1].value,
          id: `rendered-section-${sections.length}`,
          newStartLine: newLine
        });
        newLine += addedLineCount;
        i += 2;
      } else if (part.added) {
        const lineCount = countLines(part.value);
        sections.push({
          type: 'added',
          value: part.value,
          id: `rendered-section-${sections.length}`,
          newStartLine: newLine
        });
        newLine += lineCount;
        i++;
      } else if (part.removed) {
        sections.push({
          type: 'removed',
          value: part.value,
          id: `rendered-section-${sections.length}`,
          newStartLine: null
        });
        i++;
      } else {
        const lineCount = countLines(part.value);
        sections.push({
          type: 'context',
          value: part.value,
          id: `rendered-section-${sections.length}`,
          newStartLine: newLine
        });
        newLine += lineCount;
        i++;
      }
    }

    // Build sectionMap for quick lookup by ID
    const sectionMap = {};
    for (const section of sections) {
      sectionMap[section.id] = section;
    }

    // Flatten sections into annotated lines, then build render blocks
    const annotatedLines = flattenSections(sections);
    const renderBlocks = buildRenderBlocks(annotatedLines);

    return { sections, sectionMap, renderBlocks, newContentLines };
  }, [oldContent, newContent]);

  // Sync comment highlights onto the DOM
  useEffect(() => {
    const container = contentRef.current;
    if (!container || !commentMode) return;
    container.querySelectorAll('[data-source-line]').forEach(el => {
      const sectionId = el.closest('[data-section-id]')?.dataset.sectionId;
      const localLine = el.dataset.sourceLine;
      if (!sectionId || !localLine) return;
      const key = `${sectionId}:${localLine}`;
      el.classList.toggle('plan-line-commented', comments ? comments.has(key) : false);
    });
  }, [comments, commentMode]);

  // Focus input when it appears
  useEffect(() => {
    if (activeLine !== null && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeLine]);

  // Event-delegated click handler for commenting
  const handleContentClick = useCallback((e) => {
    if (!commentMode) return;
    if (e.target.classList.contains('plan-line-input')) return;

    const block = e.target.closest('[data-source-line]');
    if (!block) return;

    const sectionContainer = block.closest('[data-section-id]');
    if (!sectionContainer) return;

    const sectionId = sectionContainer.dataset.sectionId;
    const diffType = sectionContainer.dataset.diffType || 'context';
    const localLine = block.dataset.sourceLine;
    if (!localLine) return;

    // Don't allow commenting on removed sections
    if (diffType === 'removed') return;

    const key = `${sectionId}:${localLine}`;

    if (comments && comments.has(key)) {
      if (onRemoveComment) onRemoveComment(key);
      return;
    }

    // Position the input just below the clicked block
    const containerEl = contentRef.current;
    const blockRect = block.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();
    setInputPos({
      top: blockRect.bottom - containerRect.top + containerEl.scrollTop,
      left: 0,
      width: '100%',
    });
    setActiveLine(key);
    setInputValue('');
  }, [commentMode, comments, onRemoveComment]);

  const handleSubmit = useCallback(() => {
    if (!inputValue.trim() || activeLine === null) {
      setActiveLine(null);
      return;
    }
    // Key format: sectionId:localLine
    const colonIdx = activeLine.lastIndexOf(':');
    const sectionId = activeLine.slice(0, colonIdx);
    const localLine = parseInt(activeLine.slice(colonIdx + 1), 10);

    // Look up section to get the new plan line number
    const section = sectionMap[sectionId];
    const newStartLine = section?.newStartLine;
    if (newStartLine == null) {
      // Should not happen since we block removed sections, but guard anyway
      setActiveLine(null);
      return;
    }

    const newPlanLine = newStartLine + localLine - 1;
    const lineLabel = `Line ${newPlanLine}`;
    const lineText = newContentLines[newPlanLine - 1] || '';
    const sortKey = newPlanLine;

    if (onAddComment) {
      onAddComment(activeLine, lineText, inputValue.trim(), lineLabel, sortKey);
    }
    setActiveLine(null);
    setInputValue('');
  }, [inputValue, activeLine, onAddComment, sectionMap, newContentLines]);

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

  const hasChanges = renderBlocks.some(b => {
    if (b.type === 'code') return b.lines.some(l => l.diffType !== 'context');
    return b.diffType !== 'context';
  });

  if (renderBlocks.length === 0 || !hasChanges) {
    return (
      <div className="diff-empty-message">
        No changes between {oldLabel} and {newLabel}
      </div>
    );
  }

  const commentingClass = commentMode ? ' rendered-diff-viewer--commenting' : '';

  // Split view
  if (viewMode === 'split') {
    return (
      <div className={`rendered-diff-viewer${commentingClass}`}>
        <div className="rendered-diff-content" ref={contentRef} onClick={handleContentClick}>
          <div className="rendered-diff-split-container">
            <div className="rendered-diff-split-panel rendered-diff-split-panel--old">
              <div className="rendered-diff-split-label">{oldLabel}</div>
              <SplitPanelBlocks sections={sections} side="old" commentMode={commentMode} />
            </div>
            <div className="rendered-diff-split-panel rendered-diff-split-panel--new">
              <div className="rendered-diff-split-label">{newLabel}</div>
              <SplitPanelBlocks sections={sections} side="new" commentMode={commentMode} />
            </div>
          </div>
          {commentMode && activeLine !== null && inputPos && (
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
      </div>
    );
  }

  // Unified view (default)
  return (
    <div className={`rendered-diff-viewer${commentingClass}`}>
      <div className="rendered-diff-content" ref={contentRef} onClick={handleContentClick}>
        <RenderBlocks blocks={renderBlocks} commentMode={commentMode} />
        {commentMode && activeLine !== null && inputPos && (
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
    </div>
  );
}

/**
 * Split view panel blocks - renders one side of the split view.
 * Only passes annotatableComponents to non-removed sections (commenting is
 * disabled on removed content since it doesn't exist in the new plan).
 */
function SplitPanelBlocks({ sections, side, commentMode }) {
  // Only annotate sections that exist in the new plan
  const components = commentMode ? annotatableComponents : undefined;

  return sections.map((section) => {
    if (section.type === 'context') {
      return (
        <div
          key={section.id}
          id={side === 'new' ? section.id : undefined}
          className="rendered-diff-section rendered-diff-section-context"
          data-section-id={section.id}
          data-diff-type="context"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {section.value}
          </ReactMarkdown>
        </div>
      );
    }
    if (section.type === 'added') {
      if (side === 'old') {
        return <div key={section.id} className="rendered-diff-split-spacer" />;
      }
      return (
        <div
          key={section.id}
          id={section.id}
          className="rendered-diff-section rendered-diff-section-added"
          data-section-id={section.id}
          data-diff-type="added"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {section.value}
          </ReactMarkdown>
        </div>
      );
    }
    if (section.type === 'removed') {
      if (side === 'new') {
        return <div key={section.id} className="rendered-diff-split-spacer" />;
      }
      return (
        <div
          key={section.id}
          id={section.id}
          className="rendered-diff-section rendered-diff-section-removed"
          data-section-id={section.id}
          data-diff-type="removed"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {section.value}
          </ReactMarkdown>
        </div>
      );
    }
    if (section.type === 'modified') {
      if (side === 'old') {
        return (
          <div
            key={section.id}
            id={section.id}
            className="rendered-diff-section rendered-diff-section-removed"
            data-section-id={section.id}
            data-diff-type="removed"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {section.removed}
            </ReactMarkdown>
          </div>
        );
      }
      return (
        <div
          key={section.id}
          className="rendered-diff-section rendered-diff-section-added"
          data-section-id={section.id}
          data-diff-type="added"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {section.added}
          </ReactMarkdown>
        </div>
      );
    }
    return null;
  });
}

/**
 * Flatten sections into individual annotated lines with diff type and section ID.
 */
function flattenSections(sections) {
  const lines = [];
  for (const section of sections) {
    if (section.type === 'modified') {
      for (const line of splitLines(section.removed)) {
        lines.push({ text: line, diffType: 'removed', sectionId: section.id });
      }
      for (const line of splitLines(section.added)) {
        lines.push({ text: line, diffType: 'added', sectionId: section.id });
      }
    } else {
      for (const line of splitLines(section.value || '')) {
        lines.push({ text: line, diffType: section.type, sectionId: section.id });
      }
    }
  }
  return lines;
}

function splitLines(text) {
  return text.replace(/\n$/, '').split('\n');
}

/**
 * Walk annotated lines tracking fenced code block state.
 * Produces render blocks:
 *   - { type: 'markdown', diffType, lines, sectionId }
 *   - { type: 'code', lang, lines: [{text, diffType, sectionId}] }
 */
function buildRenderBlocks(annotatedLines) {
  const blocks = [];
  let inCode = false;
  let fence = '```';
  let currentBlock = null;

  const flush = () => {
    if (currentBlock) {
      blocks.push(currentBlock);
      currentBlock = null;
    }
  };

  for (const line of annotatedLines) {
    const trimmed = line.text.trim();

    if (!inCode) {
      const openMatch = trimmed.match(/^(`{3,}|~{3,})(.*)$/);
      if (openMatch) {
        flush();
        inCode = true;
        fence = openMatch[1];
        const lang = (openMatch[2] || '').trim();
        currentBlock = {
          type: 'code',
          lang,
          lines: [],
          fenceDiffType: line.diffType,
          fenceSectionId: line.sectionId
        };
        continue;
      }

      // Regular markdown line - group consecutive lines with same diffType+sectionId
      if (currentBlock && currentBlock.type === 'markdown' &&
          currentBlock.diffType === line.diffType &&
          currentBlock.sectionId === line.sectionId) {
        currentBlock.lines.push(line.text);
      } else {
        flush();
        currentBlock = {
          type: 'markdown',
          diffType: line.diffType,
          lines: [line.text],
          sectionId: line.sectionId
        };
      }
    } else {
      const closeRegex = new RegExp('^' + fence[0] + '{' + fence.length + ',}\\s*$');
      if (closeRegex.test(trimmed)) {
        inCode = false;
        flush();
        continue;
      }

      if (currentBlock && currentBlock.type === 'code') {
        currentBlock.lines.push({
          text: line.text,
          diffType: line.diffType,
          sectionId: line.sectionId
        });
      }
    }
  }
  flush();
  return blocks;
}

/**
 * Render all blocks (unified view). Detects adjacent removed+added markdown blocks
 * from the same section and wraps them as a "modified" pair.
 * Only passes annotatableComponents to non-removed blocks.
 */
function RenderBlocks({ blocks, commentMode }) {
  const elements = [];
  const usedIds = new Set();
  const components = commentMode ? annotatableComponents : undefined;
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === 'code') {
      elements.push(
        <CodeBlock key={`block-${i}`} block={block} usedIds={usedIds} commentMode={commentMode} />
      );
      i++;
      continue;
    }

    // Markdown block - check for modified pair (removed then added, same section)
    if (block.diffType === 'removed' && i + 1 < blocks.length) {
      const next = blocks[i + 1];
      if (next && next.type === 'markdown' && next.diffType === 'added' &&
          next.sectionId === block.sectionId) {
        const anchorId = !usedIds.has(block.sectionId) ? block.sectionId : undefined;
        if (anchorId) usedIds.add(block.sectionId);
        elements.push(
          <div key={`block-${i}`} id={anchorId} className="rendered-diff-section rendered-diff-section-modified">
            <div
              className="rendered-diff-section rendered-diff-section-removed"
              data-section-id={block.sectionId}
              data-diff-type="removed"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {block.lines.join('\n')}
              </ReactMarkdown>
            </div>
            <div
              className="rendered-diff-section rendered-diff-section-added"
              data-section-id={next.sectionId}
              data-diff-type="added"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {next.lines.join('\n')}
              </ReactMarkdown>
            </div>
          </div>
        );
        i += 2;
        continue;
      }
    }

    // Single markdown block
    const isChanged = block.diffType !== 'context';
    const isRemoved = block.diffType === 'removed';
    const anchorId = isChanged && !usedIds.has(block.sectionId) ? block.sectionId : undefined;
    if (anchorId) usedIds.add(block.sectionId);

    elements.push(
      <div
        key={`block-${i}`}
        id={anchorId}
        className={`rendered-diff-section rendered-diff-section-${block.diffType}`}
        data-section-id={block.sectionId}
        data-diff-type={block.diffType}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={isRemoved ? undefined : components}>
          {block.lines.join('\n')}
        </ReactMarkdown>
      </div>
    );
    i++;
  }

  return elements;
}

/**
 * Render a code block as a single <pre> with per-line diff coloring.
 * Only adds data-source-line to non-removed lines.
 */
function CodeBlock({ block, usedIds, commentMode }) {
  const hasChanges = block.lines.some(l => l.diffType !== 'context');

  return (
    <div
      className={`rendered-diff-codeblock${hasChanges ? ' rendered-diff-codeblock--changed' : ''}`}
      data-section-id={block.fenceSectionId}
      data-diff-type={block.fenceDiffType}
    >
      <pre>
        <code>
          {block.lines.map((line, i) => {
            let anchorId = undefined;
            if (line.diffType !== 'context' && !usedIds.has(line.sectionId)) {
              usedIds.add(line.sectionId);
              anchorId = line.sectionId;
            }
            const isRemoved = line.diffType === 'removed';
            return (
              <div
                key={i}
                id={anchorId}
                className={`rendered-diff-codeline rendered-diff-codeline--${line.diffType}`}
                data-source-line={commentMode && !isRemoved ? i + 1 : undefined}
              >
                {line.text || '\u00A0'}
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

export default memo(RenderedDiffViewer);
