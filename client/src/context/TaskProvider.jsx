import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import tasksApi, { SYSTEM_SECTIONS } from '../services/api';

// Split contexts for performance - components only re-render when their specific context changes
const TaskDataContext = createContext(null);
const TaskActionsContext = createContext(null);
const UIStateContext = createContext(null);

// Apply theme to document
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function TaskProvider({ children }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState('system');
  const [uiState, setUIState] = useState({
    selectedItemType: null, // 'task', 'item', 'feature', 'bug', or null
    selectedItemId: null,
    activeView: 'section', // 'section', 'item' (or legacy: 'features', 'bugs', 'feature', 'bug')
    activeSectionId: SYSTEM_SECTIONS.FEATURES, // Currently active section
    activeItemId: null, // ID of selected item when in 'item' view
    searchQuery: '',
    statusFilter: null // null = all, or specific status
  });

  // Apply theme on mount and changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedData = await tasksApi.getAll();
      // Ensure all v4 objects exist
      if (!loadedData.sections) loadedData.sections = {};
      if (!loadedData.sectionOrder) loadedData.sectionOrder = [];
      if (!loadedData.items) loadedData.items = {};
      if (!loadedData.itemCategories) loadedData.itemCategories = {};
      if (!loadedData.tasks) loadedData.tasks = {};
      if (!loadedData.taskCategories) loadedData.taskCategories = {};
      if (!loadedData.tags) loadedData.tags = {};
      setData(loadedData);
      // Restore UI state from settings
      if (loadedData.settings) {
        // Map legacy activeView values to new values
        let activeView = loadedData.settings.activeView || 'section';
        let activeSectionId = loadedData.settings.activeSectionId || SYSTEM_SECTIONS.FEATURES;
        // Legacy mapping
        if (activeView === 'features') {
          activeView = 'section';
          activeSectionId = SYSTEM_SECTIONS.FEATURES;
        } else if (activeView === 'bugs') {
          activeView = 'section';
          activeSectionId = SYSTEM_SECTIONS.BUGS;
        } else if (activeView === 'feature' || activeView === 'bug') {
          activeView = 'item';
        }
        setUIState(prev => ({
          ...prev,
          activeView,
          activeSectionId,
          activeItemId: loadedData.settings.activeItemId || loadedData.settings.activeFeatureId || null
        }));
        // Restore theme
        if (loadedData.settings.theme) {
          setTheme(loadedData.settings.theme);
          applyTheme(loadedData.settings.theme);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load data');
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Optimistic update helper
  // IMPORTANT: API call must be outside setData to avoid issues with React Strict Mode
  // and concurrent rendering where state updaters can be called multiple times
  const optimisticUpdate = useCallback((updateFn, apiCall) => {
    setData(prev => updateFn(prev));
    // Fire API call outside the state updater for reliable execution
    apiCall().catch(err => {
      console.error('API call failed:', err);
      // Could implement rollback here
    });
  }, []);

  // Actions - memoized to prevent re-renders
  const actions = useMemo(() => ({
    // ============ V4 UNIFIED SECTIONS/ITEMS API ============

    // Sections
    createSection: async (name = 'New Section', icon = 'folder', color = '#3b82f6') => {
      const section = await tasksApi.createSection({ name, icon, color });
      setData(prev => ({
        ...prev,
        sections: { ...prev.sections, [section.id]: section },
        sectionOrder: [...prev.sectionOrder, section.id]
      }));
      return section;
    },

    updateSection: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          sections: {
            ...prev.sections,
            [id]: { ...prev.sections[id], ...updates }
          }
        }),
        () => tasksApi.updateSection(id, updates)
      );
    },

    deleteSection: async (id) => {
      // Cannot delete system sections
      if (id === SYSTEM_SECTIONS.FEATURES || id === SYSTEM_SECTIONS.BUGS) {
        throw new Error('Cannot delete system sections');
      }
      await tasksApi.deleteSection(id);
      setData(prev => {
        const newSections = { ...prev.sections };
        const newItems = { ...prev.items };
        const newItemCategories = { ...prev.itemCategories };
        const newTasks = { ...prev.tasks };
        const newTaskCategories = { ...prev.taskCategories };

        // Clean up all items in this section
        Object.values(prev.items)
          .filter(item => item.sectionId === id)
          .forEach(item => {
            // Delete tasks
            for (const taskId of item.taskOrder || []) {
              delete newTasks[taskId];
            }
            // Delete task categories
            for (const catId of item.categoryOrder || []) {
              delete newTaskCategories[catId];
            }
            delete newItems[item.id];
          });

        // Clean up item categories in this section
        Object.values(prev.itemCategories)
          .filter(cat => cat.sectionId === id)
          .forEach(cat => {
            delete newItemCategories[cat.id];
          });

        delete newSections[id];

        return {
          ...prev,
          sections: newSections,
          sectionOrder: prev.sectionOrder.filter(sid => sid !== id),
          items: newItems,
          itemCategories: newItemCategories,
          tasks: newTasks,
          taskCategories: newTaskCategories
        };
      });
    },

    // Items (unified features/bugs)
    createItem: async (sectionId, title = 'New Item', categoryId = null) => {
      const item = await tasksApi.createItem({ sectionId, title, categoryId });
      setData(prev => {
        const updated = {
          ...prev,
          items: { ...prev.items, [item.id]: item }
        };
        // Update section or category order
        if (categoryId && prev.itemCategories[categoryId]) {
          updated.itemCategories = {
            ...prev.itemCategories,
            [categoryId]: {
              ...prev.itemCategories[categoryId],
              itemOrder: [...prev.itemCategories[categoryId].itemOrder, item.id]
            }
          };
        } else if (prev.sections[sectionId]) {
          updated.sections = {
            ...prev.sections,
            [sectionId]: {
              ...prev.sections[sectionId],
              itemOrder: [...prev.sections[sectionId].itemOrder, item.id]
            }
          };
        }
        return updated;
      });
      return item;
    },

    updateItem: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          items: {
            ...prev.items,
            [id]: { ...prev.items[id], ...updates }
          }
        }),
        () => tasksApi.updateItem(id, updates)
      );
    },

    deleteItem: async (id) => {
      await tasksApi.deleteItem(id);
      setData(prev => {
        const newItems = { ...prev.items };
        const newTasks = { ...prev.tasks };
        const newTaskCategories = { ...prev.taskCategories };
        const newSections = { ...prev.sections };
        const newItemCategories = { ...prev.itemCategories };

        const item = newItems[id];
        if (item) {
          // Delete tasks
          for (const taskId of item.taskOrder || []) {
            delete newTasks[taskId];
          }
          // Delete task categories
          for (const catId of item.categoryOrder || []) {
            delete newTaskCategories[catId];
          }

          // Remove from section's itemOrder
          if (newSections[item.sectionId]) {
            newSections[item.sectionId] = {
              ...newSections[item.sectionId],
              itemOrder: newSections[item.sectionId].itemOrder.filter(iid => iid !== id)
            };
          }
          // Remove from category if in one
          if (item.categoryId && newItemCategories[item.categoryId]) {
            newItemCategories[item.categoryId] = {
              ...newItemCategories[item.categoryId],
              itemOrder: newItemCategories[item.categoryId].itemOrder.filter(iid => iid !== id)
            };
          }
        }
        delete newItems[id];

        return {
          ...prev,
          items: newItems,
          tasks: newTasks,
          taskCategories: newTaskCategories,
          sections: newSections,
          itemCategories: newItemCategories
        };
      });
    },

    // Item Categories
    createItemCategory: async (sectionId, name = 'New Category') => {
      const category = await tasksApi.createItemCategory({ sectionId, name });
      setData(prev => ({
        ...prev,
        itemCategories: { ...prev.itemCategories, [category.id]: category },
        sections: {
          ...prev.sections,
          [sectionId]: {
            ...prev.sections[sectionId],
            categoryOrder: [...prev.sections[sectionId].categoryOrder, category.id]
          }
        }
      }));
      return category;
    },

    updateItemCategory: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          itemCategories: {
            ...prev.itemCategories,
            [id]: { ...prev.itemCategories[id], ...updates }
          }
        }),
        () => tasksApi.updateItemCategory(id, updates)
      );
    },

    deleteItemCategory: async (id) => {
      await tasksApi.deleteItemCategory(id);
      await loadData(); // Reload to get proper item reassignment
    },

    moveItemToCategory: async (itemId, targetCategoryId, targetSectionId = null) => {
      await tasksApi.moveItem({ itemId, targetCategoryId, targetSectionId });
      await loadData();
    },

    // Reorder items in a section (uncategorized items)
    reorderSectionItems: (sectionId, newOrder) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          sections: {
            ...prev.sections,
            [sectionId]: { ...prev.sections[sectionId], itemOrder: newOrder }
          }
        }),
        () => tasksApi.reorder('section-items', sectionId, newOrder)
      );
    },

    // Reorder items within an item category
    reorderItemsInCategory: (categoryId, newOrder) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          itemCategories: {
            ...prev.itemCategories,
            [categoryId]: { ...prev.itemCategories[categoryId], itemOrder: newOrder }
          }
        }),
        () => tasksApi.reorder('items-in-category', categoryId, newOrder)
      );
    },

    // Reorder item categories within a section
    reorderItemCategories: (sectionId, newOrder) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          sections: {
            ...prev.sections,
            [sectionId]: { ...prev.sections[sectionId], categoryOrder: newOrder }
          }
        }),
        () => tasksApi.reorder('section-categories', sectionId, newOrder)
      );
    },

    // Tasks
    createTask: async (parentType, parentId, categoryId = null, title = 'New Task') => {
      const task = await tasksApi.createTask({ parentType, parentId, categoryId, title });
      setData(prev => {
        const updated = {
          ...prev,
          tasks: { ...prev.tasks, [task.id]: task }
        };

        // v4: parentId is the itemId
        if (categoryId && prev.taskCategories[categoryId]) {
          updated.taskCategories = {
            ...prev.taskCategories,
            [categoryId]: {
              ...prev.taskCategories[categoryId],
              taskOrder: [...prev.taskCategories[categoryId].taskOrder, task.id]
            }
          };
        } else if (prev.items[parentId]) {
          updated.items = {
            ...prev.items,
            [parentId]: {
              ...prev.items[parentId],
              taskOrder: [...prev.items[parentId].taskOrder, task.id]
            }
          };
        }

        return updated;
      });
      return task;
    },

    updateTask: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          tasks: {
            ...prev.tasks,
            [id]: { ...prev.tasks[id], ...updates }
          }
        }),
        () => tasksApi.updateTask(id, updates)
      );
    },

    toggleTaskComplete: (id) => {
      const task = data?.tasks[id];
      if (!task) return;

      const currentStatus = task.status || 'open';
      const isDone = currentStatus === 'done';

      // If done, toggle back to open; otherwise toggle to done
      const newStatus = isDone ? 'open' : 'done';
      const finishedAt = isDone ? null : new Date().toISOString();

      optimisticUpdate(
        prev => ({
          ...prev,
          tasks: {
            ...prev.tasks,
            [id]: { ...prev.tasks[id], status: newStatus, finishedAt }
          }
        }),
        () => tasksApi.updateTask(id, { status: newStatus, finishedAt })
      );
    },

    deleteTask: async (id) => {
      const task = data?.tasks[id];
      if (!task) return;

      await tasksApi.deleteTask(id);
      setData(prev => {
        const updated = {
          ...prev,
          tasks: { ...prev.tasks }
        };
        delete updated.tasks[id];

        // v4: Remove from taskCategory or item's taskOrder
        if (task.categoryId && prev.taskCategories[task.categoryId]) {
          updated.taskCategories = {
            ...prev.taskCategories,
            [task.categoryId]: {
              ...prev.taskCategories[task.categoryId],
              taskOrder: prev.taskCategories[task.categoryId].taskOrder.filter(tid => tid !== id)
            }
          };
        } else if (task.itemId && prev.items[task.itemId]) {
          updated.items = {
            ...prev.items,
            [task.itemId]: {
              ...prev.items[task.itemId],
              taskOrder: prev.items[task.itemId].taskOrder.filter(tid => tid !== id)
            }
          };
        }

        return updated;
      });
    },

    // Task Categories (within items)
    createCategory: async (parentType, parentId, name = 'New Category') => {
      const category = await tasksApi.createCategory({ parentType, parentId, name });
      setData(prev => ({
        ...prev,
        taskCategories: { ...prev.taskCategories, [category.id]: category },
        items: {
          ...prev.items,
          [parentId]: {
            ...prev.items[parentId],
            categoryOrder: [...(prev.items[parentId]?.categoryOrder || []), category.id]
          }
        }
      }));
      return category;
    },

    updateCategory: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          taskCategories: {
            ...prev.taskCategories,
            [id]: { ...prev.taskCategories[id], ...updates }
          }
        }),
        () => tasksApi.updateCategory(id, updates)
      );
    },

    deleteCategory: async (id) => {
      await tasksApi.deleteCategory(id);
      await loadData(); // Reload to get proper task reassignment
    },

    moveTaskToCategory: (taskId, targetCategoryId) => {
      optimisticUpdate(
        prev => {
          const task = prev.tasks[taskId];
          if (!task) return prev;

          const oldCategoryId = task.categoryId;
          const itemId = task.itemId;

          // Create new state
          const newState = { ...prev };

          // Update task's categoryId
          newState.tasks = {
            ...prev.tasks,
            [taskId]: { ...task, categoryId: targetCategoryId || null }
          };

          // Remove from old location
          if (oldCategoryId && prev.taskCategories[oldCategoryId]) {
            newState.taskCategories = {
              ...prev.taskCategories,
              [oldCategoryId]: {
                ...prev.taskCategories[oldCategoryId],
                taskOrder: prev.taskCategories[oldCategoryId].taskOrder.filter(id => id !== taskId)
              }
            };
          } else if (itemId && prev.items[itemId]) {
            newState.items = {
              ...prev.items,
              [itemId]: {
                ...prev.items[itemId],
                taskOrder: prev.items[itemId].taskOrder.filter(id => id !== taskId)
              }
            };
          }

          // Add to new location
          if (targetCategoryId && prev.taskCategories[targetCategoryId]) {
            newState.taskCategories = {
              ...newState.taskCategories,
              [targetCategoryId]: {
                ...prev.taskCategories[targetCategoryId],
                taskOrder: [...(prev.taskCategories[targetCategoryId].taskOrder || []), taskId]
              }
            };
          } else if (itemId && prev.items[itemId]) {
            const currentItemTaskOrder = newState.items?.[itemId]?.taskOrder || prev.items[itemId].taskOrder;
            newState.items = {
              ...newState.items,
              [itemId]: {
                ...prev.items[itemId],
                taskOrder: [...currentItemTaskOrder.filter(id => id !== taskId), taskId]
              }
            };
          }

          return newState;
        },
        () => tasksApi.moveTask({ taskId, newCategoryId: targetCategoryId })
      );
    },

    // Reorder tasks within a parent (item or taskCategory)
    reorderTasks: (parentId, newOrder, isCategory = false) => {
      optimisticUpdate(
        prev => {
          if (isCategory && prev.taskCategories[parentId]) {
            return {
              ...prev,
              taskCategories: {
                ...prev.taskCategories,
                [parentId]: { ...prev.taskCategories[parentId], taskOrder: newOrder }
              }
            };
          }
          if (prev.items[parentId]) {
            return {
              ...prev,
              items: {
                ...prev.items,
                [parentId]: { ...prev.items[parentId], taskOrder: newOrder }
              }
            };
          }
          return prev;
        },
        () => tasksApi.reorder('tasks', parentId, newOrder)
      );
    },

    // Reorder task categories within an item
    reorderCategories: (parentType, parentId, newOrder) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          items: {
            ...prev.items,
            [parentId]: { ...prev.items[parentId], categoryOrder: newOrder }
          }
        }),
        () => tasksApi.reorder('categories', parentId, newOrder)
      );
    },

    // Tags
    createTag: async (name, color) => {
      const tag = await tasksApi.createTag({ name, color });
      setData(prev => ({
        ...prev,
        tags: { ...prev.tags, [tag.id]: tag }
      }));
      return tag;
    },

    updateTag: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          tags: {
            ...prev.tags,
            [id]: { ...prev.tags[id], ...updates }
          }
        }),
        () => tasksApi.updateTag(id, updates)
      );
    },

    deleteTag: async (id) => {
      await tasksApi.deleteTag(id);
      setData(prev => {
        const newTags = { ...prev.tags };
        delete newTags[id];
        // Remove tag from all tasks
        const newTasks = { ...prev.tasks };
        Object.keys(newTasks).forEach(taskId => {
          if (newTasks[taskId].tagIds?.includes(id)) {
            newTasks[taskId] = {
              ...newTasks[taskId],
              tagIds: newTasks[taskId].tagIds.filter(tid => tid !== id)
            };
          }
        });
        return { ...prev, tags: newTags, tasks: newTasks };
      });
    },

    addTagToTask: (taskId, tagId) => {
      optimisticUpdate(
        prev => {
          const task = prev.tasks[taskId];
          if (!task) return prev;
          const tagIds = task.tagIds || [];
          if (tagIds.includes(tagId)) return prev;
          return {
            ...prev,
            tasks: {
              ...prev.tasks,
              [taskId]: { ...task, tagIds: [...tagIds, tagId] }
            }
          };
        },
        () => tasksApi.updateTask(taskId, {
          tagIds: [...(data.tasks[taskId]?.tagIds || []), tagId]
        })
      );
    },

    removeTagFromTask: (taskId, tagId) => {
      optimisticUpdate(
        prev => {
          const task = prev.tasks[taskId];
          if (!task) return prev;
          return {
            ...prev,
            tasks: {
              ...prev.tasks,
              [taskId]: {
                ...task,
                tagIds: (task.tagIds || []).filter(id => id !== tagId)
              }
            }
          };
        },
        () => tasksApi.updateTask(taskId, {
          tagIds: (data.tasks[taskId]?.tagIds || []).filter(id => id !== tagId)
        })
      );
    },

    // Import/Export
    exportData: async () => {
      const exportData = await tasksApi.exportData();
      // Download as file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasklist-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    importData: async (jsonData, merge = false) => {
      if (merge) {
        await tasksApi.importMerge(jsonData);
      } else {
        await tasksApi.importData(jsonData);
      }
      await loadData();
    },

    // Attachments
    uploadAttachment: async (itemType, itemId, file) => {
      const attachment = await tasksApi.uploadAttachment(itemType, itemId, file);
      // Update local state (v4: feature/bug/item are all in items)
      setData(prev => {
        const collection = itemType === 'task' ? 'tasks' : 'items';
        const item = prev[collection]?.[itemId];
        if (!item) return prev;
        return {
          ...prev,
          [collection]: {
            ...prev[collection],
            [itemId]: {
              ...item,
              attachments: [...(item.attachments || []), attachment]
            }
          }
        };
      });
      return attachment;
    },

    deleteAttachment: async (itemType, itemId, attachmentId) => {
      await tasksApi.deleteAttachment(itemType, itemId, attachmentId);
      // Update local state (v4: feature/bug/item are all in items)
      setData(prev => {
        const collection = itemType === 'task' ? 'tasks' : 'items';
        const item = prev[collection]?.[itemId];
        if (!item) return prev;
        return {
          ...prev,
          [collection]: {
            ...prev[collection],
            [itemId]: {
              ...item,
              attachments: (item.attachments || []).filter(a => a.id !== attachmentId)
            }
          }
        };
      });
    },

    // Reload data
    reload: loadData
  }), [data, optimisticUpdate]);

  // UI Actions
  const uiActions = useMemo(() => ({
    // V4 section-based navigation
    setActiveSection: (sectionId) => {
      setUIState(prev => ({
        ...prev,
        activeView: 'section',
        activeSectionId: sectionId,
        activeItemId: null,
        selectedItemType: null,
        selectedItemId: null
      }));
      tasksApi.updateSettings({
        activeView: 'section',
        activeSectionId: sectionId,
        activeItemId: null
      }).catch(console.error);
    },

    setActiveItem: (itemId) => {
      const item = data?.items?.[itemId];
      setUIState(prev => ({
        ...prev,
        activeView: 'item',
        activeSectionId: item?.sectionId || prev.activeSectionId,
        activeItemId: itemId,
        selectedItemType: null,
        selectedItemId: null
      }));
      tasksApi.updateSettings({
        activeView: 'item',
        activeSectionId: item?.sectionId,
        activeItemId: itemId
      }).catch(console.error);
    },

    // Legacy setActiveView - maps to section-based navigation
    setActiveView: (view, itemId = null) => {
      let newView = view;
      let newSectionId = uiState.activeSectionId;

      // Map legacy views to sections
      if (view === 'features') {
        newView = 'section';
        newSectionId = SYSTEM_SECTIONS.FEATURES;
      } else if (view === 'bugs') {
        newView = 'section';
        newSectionId = SYSTEM_SECTIONS.BUGS;
      } else if (view === 'feature' || view === 'bug') {
        newView = 'item';
      }

      setUIState(prev => ({
        ...prev,
        activeView: newView,
        activeSectionId: newSectionId,
        activeItemId: itemId,
        selectedItemType: null,
        selectedItemId: null
      }));
      tasksApi.updateSettings({
        activeView: newView,
        activeSectionId: newSectionId,
        activeItemId: itemId
      }).catch(console.error);
    },

    selectItem: (type, id) => {
      setUIState(prev => ({ ...prev, selectedItemType: type, selectedItemId: id }));
    },

    // Backwards compatibility
    selectTask: (taskId) => {
      setUIState(prev => ({ ...prev, selectedItemType: 'task', selectedItemId: taskId }));
    },

    clearSelection: () => {
      setUIState(prev => ({ ...prev, selectedItemType: null, selectedItemId: null }));
    },

    setSearchQuery: (query) => {
      setUIState(prev => ({ ...prev, searchQuery: query }));
    },

    setStatusFilter: (status) => {
      setUIState(prev => ({ ...prev, statusFilter: status }));
    },

    setTheme: (newTheme) => {
      setTheme(newTheme);
      applyTheme(newTheme);
      tasksApi.updateSettings({ theme: newTheme }).catch(console.error);
    }
  }), [data?.items, uiState.activeSectionId]);

  // Backwards compatible selectedTaskId
  const selectedTaskId = uiState.selectedItemType === 'task' ? uiState.selectedItemId : null;

  return (
    <TaskDataContext.Provider value={{ data, loading, error }}>
      <TaskActionsContext.Provider value={actions}>
        <UIStateContext.Provider value={{ ...uiState, selectedTaskId, theme, ...uiActions }}>
          {children}
        </UIStateContext.Provider>
      </TaskActionsContext.Provider>
    </TaskDataContext.Provider>
  );
}

// Hooks for consuming context
export function useTaskData() {
  const context = useContext(TaskDataContext);
  if (!context) throw new Error('useTaskData must be used within TaskProvider');
  return context;
}

export function useTaskActions() {
  const context = useContext(TaskActionsContext);
  if (!context) throw new Error('useTaskActions must be used within TaskProvider');
  return context;
}

export function useUIState() {
  const context = useContext(UIStateContext);
  if (!context) throw new Error('useUIState must be used within TaskProvider');
  return context;
}

// Selector hook for specific task (minimizes re-renders)
export function useTask(taskId) {
  const { data } = useTaskData();
  return useMemo(() => data?.tasks?.[taskId] || null, [data?.tasks, taskId]);
}

// V4 selector hooks

// Selector hook for specific section
export function useSection(sectionId) {
  const { data } = useTaskData();
  return useMemo(() => data?.sections?.[sectionId] || null, [data?.sections, sectionId]);
}

// Selector hook for specific item (unified feature/bug)
export function useItem(itemId) {
  const { data } = useTaskData();
  return useMemo(() => data?.items?.[itemId] || null, [data?.items, itemId]);
}

// Selector hook for all sections in order
export function useSections() {
  const { data } = useTaskData();
  return useMemo(() => {
    if (!data?.sections || !data?.sectionOrder) return [];
    return data.sectionOrder
      .map(id => data.sections[id])
      .filter(Boolean);
  }, [data?.sections, data?.sectionOrder]);
}

// Selector hook for items in a section
export function useSectionItems(sectionId) {
  const { data } = useTaskData();
  return useMemo(() => {
    if (!data?.sections?.[sectionId] || !data?.items) return [];
    const section = data.sections[sectionId];
    return (section.itemOrder || [])
      .map(id => data.items[id])
      .filter(Boolean);
  }, [data?.sections, data?.items, sectionId]);
}

// Selector hook for item categories in a section
export function useSectionCategories(sectionId) {
  const { data } = useTaskData();
  return useMemo(() => {
    if (!data?.sections?.[sectionId] || !data?.itemCategories) return [];
    const section = data.sections[sectionId];
    return (section.categoryOrder || [])
      .map(id => data.itemCategories[id])
      .filter(Boolean);
  }, [data?.sections, data?.itemCategories, sectionId]);
}

// Re-export SYSTEM_SECTIONS for convenience
export { SYSTEM_SECTIONS };

export default TaskProvider;
