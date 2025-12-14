import { useCallback } from 'react';

/**
 * Shared hook for drag-and-drop handlers in categorized lists.
 * Handles category reordering, item movement between categories, and item reordering.
 *
 * @param {Object} options
 * @param {Object} options.data - The full data object from context
 * @param {Object} options.parent - The parent object (item or section)
 * @param {string} options.parentId - ID of the parent
 * @param {Array} options.categories - Array of category objects
 * @param {string} options.categoryIdPrefix - Prefix for category IDs ('tcat-' or 'icat-')
 * @param {string} options.droppableType - Type string for droppable zones ('task-category' or 'item-category')
 * @param {string} options.itemsKey - Key for items in data ('tasks' or 'items')
 * @param {string} options.categoriesKey - Key for categories in data ('taskCategories' or 'itemCategories')
 * @param {string} options.itemOrderKey - Key for item order ('taskOrder' or 'itemOrder')
 * @param {Function} options.onReorderCategories - Callback for reordering categories
 * @param {Function} options.onMoveToCategory - Callback for moving item to category: (itemId, categoryId, insertBeforeItemId?) => void
 * @param {Function} options.onReorderInCategory - Callback for reordering within a category (categoryId, newOrder)
 * @param {Function} options.onReorderUncategorized - Callback for reordering uncategorized items (newOrder)
 * @param {Function} [options.onSpecialDrop] - Optional callback for special drop handling (e.g., convert to task)
 */
export function useDragHandlers({
  data,
  parent,
  parentId,
  categories,
  categoryIdPrefix,
  droppableType,
  itemsKey,
  categoriesKey,
  itemOrderKey,
  onReorderCategories,
  onMoveToCategory,
  onReorderInCategory,
  onReorderUncategorized,
  onSpecialDrop
}) {
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle category drag
    if (activeId.startsWith(categoryIdPrefix)) {
      if (!overId.startsWith(categoryIdPrefix)) return;

      const activeCatId = activeId.replace(categoryIdPrefix, '');
      const overCatId = overId.replace(categoryIdPrefix, '');

      if (activeCatId === overCatId) return;

      const oldIndex = categories.findIndex(c => c.id === activeCatId);
      const newIndex = categories.findIndex(c => c.id === overCatId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = categories.map(c => c.id);
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, activeCatId);
        onReorderCategories(newOrder);
      }
      return;
    }

    // Handle item drag
    const items = data?.[itemsKey];
    const activeItem = items?.[activeId];
    if (!activeItem) return;

    // Check for special drop handling (e.g., shift+drag to convert)
    if (onSpecialDrop && onSpecialDrop(activeId, overId, activeItem, items?.[overId])) {
      return;
    }

    // Check if dropped on a category zone (droppable) - works for both expanded and collapsed
    // The droppable data contains the categoryId regardless of which droppable was hit
    const overData = over.data?.current;
    if (overData?.type === droppableType) {
      const targetCategoryId = overData.categoryId;
      const currentCategoryId = activeItem.categoryId || null;

      if (targetCategoryId !== currentCategoryId) {
        onMoveToCategory(activeId, targetCategoryId);
        return;
      }
    }

    // Check if dropped on a category sortable wrapper (fallback for edge cases)
    if (overId.startsWith(categoryIdPrefix)) {
      const targetCategoryId = overId.replace(categoryIdPrefix, '');
      const currentCategoryId = activeItem.categoryId || null;

      if (targetCategoryId !== currentCategoryId) {
        onMoveToCategory(activeId, targetCategoryId);
        return;
      }
    }

    // Check if dropped on another item
    const overItem = items?.[overId];
    if (overItem) {
      const targetCategoryId = overItem.categoryId || null;
      const currentCategoryId = activeItem.categoryId || null;

      // If items are in different categories, move to target category at the drop position
      if (targetCategoryId !== currentCategoryId) {
        onMoveToCategory(activeId, targetCategoryId, overId);
        return;
      }

      // Same category - check if we can reorder
      // Prevent mixing completed and non-completed items when reordering within same category
      const activeCompleted = activeItem.status === 'done';
      const overCompleted = overItem.status === 'done';
      if (activeCompleted !== overCompleted) {
        return;
      }

      // Same category, same completion status - reorder within that category
      if (targetCategoryId) {
        const categoriesData = data?.[categoriesKey];
        const category = categoriesData?.[targetCategoryId];
        if (category) {
          const order = category[itemOrderKey] || [];
          const oldIndex = order.indexOf(activeId);
          const newIndex = order.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newOrder = [...order];
            newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, activeId);
            onReorderInCategory(targetCategoryId, newOrder);
          }
        }
      } else {
        // Both uncategorized - reorder in parent's order
        const parentOrder = parent?.[itemOrderKey] || [];
        const uncatIds = parentOrder.filter(id => {
          const item = items[id];
          return item && !item.categoryId;
        });
        const oldIndex = uncatIds.indexOf(activeId);
        const newIndex = uncatIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = [...uncatIds];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, activeId);
          // Rebuild full order: categorized items stay, uncategorized get new order
          const categorizedIds = parentOrder.filter(id => {
            const item = items[id];
            return item && item.categoryId;
          });
          onReorderUncategorized([...categorizedIds, ...newOrder]);
        }
      }
    }
  }, [
    data, parent, parentId, categories, categoryIdPrefix, droppableType,
    itemsKey, categoriesKey, itemOrderKey,
    onReorderCategories, onMoveToCategory, onReorderInCategory, onReorderUncategorized, onSpecialDrop
  ]);

  return { handleDragEnd };
}
