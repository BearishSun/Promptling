import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { ChevronIcon, DragIcon, PlusIcon, TrashIcon } from '../icons';

/**
 * Generic droppable category container.
 * Handles expand/collapse, inline name editing, and delete functionality.
 */
function DroppableCategory({
  category,
  droppableId,
  droppableData,
  onUpdateCategory,
  onDeleteCategory,
  onAddItem,
  deleteConfirmMessage,
  emptyMessage = 'No items in this category',
  dragHandleProps,
  children,
  itemCount
}) {
  const expanded = category.expanded !== false;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const isEditingRef = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditingRef.current) {
      setEditName(category.name);
    }
  }, [category.name]);

  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: droppableData
  });

  const toggleExpanded = useCallback(() => {
    onUpdateCategory(category.id, { expanded: !expanded });
  }, [category.id, expanded, onUpdateCategory]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    const message = deleteConfirmMessage || `Delete category "${category.name}"? Items will be moved to uncategorized.`;
    if (confirm(message)) {
      onDeleteCategory(category.id);
    }
  }, [category.id, category.name, onDeleteCategory, deleteConfirmMessage]);

  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== category.name) {
      onUpdateCategory(category.id, { name: editName.trim() });
    }
    setIsEditing(false);
  }, [editName, category.id, category.name, onUpdateCategory]);

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
            className="category-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') { setEditName(category.name); setIsEditing(false); }
            }}
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
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setIsEditing(true)}
          >
            {category.name}
          </span>
        )}
        <span className="category-count">{itemCount}</span>
        {onAddItem && (
          <button
            className="btn btn-ghost btn-sm category-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddItem(category.id);
            }}
            title="Add item to category"
          >
            <PlusIcon />
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm category-delete"
          onClick={handleDelete}
          title="Delete category"
        >
          <TrashIcon />
        </button>
      </div>

      {expanded && (
        <div
          ref={setNodeRef}
          className="category-tasks"
          style={{
            background: isOver ? 'var(--bg-hover)' : undefined,
            borderRadius: isOver ? '6px' : undefined,
            transition: 'background 0.15s ease'
          }}
        >
          {children}
          {itemCount === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
              {emptyMessage}
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default memo(DroppableCategory);
