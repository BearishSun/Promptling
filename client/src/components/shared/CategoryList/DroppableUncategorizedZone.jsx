import { memo } from 'react';
import { useDroppable } from '@dnd-kit/core';

/**
 * Generic droppable zone for uncategorized items.
 * Can optionally show a header when categories exist.
 */
function DroppableUncategorizedZone({
  droppableId,
  droppableData,
  showHeader = false,
  headerLabel = 'Uncategorized',
  itemCount = 0,
  emptyMessage = 'Drop items here to uncategorize',
  children
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: droppableData
  });

  const hasChildren = itemCount > 0;

  return (
    <div className="category-section">
      {showHeader && (
        <div className="category-header">
          <span className="category-name">{headerLabel}</span>
          <span className="category-count">{itemCount}</span>
        </div>
      )}
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
        {!hasChildren && showHeader && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(DroppableUncategorizedZone);
