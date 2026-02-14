import { memo, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as Diff from 'diff';

function RenderedDiffViewer({ oldContent, newContent, oldLabel, newLabel }) {
  const contentRef = useRef(null);

  const { renderBlocks, tocEntries } = useMemo(() => {
    const old = oldContent || '';
    const cur = newContent || '';
    const parts = Diff.diffLines(old, cur);

    // Group adjacent removed+added into "modified" pairs
    const sections = [];
    let i = 0;
    while (i < parts.length) {
      const part = parts[i];
      if (part.removed && i + 1 < parts.length && parts[i + 1].added) {
        sections.push({
          type: 'modified',
          removed: part.value,
          added: parts[i + 1].value,
          id: `rendered-section-${sections.length}`
        });
        i += 2;
      } else if (part.added) {
        sections.push({ type: 'added', value: part.value, id: `rendered-section-${sections.length}` });
        i++;
      } else if (part.removed) {
        sections.push({ type: 'removed', value: part.value, id: `rendered-section-${sections.length}` });
        i++;
      } else {
        sections.push({ type: 'context', value: part.value, id: `rendered-section-${sections.length}` });
        i++;
      }
    }

    // Build TOC entries from changed sections
    const tocEntries = [];
    for (const section of sections) {
      if (section.type === 'context') continue;
      const text = section.type === 'modified' ? section.added : section.value;
      const label = extractLabel(text);
      tocEntries.push({ id: section.id, label, type: section.type });
    }

    // Flatten sections into annotated lines, then build render blocks
    // that merge code fences into single <pre> elements with per-line coloring
    const annotatedLines = flattenSections(sections);
    const renderBlocks = buildRenderBlocks(annotatedLines);

    return { renderBlocks, tocEntries };
  }, [oldContent, newContent]);

  const handleTocClick = useCallback((id) => {
    const el = document.getElementById(id);
    if (el && contentRef.current) {
      contentRef.current.scrollTo({
        top: el.offsetTop - contentRef.current.offsetTop - 12,
        behavior: 'smooth'
      });
    }
  }, []);

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

  return (
    <div className="rendered-diff-viewer">
      {tocEntries.length > 0 && (
        <div className="rendered-diff-toc">
          <div className="rendered-diff-toc-title">Changes</div>
          {tocEntries.map((entry) => (
            <button
              key={entry.id}
              className="rendered-diff-toc-entry"
              onClick={() => handleTocClick(entry.id)}
              title={entry.label}
            >
              <span className={`rendered-diff-toc-dot rendered-diff-toc-dot--${entry.type}`} />
              <span className="rendered-diff-toc-label">{entry.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="rendered-diff-content" ref={contentRef}>
        <RenderBlocks blocks={renderBlocks} />
      </div>
    </div>
  );
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
 *
 * Code blocks that span multiple diff sections become a single block
 * with per-line diff annotations for coloring.
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
        continue; // don't render the fence line itself
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
      // Inside code block - check for closing fence
      const closeRegex = new RegExp('^' + fence[0] + '{' + fence.length + ',}\\s*$');
      if (closeRegex.test(trimmed)) {
        inCode = false;
        flush();
        continue; // don't render the closing fence
      }

      // Add line to code block
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
 * Render all blocks. Detects adjacent removed+added markdown blocks
 * from the same section and wraps them as a "modified" pair.
 * Uses a Set to ensure each section ID anchor appears only once.
 */
function RenderBlocks({ blocks }) {
  const elements = [];
  const usedIds = new Set();
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i];

    if (block.type === 'code') {
      elements.push(
        <CodeBlock key={`block-${i}`} block={block} usedIds={usedIds} />
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
            <div className="rendered-diff-section rendered-diff-section-removed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {block.lines.join('\n')}
              </ReactMarkdown>
            </div>
            <div className="rendered-diff-section rendered-diff-section-added">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
    const anchorId = isChanged && !usedIds.has(block.sectionId) ? block.sectionId : undefined;
    if (anchorId) usedIds.add(block.sectionId);

    elements.push(
      <div
        key={`block-${i}`}
        id={anchorId}
        className={`rendered-diff-section rendered-diff-section-${block.diffType}`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
 */
function CodeBlock({ block, usedIds }) {
  const hasChanges = block.lines.some(l => l.diffType !== 'context');

  return (
    <div className={`rendered-diff-codeblock${hasChanges ? ' rendered-diff-codeblock--changed' : ''}`}>
      <pre>
        <code>
          {block.lines.map((line, i) => {
            let anchorId = undefined;
            if (line.diffType !== 'context' && !usedIds.has(line.sectionId)) {
              usedIds.add(line.sectionId);
              anchorId = line.sectionId;
            }
            return (
              <div
                key={i}
                id={anchorId}
                className={`rendered-diff-codeline rendered-diff-codeline--${line.diffType}`}
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

/**
 * Extract a label from a section's text for the TOC.
 * Prefers the first heading, otherwise takes the first non-empty line.
 */
function extractLabel(text) {
  if (!text) return 'Change';
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)/);
    if (headingMatch) {
      return headingMatch[1].slice(0, 50);
    }
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      if (trimmed.match(/^(`{3,}|~{3,})/)) continue;
      const cleaned = trimmed
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1');
      return cleaned.slice(0, 50) + (cleaned.length > 50 ? '...' : '');
    }
  }
  return 'Change';
}

export default memo(RenderedDiffViewer);
