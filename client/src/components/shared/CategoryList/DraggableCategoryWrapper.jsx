import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import DroppableCategory from './DroppableCategory';

/**
 * Wraps DroppableCategory with drag-and-drop sorting capability.
 * Handles the sortable logic and passes drag handle props to DroppableCategory.
 */
function DraggableCategoryWrapper({
  category,
  sortableId,
  droppableId,
  droppableData,
  children,
  ...categoryProps
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="category-section">
      <DroppableCategory
        category={category}
        droppableId={droppableId}
        droppableData={droppableData}
        dragHandleProps={{ ...attributes, ...listeners }}
        {...categoryProps}
      >
        {children}
      </DroppableCategory>
    </div>
  );
}

export default memo(DraggableCategoryWrapper);
