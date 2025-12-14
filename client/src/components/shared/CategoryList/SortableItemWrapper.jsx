import { memo } from 'react';
import { useDndContext } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Generic sortable item wrapper that applies dnd-kit sortable behavior.
 * Provides drag handle props and applies transform/transition styles.
 * Only applies visual transforms when items are in the same category as the dragged item.
 *
 * @param {Object} props
 * @param {string} props.id - Unique ID for the sortable item
 * @param {string} [props.categoryId] - Category ID this item belongs to (null for uncategorized)
 * @param {Object} [props.items] - Map of all items (to look up active item's category)
 * @param {boolean} [props.disabled] - Whether to disable transforms (e.g., during convert mode)
 * @param {Function} props.children - Render function: ({ dragHandleProps, isDragging }) => ReactNode
 */
function SortableItemWrapper({ id, categoryId = null, items, disabled = false, children }) {
  const { active } = useDndContext();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  // Only apply transforms for items in the same category as the dragged item
  // This prevents items from visually jumping across category boundaries
  const activeId = active?.id;
  const activeItem = activeId && items ? items[activeId] : null;
  const activeCategoryId = activeItem?.categoryId ?? null;
  const sameCategory = !active || activeCategoryId === categoryId;

  const style = {
    transform: (disabled || !sameCategory) ? undefined : CSS.Translate.toString(transform),
    transition: (disabled || !sameCategory) ? undefined : transition,
    opacity: isDragging ? 0.5 : 1
  };

  const dragHandleProps = { ...attributes, ...listeners };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps, isDragging })}
    </div>
  );
}

export default memo(SortableItemWrapper);
