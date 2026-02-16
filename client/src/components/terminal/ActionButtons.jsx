import { memo, useState, useCallback, useMemo } from 'react';
import { useTerminals } from '../../context/TerminalProvider';
import { useProjects } from '../../context/ProjectProvider';
import { PlanIcon, ImplementIcon, BreakdownIcon } from '../shared/icons';
import PromptDialog from './PromptDialog';

const ACTIONS = [
  { key: 'plan', label: 'Plan', Icon: PlanIcon },
  { key: 'implement', label: 'Implement', Icon: ImplementIcon },
  { key: 'breakdown', label: 'Breakdown', Icon: BreakdownIcon },
];

function ActionButtons({ itemId, taskId, itemTitle }) {
  const { terminals } = useTerminals();
  const { activeProjectId } = useProjects();
  const [dialogAction, setDialogAction] = useState(null);

  const entityId = taskId || itemId;

  // Check if there's a running terminal for this entity+action in the current project
  const runningActions = useMemo(() => {
    const running = {};
    for (const [, t] of terminals) {
      if (!t.exited && t.projectId === activeProjectId && (t.itemId === entityId || t.taskId === entityId)) {
        running[t.action] = true;
      }
    }
    return running;
  }, [terminals, entityId, activeProjectId]);

  const hasRunning = ACTIONS.some(a => runningActions[a.key]);

  const handleClick = useCallback((e, action) => {
    e.stopPropagation();
    setDialogAction(action);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogAction(null);
  }, []);

  if (hasRunning) {
    const runningLabels = ACTIONS.filter(a => runningActions[a.key]).map(a => a.label);
    return (
      <span className="action-running-text" onClick={e => e.stopPropagation()}>
        Running {runningLabels.join(', ')}...
      </span>
    );
  }

  return (
    <>
      <div className="action-buttons" onClick={e => e.stopPropagation()}>
        {ACTIONS.map(({ key, label, Icon }) => (
          <button
            key={key}
            className="item-action-icon-btn"
            onClick={(e) => handleClick(e, key)}
            title={label}
          >
            <Icon />
          </button>
        ))}
      </div>

      {dialogAction && (
        <PromptDialog
          action={dialogAction}
          entityId={entityId}
          entityTitle={itemTitle}
          onClose={handleCloseDialog}
        />
      )}
    </>
  );
}

export default memo(ActionButtons);
