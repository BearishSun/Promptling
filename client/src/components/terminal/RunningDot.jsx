import { memo, useMemo } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import { useProjects } from '../../context/ProjectProvider';

function RunningDot({ entityId }) {
  const { terminals } = useTerminals();
  const { activeProjectId } = useProjects();

  const hasRunning = useMemo(() => {
    for (const [, t] of terminals) {
      if (!t.exited && t.projectId === activeProjectId && (t.itemId === entityId || t.taskId === entityId)) {
        return true;
      }
    }
    return false;
  }, [terminals, entityId, activeProjectId]);

  if (!hasRunning) return null;
  return <span className="action-running-dot" />;
}

export default memo(RunningDot);
