import { useEffect, useRef } from 'react';
import tasksApi from '../services/api';

const POLL_INTERVAL_MS = 4000;

export function usePlanPolling(itemType, itemId, knownVersionCount, onNewVersions) {
  const knownCountRef = useRef(knownVersionCount);
  const callbackRef = useRef(onNewVersions);

  // Keep refs in sync so the interval closure always sees the latest values
  useEffect(() => {
    knownCountRef.current = knownVersionCount;
  }, [knownVersionCount]);

  useEffect(() => {
    callbackRef.current = onNewVersions;
  }, [onNewVersions]);

  useEffect(() => {
    if (!itemType || !itemId) return;

    const poll = async () => {
      try {
        const response = await tasksApi.getPlanVersions(itemType, itemId);
        const versions = response.versions || [];
        if (versions.length !== knownCountRef.current) {
          callbackRef.current(versions);
        }
      } catch (error) {
        // Silently ignore polling errors
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [itemType, itemId]);
}
