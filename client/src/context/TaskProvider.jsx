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
      // Backward compat - ensure legacy objects exist for components still using them
      if (!loadedData.features) loadedData.features = {};
      if (!loadedData.bugs) loadedData.bugs = {};
      if (!loadedData.categories) loadedData.categories = {};
      if (!loadedData.featureCategories) loadedData.featureCategories = {};
      if (!loadedData.bugCategories) loadedData.bugCategories = {};
      if (!loadedData.globalFeatureOrder) loadedData.globalFeatureOrder = [];
      if (!loadedData.globalBugOrder) loadedData.globalBugOrder = [];
      if (!loadedData.featureCategoryOrder) loadedData.featureCategoryOrder = [];
      if (!loadedData.bugCategoryOrder) loadedData.bugCategoryOrder = [];
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

    // ============ LEGACY API (backward compat) ============

    // Features (maps to items in Features section)
    createFeature: async (title = 'New Feature') => {
      const feature = await tasksApi.createFeature({ title });
      setData(prev => ({
        ...prev,
        items: { ...prev.items, [feature.id]: feature },
        features: { ...prev.features, [feature.id]: feature },
        sections: {
          ...prev.sections,
          [SYSTEM_SECTIONS.FEATURES]: {
            ...prev.sections[SYSTEM_SECTIONS.FEATURES],
            itemOrder: [...(prev.sections[SYSTEM_SECTIONS.FEATURES]?.itemOrder || []), feature.id]
          }
        },
        globalFeatureOrder: [...(prev.globalFeatureOrder || []), feature.id]
      }));
      return feature;
    },

    updateFeature: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          items: {
            ...prev.items,
            [id]: { ...prev.items[id], ...updates }
          },
          features: {
            ...prev.features,
            [id]: { ...prev.features[id], ...updates }
          }
        }),
        () => tasksApi.updateFeature(id, updates)
      );
    },

    deleteFeature: async (id) => {
      await tasksApi.deleteFeature(id);
      setData(prev => {
        const newItems = { ...prev.items };
        const newFeatures = { ...prev.features };
        const newTasks = { ...prev.tasks };
        const newTaskCategories = { ...prev.taskCategories };
        const newCategories = { ...prev.categories };
        const newSections = { ...prev.sections };

        const item = newItems[id];
        if (item) {
          for (const taskId of item.taskOrder || []) {
            delete newTasks[taskId];
          }
          for (const catId of item.categoryOrder || []) {
            delete newTaskCategories[catId];
          }
        }
        // Legacy cleanup
        Object.values(prev.categories || {})
          .filter(cat => cat.parentType === 'feature' && cat.parentId === id)
          .forEach(cat => {
            for (const taskId of cat.taskOrder || []) {
              delete newTasks[taskId];
            }
            delete newCategories[cat.id];
          });
        delete newItems[id];
        delete newFeatures[id];

        // Update section itemOrder
        if (newSections[SYSTEM_SECTIONS.FEATURES]) {
          newSections[SYSTEM_SECTIONS.FEATURES] = {
            ...newSections[SYSTEM_SECTIONS.FEATURES],
            itemOrder: newSections[SYSTEM_SECTIONS.FEATURES].itemOrder.filter(iid => iid !== id)
          };
        }

        return {
          ...prev,
          items: newItems,
          features: newFeatures,
          tasks: newTasks,
          taskCategories: newTaskCategories,
          categories: newCategories,
          sections: newSections,
          globalFeatureOrder: (prev.globalFeatureOrder || []).filter(fid => fid !== id)
        };
      });
    },

    // Bugs (maps to items in Bugs section)
    createBug: async (title = 'New Bug') => {
      const bug = await tasksApi.createBug({ title });
      setData(prev => ({
        ...prev,
        items: { ...prev.items, [bug.id]: bug },
        bugs: { ...prev.bugs, [bug.id]: bug },
        sections: {
          ...prev.sections,
          [SYSTEM_SECTIONS.BUGS]: {
            ...prev.sections[SYSTEM_SECTIONS.BUGS],
            itemOrder: [...(prev.sections[SYSTEM_SECTIONS.BUGS]?.itemOrder || []), bug.id]
          }
        },
        globalBugOrder: [...(prev.globalBugOrder || []), bug.id]
      }));
      return bug;
    },

    updateBug: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          items: {
            ...prev.items,
            [id]: { ...prev.items[id], ...updates }
          },
          bugs: {
            ...prev.bugs,
            [id]: { ...prev.bugs[id], ...updates }
          }
        }),
        () => tasksApi.updateBug(id, updates)
      );
    },

    deleteBug: async (id) => {
      await tasksApi.deleteBug(id);
      setData(prev => {
        const newItems = { ...prev.items };
        const newBugs = { ...prev.bugs };
        const newTasks = { ...prev.tasks };
        const newTaskCategories = { ...prev.taskCategories };
        const newCategories = { ...prev.categories };
        const newSections = { ...prev.sections };

        const item = newItems[id];
        if (item) {
          for (const taskId of item.taskOrder || []) {
            delete newTasks[taskId];
          }
          for (const catId of item.categoryOrder || []) {
            delete newTaskCategories[catId];
          }
        }
        Object.values(prev.categories || {})
          .filter(cat => cat.parentType === 'bug' && cat.parentId === id)
          .forEach(cat => {
            for (const taskId of cat.taskOrder || []) {
              delete newTasks[taskId];
            }
            delete newCategories[cat.id];
          });
        delete newItems[id];
        delete newBugs[id];

        // Update section itemOrder
        if (newSections[SYSTEM_SECTIONS.BUGS]) {
          newSections[SYSTEM_SECTIONS.BUGS] = {
            ...newSections[SYSTEM_SECTIONS.BUGS],
            itemOrder: newSections[SYSTEM_SECTIONS.BUGS].itemOrder.filter(iid => iid !== id)
          };
        }

        return {
          ...prev,
          items: newItems,
          bugs: newBugs,
          tasks: newTasks,
          taskCategories: newTaskCategories,
          categories: newCategories,
          sections: newSections,
          globalBugOrder: (prev.globalBugOrder || []).filter(bid => bid !== id)
        };
      });
    },

    // Convert feature or bug to a task of another feature
    convertToTask: async (sourceType, sourceId, targetFeatureId) => {
      // Get the source item
      const sourceItem = sourceType === 'feature'
        ? data?.features?.[sourceId]
        : data?.bugs?.[sourceId];

      if (!sourceItem || !data?.features?.[targetFeatureId]) return null;
      if (sourceType === 'feature' && sourceId === targetFeatureId) return null;

      // Create the task with the source's data
      const task = await tasksApi.createTask({
        parentType: 'feature',
        parentId: targetFeatureId,
        categoryId: null,
        title: sourceItem.title,
        description: sourceItem.description || ''
      });

      // Delete the original
      if (sourceType === 'feature') {
        await tasksApi.deleteFeature(sourceId);
      } else {
        await tasksApi.deleteBug(sourceId);
      }

      // Update state
      setData(prev => {
        const updated = {
          ...prev,
          tasks: { ...prev.tasks, [task.id]: task },
          features: {
            ...prev.features,
            [targetFeatureId]: {
              ...prev.features[targetFeatureId],
              taskOrder: [...(prev.features[targetFeatureId].taskOrder || []), task.id]
            }
          }
        };

        // Remove the source item
        if (sourceType === 'feature') {
          const newFeatures = { ...updated.features };
          delete newFeatures[sourceId];
          updated.features = newFeatures;
          updated.globalFeatureOrder = prev.globalFeatureOrder.filter(id => id !== sourceId);
          // Clean up tasks and categories of the deleted feature
          const deletedFeature = prev.features[sourceId];
          if (deletedFeature) {
            const newTasks = { ...updated.tasks };
            const newCategories = { ...prev.categories };
            for (const taskId of deletedFeature.taskOrder || []) {
              delete newTasks[taskId];
            }
            Object.values(prev.categories || {})
              .filter(cat => cat.parentType === 'feature' && cat.parentId === sourceId)
              .forEach(cat => {
                for (const taskId of cat.taskOrder || []) {
                  delete newTasks[taskId];
                }
                delete newCategories[cat.id];
              });
            updated.tasks = newTasks;
            updated.categories = newCategories;
          }
        } else {
          const newBugs = { ...prev.bugs };
          delete newBugs[sourceId];
          updated.bugs = newBugs;
          updated.globalBugOrder = prev.globalBugOrder.filter(id => id !== sourceId);
          // Clean up tasks and categories of the deleted bug
          const deletedBug = prev.bugs[sourceId];
          if (deletedBug) {
            const newTasks = { ...updated.tasks };
            const newCategories = { ...prev.categories };
            for (const taskId of deletedBug.taskOrder || []) {
              delete newTasks[taskId];
            }
            Object.values(prev.categories || {})
              .filter(cat => cat.parentType === 'bug' && cat.parentId === sourceId)
              .forEach(cat => {
                for (const taskId of cat.taskOrder || []) {
                  delete newTasks[taskId];
                }
                delete newCategories[cat.id];
              });
            updated.tasks = newTasks;
            updated.categories = newCategories;
          }
        }

        return updated;
      });

      return task;
    },

    // Tasks
    createTask: async (parentType, parentId, categoryId = null, title = 'New Task') => {
      const task = await tasksApi.createTask({ parentType, parentId, categoryId, title });
      setData(prev => {
        const updated = {
          ...prev,
          tasks: { ...prev.tasks, [task.id]: task }
        };

        if (categoryId && prev.categories[categoryId]) {
          updated.categories = {
            ...prev.categories,
            [categoryId]: {
              ...prev.categories[categoryId],
              taskOrder: [...prev.categories[categoryId].taskOrder, task.id]
            }
          };
        } else if (parentType === 'feature' && prev.features[parentId]) {
          updated.features = {
            ...prev.features,
            [parentId]: {
              ...prev.features[parentId],
              taskOrder: [...prev.features[parentId].taskOrder, task.id]
            }
          };
        } else if (parentType === 'bug' && prev.bugs[parentId]) {
          updated.bugs = {
            ...prev.bugs,
            [parentId]: {
              ...prev.bugs[parentId],
              taskOrder: [...prev.bugs[parentId].taskOrder, task.id]
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

        // Remove from parent's task order
        if (task.categoryId && prev.categories[task.categoryId]) {
          updated.categories = {
            ...prev.categories,
            [task.categoryId]: {
              ...prev.categories[task.categoryId],
              taskOrder: prev.categories[task.categoryId].taskOrder.filter(tid => tid !== id)
            }
          };
        } else if (task.parentType === 'feature' && prev.features[task.parentId]) {
          updated.features = {
            ...prev.features,
            [task.parentId]: {
              ...prev.features[task.parentId],
              taskOrder: prev.features[task.parentId].taskOrder.filter(tid => tid !== id)
            }
          };
        } else if (task.parentType === 'bug' && prev.bugs[task.parentId]) {
          updated.bugs = {
            ...prev.bugs,
            [task.parentId]: {
              ...prev.bugs[task.parentId],
              taskOrder: prev.bugs[task.parentId].taskOrder.filter(tid => tid !== id)
            }
          };
        }

        return updated;
      });
    },

    // Categories
    createCategory: async (parentType, parentId, name = 'New Category') => {
      const category = await tasksApi.createCategory({ parentType, parentId, name });
      setData(prev => ({
        ...prev,
        categories: { ...prev.categories, [category.id]: category }
      }));
      return category;
    },

    updateCategory: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          categories: {
            ...prev.categories,
            [id]: { ...prev.categories[id], ...updates }
          }
        }),
        () => tasksApi.updateCategory(id, updates)
      );
    },

    deleteCategory: async (id) => {
      await tasksApi.deleteCategory(id);
      await loadData(); // Reload to get proper task reassignment
    },

    // Reorder
    reorderFeatures: (newOrder) => {
      optimisticUpdate(
        prev => ({ ...prev, globalFeatureOrder: newOrder }),
        () => tasksApi.reorder('features', null, newOrder)
      );
    },

    reorderBugs: (newOrder) => {
      optimisticUpdate(
        prev => ({ ...prev, globalBugOrder: newOrder }),
        () => tasksApi.reorder('bugs', null, newOrder)
      );
    },

    reorderTasks: (parentId, newOrder, isCategory = false) => {
      optimisticUpdate(
        prev => {
          if (isCategory) {
            return {
              ...prev,
              categories: {
                ...prev.categories,
                [parentId]: { ...prev.categories[parentId], taskOrder: newOrder }
              }
            };
          }
          if (prev.features[parentId]) {
            return {
              ...prev,
              features: {
                ...prev.features,
                [parentId]: { ...prev.features[parentId], taskOrder: newOrder }
              }
            };
          }
          if (prev.bugs[parentId]) {
            return {
              ...prev,
              bugs: {
                ...prev.bugs,
                [parentId]: { ...prev.bugs[parentId], taskOrder: newOrder }
              }
            };
          }
          return prev;
        },
        () => tasksApi.reorder('tasks', parentId, newOrder)
      );
    },

    // Feature Categories
    createFeatureCategory: async (name = 'New Category') => {
      const category = await tasksApi.createFeatureCategory({ name });
      setData(prev => ({
        ...prev,
        featureCategories: { ...prev.featureCategories, [category.id]: category },
        featureCategoryOrder: [...(prev.featureCategoryOrder || []), category.id]
      }));
      return category;
    },

    updateFeatureCategory: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          featureCategories: {
            ...prev.featureCategories,
            [id]: { ...prev.featureCategories[id], ...updates }
          }
        }),
        () => tasksApi.updateFeatureCategory(id, updates)
      );
    },

    deleteFeatureCategory: async (id) => {
      await tasksApi.deleteFeatureCategory(id);
      await loadData();
    },

    moveFeatureToCategory: async (featureId, targetCategoryId) => {
      await tasksApi.moveFeature({ featureId, targetCategoryId });
      await loadData();
    },

    reorderFeatureCategories: (newOrder) => {
      optimisticUpdate(
        prev => ({ ...prev, featureCategoryOrder: newOrder }),
        () => tasksApi.reorder('feature-categories', null, newOrder)
      );
    },

    reorderFeaturesInCategory: (categoryId, newOrder) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          featureCategories: {
            ...prev.featureCategories,
            [categoryId]: { ...prev.featureCategories[categoryId], featureOrder: newOrder }
          }
        }),
        () => tasksApi.reorder('features-in-category', categoryId, newOrder)
      );
    },

    // Bug Categories
    createBugCategory: async (name = 'New Category') => {
      const category = await tasksApi.createBugCategory({ name });
      setData(prev => ({
        ...prev,
        bugCategories: { ...prev.bugCategories, [category.id]: category },
        bugCategoryOrder: [...(prev.bugCategoryOrder || []), category.id]
      }));
      return category;
    },

    updateBugCategory: (id, updates) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          bugCategories: {
            ...prev.bugCategories,
            [id]: { ...prev.bugCategories[id], ...updates }
          }
        }),
        () => tasksApi.updateBugCategory(id, updates)
      );
    },

    deleteBugCategory: async (id) => {
      await tasksApi.deleteBugCategory(id);
      await loadData();
    },

    moveBugToCategory: async (bugId, targetCategoryId) => {
      await tasksApi.moveBug({ bugId, targetCategoryId });
      await loadData();
    },

    reorderBugCategories: (newOrder) => {
      optimisticUpdate(
        prev => ({ ...prev, bugCategoryOrder: newOrder }),
        () => tasksApi.reorder('bug-categories', null, newOrder)
      );
    },

    reorderBugsInCategory: (categoryId, newOrder) => {
      optimisticUpdate(
        prev => ({
          ...prev,
          bugCategories: {
            ...prev.bugCategories,
            [categoryId]: { ...prev.bugCategories[categoryId], bugOrder: newOrder }
          }
        }),
        () => tasksApi.reorder('bugs-in-category', categoryId, newOrder)
      );
    },

    // Reorder task categories within a feature/bug
    reorderCategories: (parentType, parentId, newOrder) => {
      if (parentType === 'feature') {
        optimisticUpdate(
          prev => ({
            ...prev,
            features: {
              ...prev.features,
              [parentId]: { ...prev.features[parentId], categoryOrder: newOrder }
            }
          }),
          () => tasksApi.reorder('categories', parentId, newOrder)
        );
      } else if (parentType === 'bug') {
        optimisticUpdate(
          prev => ({
            ...prev,
            bugs: {
              ...prev.bugs,
              [parentId]: { ...prev.bugs[parentId], categoryOrder: newOrder }
            }
          }),
          () => tasksApi.reorder('categories', parentId, newOrder)
        );
      }
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
      // Update local state
      setData(prev => {
        let collection;
        switch (itemType) {
          case 'task': collection = 'tasks'; break;
          case 'feature': collection = 'features'; break;
          case 'bug': collection = 'bugs'; break;
          default: return prev;
        }
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
      // Update local state
      setData(prev => {
        let collection;
        switch (itemType) {
          case 'task': collection = 'tasks'; break;
          case 'feature': collection = 'features'; break;
          case 'bug': collection = 'bugs'; break;
          default: return prev;
        }
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

// Selector hook for specific feature
export function useFeature(featureId) {
  const { data } = useTaskData();
  return useMemo(() => data?.features?.[featureId] || null, [data?.features, featureId]);
}

// Selector hook for specific bug
export function useBug(bugId) {
  const { data } = useTaskData();
  return useMemo(() => data?.bugs?.[bugId] || null, [data?.bugs, bugId]);
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
