import { memo, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import { useProjects } from '../../context/ProjectProvider';
import TerminalPanel from './TerminalPanel';

const STORAGE_KEY = 'terminalColumnWidth';
const MIN_WIDTH = 300;
const MAX_WIDTH_RATIO = 0.7; // max 70% of viewport

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

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = widthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      const maxWidth = window.innerWidth * MAX_WIDTH_RATIO;
      const newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (terminalIds.length === 0) return null;

  return (
    <div className="terminal-column" style={{ width: `${width}px` }}>
      <div className="terminal-column-resize-handle" onMouseDown={handleMouseDown} />
      <div className="terminal-column-content">
        {terminalIds.map(id => (
          <TerminalPanel key={id} terminalId={id} />
        ))}
      </div>
    </div>
  );
}

export default memo(TerminalColumn);
