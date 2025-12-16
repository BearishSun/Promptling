import { memo, useCallback } from 'react';
import { formatDate } from '../../utils/dateFormat';
import { TASK_STATUSES, COMPLEXITIES } from '../../services/api';
import { useToast } from '../../context/ToastContext';

// Drag handle icon
const DragIcon = () => (
  <svg className="task-drag-handle" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

function TaskItem({ task, tags, isSelected, onSelect, onToggle, dragHandleProps }) {
  const { showToast } = useToast();
  const status = task.status || 'open';
  const statusInfo = TASK_STATUSES.find(s => s.value === status) || TASK_STATUSES[0];
  const isCompleted = status === 'done' || !!task.finishedAt;
  const taskTags = (task.tagIds || []).map(id => tags?.[id]).filter(Boolean);
  const complexityInfo = COMPLEXITIES.find(c => c.value === task.complexity);

  const handleCopyId = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(task.id).then(() => {
      showToast(`Copied: ${task.id}`);
    });
  }, [task.id, showToast]);

  return (
    <div
      className={`task-item compact ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}`}
      onClick={() => onSelect(task.id)}
    >
      <div {...dragHandleProps}>
        <DragIcon />
      </div>

      <div
        className={`task-checkbox ${isCompleted ? 'checked' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task.id);
        }}
      />

      <div className="task-content">
        <div className="task-title">{task.title}</div>
        {task.description && (
          <div className="task-description-preview">{task.description}</div>
        )}
        <div className="task-meta">
          {/* Status indicator */}
          <span className={`status-badge ${status}`}>
            <span className={`status-dot ${status}`} />
            {statusInfo.label}
          </span>

          {/* Complexity indicator */}
          {complexityInfo && (
            <span className="complexity-badge" style={{ background: complexityInfo.color, color: 'white' }}>
              <span className="complexity-icon">{complexityInfo.icon}</span>
              {complexityInfo.label}
            </span>
          )}

          {/* Tags */}
          {taskTags.length > 0 && (
            <span className="tags-container">
              {taskTags.slice(0, 3).map(tag => (
                <span key={tag.id} className="tag">
                  <span className="tag-dot" style={{ background: tag.color }} />
                  {tag.name}
                </span>
              ))}
              {taskTags.length > 3 && (
                <span className="tag">+{taskTags.length - 3}</span>
              )}
            </span>
          )}

          {/* Date */}
          <span>{formatDate(task.createdAt)}</span>
        </div>
      </div>
      <button
        className="btn btn-icon btn-ghost btn-sm item-copy-btn"
        onClick={handleCopyId}
        title="Copy task ID"
      >
        <CopyIcon />
      </button>
    </div>
  );
}

// Custom comparison for memo - only re-render when these change
export default memo(TaskItem, (prevProps, nextProps) => {
  return (
    prevProps.task.id === nextProps.task.id &&
    prevProps.task.title === nextProps.task.title &&
    prevProps.task.description === nextProps.task.description &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.finishedAt === nextProps.task.finishedAt &&
    prevProps.task.complexity === nextProps.task.complexity &&
    JSON.stringify(prevProps.task.tagIds) === JSON.stringify(nextProps.task.tagIds) &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.tags === nextProps.tags
  );
});
