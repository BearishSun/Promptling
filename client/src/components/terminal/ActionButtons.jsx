import { memo, useState, useCallback } from 'react';
import { PlanIcon, ImplementIcon, BreakdownIcon } from '../shared/icons';
import PromptDialog from './PromptDialog';

const ACTIONS = [
  { key: 'plan', label: 'Plan', Icon: PlanIcon },
  { key: 'implement', label: 'Implement', Icon: ImplementIcon },
  { key: 'breakdown', label: 'Breakdown', Icon: BreakdownIcon },
];

function ActionButtons({ itemId, taskId, itemTitle, planStatus }) {
  const [dialogAction, setDialogAction] = useState(null);

  const entityId = taskId || itemId;

  const handleClick = useCallback((e, action) => {
    e.stopPropagation();
    setDialogAction(action);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogAction(null);
  }, []);

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
          planStatus={planStatus}
        />
      )}
    </>
  );
}

export default memo(ActionButtons);
