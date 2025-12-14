import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/**
 * Generic sortable item wrapper that applies dnd-kit sortable behavior.
 * Provides drag handle props and applies transform/transition styles.
 *
 * @param {Object} props
 * @param {string} props.id - Unique ID for the sortable item
 * @param {boolean} [props.disabled] - Whether to disable transforms (e.g., during convert mode)
 * @param {Function} props.children - Render function: ({ dragHandleProps, isDragging }) => ReactNode
 */
function SortableItemWrapper({ id, disabled = false, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: disabled ? undefined : CSS.Translate.toString(transform),
    transition: disabled ? undefined : transition,
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
