import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import { useProjects } from '../../context/ProjectProvider';
import TerminalPanel from './TerminalPanel';

const STORAGE_KEY = 'terminalColumnWidth';
const MIN_WIDTH = 300;
const MAX_WIDTH_RATIO = 0.7; // max 70% of viewport
const MIN_PANEL_HEIGHT = 60; // minimum panel height in pixels

function TerminalColumn() {
  const { terminals } = useTerminals();
  const { activeProjectId } = useProjects();
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Math.max(MIN_WIDTH, parseInt(saved, 10) || 500) : 500;
  });
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const widthRef = useRef(width);
  widthRef.current = width;

  // Panel height resize state
  const [flexGrows, setFlexGrows] = useState({});
  const flexGrowsRef = useRef(flexGrows);
  flexGrowsRef.current = flexGrows;
  const panelDragRef = useRef(null);

  // Only show terminals belonging to the active project
  const terminalIds = useMemo(() => {
    const ids = [];
    for (const [id, t] of terminals) {
      if (t.projectId === activeProjectId) ids.push(id);
    }
    return ids;
  }, [terminals, activeProjectId]);

  // Persist width
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(width));
  }, [width]);

  // Sync CSS variable for detail panel positioning
  const appLayoutRef = useRef(null);
  useEffect(() => {
    // Cache the element once to avoid stale references in cleanup
    if (!appLayoutRef.current) {
      appLayoutRef.current = document.querySelector('.app-layout');
    }
    const el = appLayoutRef.current;
    if (el) {
      el.style.setProperty('--terminal-column-width', `${width}px`);
    }
    return () => {
      if (el) {
        el.style.removeProperty('--terminal-column-width');
      }
    };
  }, [width]);

  // Re-clamp width when window resizes
  useEffect(() => {
    const handleWindowResize = () => {
      const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
      setWidth(prev => prev > maxWidth ? Math.max(MIN_WIDTH, maxWidth) : prev);
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Column width resize
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = widthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Panel height resize start
  const handlePanelResizeStart = useCallback((e, aboveId, belowId) => {
    e.preventDefault();
    const contentEl = e.currentTarget.parentElement;
    const aboveEl = contentEl.querySelector(`[data-terminal-id="${aboveId}"]`);
    const belowEl = contentEl.querySelector(`[data-terminal-id="${belowId}"]`);
    if (!aboveEl || !belowEl) return;

    const flexA = flexGrowsRef.current[aboveId] ?? 1;
    const flexB = flexGrowsRef.current[belowId] ?? 1;

    panelDragRef.current = {
      aboveId,
      belowId,
      startY: e.clientY,
      startHeightA: aboveEl.getBoundingClientRect().height,
      startHeightB: belowEl.getBoundingClientRect().height,
      totalFlex: flexA + flexB,
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      // Column width drag
      if (isDragging.current) {
        const delta = startX.current - e.clientX;
        const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
        const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth.current + delta));
        setWidth(newWidth);
        return;
      }
      // Panel height drag
      if (panelDragRef.current) {
        const { aboveId, belowId, startY, startHeightA, startHeightB, totalFlex } = panelDragRef.current;
        const delta = e.clientY - startY;
        const totalHeight = startHeightA + startHeightB;

        const newHeightA = Math.max(MIN_PANEL_HEIGHT, Math.min(totalHeight - MIN_PANEL_HEIGHT, startHeightA + delta));
        const newHeightB = totalHeight - newHeightA;

        setFlexGrows(prev => ({
          ...prev,
          [aboveId]: (newHeightA / totalHeight) * totalFlex,
          [belowId]: (newHeightB / totalHeight) * totalFlex,
        }));
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      if (panelDragRef.current) {
        panelDragRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (terminalIds.length === 0) return null;

  // Build render items with resize handles between non-minimized panels
  const items = [];
  let prevNonMinId = null;

  for (const id of terminalIds) {
    const t = terminals.get(id);
    const isMinimized = t?.minimized;

    if (!isMinimized && prevNonMinId !== null) {
      const above = prevNonMinId;
      items.push(
        <div
          key={`resize-${above}-${id}`}
          className="terminal-panel-resize-handle"
          onMouseDown={(e) => handlePanelResizeStart(e, above, id)}
        />
      );
    }

    items.push(
      <TerminalPanel
        key={id}
        terminalId={id}
        flexGrow={!isMinimized ? (flexGrows[id] ?? 1) : undefined}
      />
    );

    if (!isMinimized) prevNonMinId = id;
  }

  return (
    <div className="terminal-column" style={{ width: `${width}px` }}>
      <div className="terminal-column-resize-handle" onMouseDown={handleMouseDown} />
      <div className="terminal-column-content">
        {items}
      </div>
    </div>
  );
}

export default memo(TerminalColumn);
