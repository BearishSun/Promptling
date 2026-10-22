import { useEffect, useRef } from 'react';
import tasksApi from '../services/api';

const POLL_INTERVAL_MS = 3000;

/**
 * Watches the active project's revision marker and fires `onChange` whenever
 * the data moves - typically an MCP write from Claude Code creating a
 * feature/item/task, or another browser tab making an edit.
 *
 * Polls a tiny endpoint rather than refetching the whole project, so the cost
 * of watching is a single stat() per tick.
 */
export function useRevisionPolling(onChange) {
  const callbackRef = useRef(onChange);
  const revisionRef = useRef(null);
  const inFlightRef = useRef(false);
  const pointerDownRef = useRef(false);

  useEffect(() => {
    callbackRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const handlePointerDown = () => { pointerDownRef.current = true; };
    const handlePointerUp = () => { pointerDownRef.current = false; };

    const check = async () => {
      // Hold off mid-drag - swapping the list out from under the pointer would
      // break the drag. Background tabs don't need updating until they return.
      if (inFlightRef.current || pointerDownRef.current || document.hidden) return;

      inFlightRef.current = true;
      try {
        const revision = await tasksApi.getRevision();
        if (revisionRef.current === null) {
          // First sample just establishes the baseline
          revisionRef.current = revision;
        } else if (revision !== revisionRef.current) {
          revisionRef.current = revision;
          await callbackRef.current();
        }
      } catch {
        // Server restarting or offline - retry on the next tick
      } finally {
        inFlightRef.current = false;
      }
    };

    // Catch up right away when the tab regains focus
    const handleVisibility = () => { if (!document.hidden) check(); };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    document.addEventListener('visibilitychange', handleVisibility);

    check();
    const intervalId = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);
}
