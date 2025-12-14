import { memo, useCallback, useRef } from 'react';
import { DndContext, DragOverlay, pointerWithin, rectIntersection } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import DraggableCategoryWrapper from './DraggableCategoryWrapper';
import DroppableUncategorizedZone from './DroppableUncategorizedZone';

/**
 * Custom collision detection that prioritizes droppable zones when dragging items.
 * This prevents items from "swapping" with categories when dragged over them.
 */
function createCollisionDetection(categoryIdPrefix) {
  return (args) => {
    const { active, droppableContainers } = args;
    const activeId = String(active.id);

    // If dragging a category, use standard rect intersection for category reordering
    if (activeId.startsWith(categoryIdPrefix)) {
      return rectIntersection(args);
    }

    // When dragging an item, first check for droppable zones (category drop targets)
    const pointerCollisions = pointerWithin(args);

    // Filter to prefer droppables over category sortables
    // Droppables have IDs like "task-category-xxx" or "item-category-xxx" or end with "-collapsed"
    // Category sortables have IDs like "tcat-xxx" or "icat-xxx"
    const droppableCollisions = pointerCollisions.filter(collision => {
      const id = String(collision.id);
      // It's a droppable if it contains "category-" (droppable ID pattern) or is an item ID
      // It's NOT a droppable if it starts with the category prefix (sortable category)
      return !id.startsWith(categoryIdPrefix);
    });

    // If we found droppable collisions, prefer those
    if (droppableCollisions.length > 0) {
      return droppableCollisions;
    }

    // If pointer is within a category sortable but no droppable inside,
    // still return the category so items can be dropped into collapsed categories
    // The drag handler will convert this to a category drop
    return pointerCollisions;
  };
}

/**
 * Generic categorized list component with drag-and-drop support.
 * Handles the DndContext, SortableContext, categories, and uncategorized items.
 */
function CategorizedList({
  sensors,
  allSortableIds,
  categories,
  uncategorizedItems,
  getCategoryItems,
  getNonCompletedCount,
  renderItem,
  onDragEnd,
  onDragStart,
  categoryIdPrefix,
  droppableType,
  droppableIdPrefix,
  uncategorizedDroppableId,
  onUpdateCategory,
  onDeleteCategory,
  onAddToCategory,
  itemLabel = 'item',
  dragOverlay,
  emptyState
}) {
  const hasContent = categories.length > 0 || uncategorizedItems.length > 0;

  // Memoize collision detection based on category prefix
  const collisionDetectionRef = useRef(null);
  if (!collisionDetectionRef.current || collisionDetectionRef.current.prefix !== categoryIdPrefix) {
    collisionDetectionRef.current = {
      prefix: categoryIdPrefix,
      fn: createCollisionDetection(categoryIdPrefix)
    };
  }

  if (!hasContent && emptyState) {
    return emptyState;
  }

  return (
    <div className="task-list">
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionRef.current.fn}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
          {/* Categories with their items */}
          {categories.map(category => {
            const items = getCategoryItems(category);
            return (
              <DraggableCategoryWrapper
                key={category.id}
                category={category}
                sortableId={`${categoryIdPrefix}${category.id}`}
                droppableId={`${droppableIdPrefix}${category.id}`}
                droppableData={{ type: droppableType, categoryId: category.id }}
                onUpdateCategory={onUpdateCategory}
                onDeleteCategory={onDeleteCategory}
                onAddItem={onAddToCategory}
                deleteConfirmMessage={`Delete category "${category.name}"? ${itemLabel}s will be moved to uncategorized.`}
                emptyMessage={`No ${itemLabel}s in this category`}
                itemCount={getNonCompletedCount(items)}
              >
                {items.map(item => renderItem(item))}
              </DraggableCategoryWrapper>
            );
          })}

          {/* Uncategorized items */}
          {(uncategorizedItems.length > 0 || categories.length > 0) && (
            <DroppableUncategorizedZone
              droppableId={uncategorizedDroppableId}
              droppableData={{ type: droppableType, categoryId: null }}
              showHeader={categories.length > 0}
              headerLabel="Uncategorized"
              itemCount={getNonCompletedCount(uncategorizedItems)}
              emptyMessage={`Drop ${itemLabel}s here to uncategorize`}
            >
              {uncategorizedItems.map(item => renderItem(item))}
            </DroppableUncategorizedZone>
          )}
        </SortableContext>

        {dragOverlay && (
          <DragOverlay dropAnimation={null}>
            {dragOverlay}
          </DragOverlay>
        )}
      </DndContext>
    </div>
  );
}

export default memo(CategorizedList);
