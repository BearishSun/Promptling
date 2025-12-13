import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TaskItem from './TaskItem';

const ChevronIcon = ({ expanded }) => (
  <svg
    className={`category-toggle ${expanded ? '' : 'collapsed'}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

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

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

function SortableTaskItem({ task, tags, isSelected, onSelect, onToggle }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskItem
        task={task}
        tags={tags}
        isSelected={isSelected}
        onSelect={onSelect}
        onToggle={onToggle}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function CategorySection({
  category,
  tasks,
  tags,
  selectedTaskId,
  onSelectTask,
  onToggleTask,
  onUpdateCategory,
  onDeleteCategory,
  onAddTask,
  dragHandleProps
}) {
  const expanded = category.expanded !== false; // Default to true
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const isEditingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Sync editName when category.name changes from outside (e.g., data reload)
  useEffect(() => {
    if (!isEditingRef.current) {
      setEditName(category.name);
    }
  }, [category.name]);

  const toggleExpanded = useCallback(() => {
    onUpdateCategory(category.id, { expanded: !expanded });
  }, [category.id, expanded, onUpdateCategory]);

  const taskCount = tasks.length;
  const completedCount = tasks.filter(t => t.finishedAt).length;

  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== category.name) {
      onUpdateCategory(category.id, { name: editName.trim() });
    }
    setIsEditing(false);
  }, [editName, category.id, category.name, onUpdateCategory]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleNameSubmit();
    } else if (e.key === 'Escape') {
      setEditName(category.name);
      setIsEditing(false);
    }
  }, [handleNameSubmit, category.name]);

  return (
    <>
      <div className="category-header" onClick={toggleExpanded}>
        {dragHandleProps && (
          <div {...dragHandleProps} onClick={(e) => e.stopPropagation()}>
            <DragIcon />
          </div>
        )}
        <ChevronIcon expanded={expanded} />
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={handleKeyDown}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{
              flex: 1,
              padding: '2px 6px',
              border: '1px solid var(--accent)',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)'
            }}
          />
        ) : (
          <span
            className="category-name"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditing(true);
            }}
          >
            {category.name}
          </span>
        )}
        <span className="category-count">
          {completedCount}/{taskCount}
        </span>
        {onAddTask && (
          <button
            className="btn btn-ghost btn-sm category-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(category.id);
            }}
            title="Add task to category"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {expanded && (
        <div className="category-tasks">
          {tasks.map(task => (
            <SortableTaskItem
              key={task.id}
              task={task}
              tags={tags}
              isSelected={selectedTaskId === task.id}
              onSelect={onSelectTask}
              onToggle={onToggleTask}
            />
          ))}
          {tasks.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No tasks in this category
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default memo(CategorySection);
