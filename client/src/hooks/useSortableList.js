import { useMemo, useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

/**
 * Shared hook for sortable list functionality.
 * Provides common utilities for both TaskList and SectionItemsList.
 *
 * @param {Object} options
 * @param {Object} options.data - The full data object from context
 * @param {string} options.parentId - ID of the parent (item for tasks, section for items)
 * @param {Object} options.parent - The parent object (item or section)
 * @param {string} options.categoriesKey - Key for categories in data ('taskCategories' or 'itemCategories')
 * @param {string} options.itemsKey - Key for items in data ('tasks' or 'items')
 * @param {string} options.categoryOrderKey - Key for category order in parent ('categoryOrder')
 * @param {string} options.itemOrderKey - Key for item order in parent or category ('taskOrder' or 'itemOrder')
 * @param {string} options.searchQuery - Current search query for filtering
 * @param {string} options.categoryIdPrefix - Prefix for sortable category IDs ('tcat-' or 'icat-')
 */
export function useSortableList({
  data,
  parentId,
  parent,
  categoriesKey,
  itemsKey,
  categoryOrderKey = 'categoryOrder',
  itemOrderKey,
  searchQuery,
  categoryIdPrefix
}) {
  // Standard dnd-kit sensors configuration
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Filter items by search query
  const filterItems = useCallback((items) => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      item.title.toLowerCase().includes(query) ||
      (item.description || '').toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Sort items with completed ones at the bottom
  const sortCompletedToBottom = useCallback((items) => {
    const nonCompleted = items.filter(item => item.status !== 'done');
    const completed = items.filter(item => item.status === 'done');
    return [...nonCompleted, ...completed];
  }, []);

  // Get categories ordered by parent's categoryOrder
  const categories = useMemo(() => {
    if (!data?.[categoriesKey] || !parent) return [];

    const categoryOrder = parent[categoryOrderKey] || [];
    // Look up categories by ID from the parent's categoryOrder
    return categoryOrder
      .map(id => data[categoriesKey][id])
      .filter(Boolean);
  }, [data, categoriesKey, parent, categoryOrderKey]);

  // Get uncategorized items (raw, before filtering/sorting)
  const uncategorizedItemsRaw = useMemo(() => {
    if (!parent || !data?.[itemsKey]) return [];
    return (parent[itemOrderKey] || [])
      .map(id => data[itemsKey][id])
      .filter(item => item && !item.categoryId);
  }, [parent, data, itemsKey, itemOrderKey]);

  // Filtered and sorted uncategorized items
  const uncategorizedItems = useMemo(() => {
    return sortCompletedToBottom(filterItems(uncategorizedItemsRaw));
  }, [uncategorizedItemsRaw, filterItems, sortCompletedToBottom]);

  // Get items for a specific category (filtered and sorted)
  const getCategoryItems = useCallback((category) => {
    if (!data?.[itemsKey]) return [];
    const items = (category[itemOrderKey] || [])
      .map(id => data[itemsKey][id])
      .filter(Boolean);
    return sortCompletedToBottom(filterItems(items));
  }, [data, itemsKey, itemOrderKey, filterItems, sortCompletedToBottom]);

  // Count non-completed items for display
  const getNonCompletedCount = useCallback((items) => {
    return items.filter(item => item.status !== 'done').length;
  }, []);

  // Build all sortable IDs (categories prefixed, then all items)
  const allSortableIds = useMemo(() => {
    const ids = [];
    // Add category IDs with prefix
    categories.forEach(cat => ids.push(`${categoryIdPrefix}${cat.id}`));
    // Add item IDs from each category
    categories.forEach(cat => {
      const catItems = getCategoryItems(cat);
      catItems.forEach(item => ids.push(item.id));
    });
    // Add uncategorized item IDs
    uncategorizedItems.forEach(item => ids.push(item.id));
    return ids;
  }, [categories, getCategoryItems, uncategorizedItems, categoryIdPrefix]);

  return {
    sensors,
    categories,
    uncategorizedItems,
    allSortableIds,
    filterItems,
    sortCompletedToBottom,
    getCategoryItems,
    getNonCompletedCount
  };
}
