import { memo, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { useTaskData, useTaskActions, useUIState } from '../../context/TaskProvider';
import CategorySection from './CategorySection';
import TaskItem from './TaskItem';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Draggable wrapper for category
function DraggableCategory({ category, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="category-section">
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

function SortableTaskItem({ task, tags, isSelected, onSelect, onToggle }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TaskItem
        task={task}
        tags={tags}
        isSelected={isSelected}
        onSelect={onSelect}
        onToggle={onToggle}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function TaskList({ parentType, parentId }) {
  const { data } = useTaskData();
  const {
    createTask,
    toggleTaskComplete,
    updateCategory,
    deleteCategory,
    reorderTasks,
    reorderCategories
  } = useTaskActions();
  const { selectedTaskId, selectTask, searchQuery } = useUIState();

  // Add task to a specific category
  const handleAddTaskToCategory = useCallback(async (categoryId) => {
    const task = await createTask(parentType, parentId, categoryId, 'New Task');
    selectTask(task.id);
  }, [createTask, parentType, parentId, selectTask]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  // Get the parent (feature or bug) from unified items
  const parent = useMemo(() => {
    return data?.items?.[parentId];
  }, [data?.items, parentId]);

  // Get categories for this parent, ordered by categoryOrder if available
  const categories = useMemo(() => {
    if (!data?.taskCategories || !parent) return [];

    const categoryOrder = parent.categoryOrder || [];
    const allCategories = Object.values(data.taskCategories)
      .filter(cat => cat.parentId === parentId);

    // Sort by categoryOrder, putting unordered categories at the end
    return allCategories.sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.id);
      const bIndex = categoryOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [data?.taskCategories, parent, parentId]);

  // Get uncategorized tasks (tasks directly under parent, not in any category)
  const uncategorizedTasks = useMemo(() => {
    if (!parent || !data?.tasks) return [];
    return (parent.taskOrder || [])
      .map(id => data.tasks[id])
      .filter(task => task && !task.categoryId);
  }, [parent, data?.tasks]);

  // Filter by search query
  const filterTasks = useCallback((tasks) => {
    if (!searchQuery) return tasks;
    const query = searchQuery.toLowerCase();
    return tasks.filter(task =>
      task.title.toLowerCase().includes(query) ||
      (task.description || '').toLowerCase().includes(query)
    );
  }, [searchQuery]);

  // Get tasks for a category
  const getCategoryTasks = useCallback((category) => {
    if (!data?.tasks) return [];
    return (category.taskOrder || [])
      .map(id => data.tasks[id])
      .filter(Boolean);
  }, [data?.tasks]);

  // Handle drag end for tasks
  const handleTaskDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Find which list the item is in
    const activeTask = data?.tasks?.[active.id];
    if (!activeTask) return;

    // Determine which order array to update
    if (activeTask.categoryId) {
      const category = data?.taskCategories?.[activeTask.categoryId];
      if (category) {
        const oldIndex = category.taskOrder.indexOf(active.id);
        const newIndex = category.taskOrder.indexOf(over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = [...category.taskOrder];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, active.id);
          reorderTasks(activeTask.categoryId, newOrder, true);
        }
      }
    } else {
      // Uncategorized task - update parent's task order
      if (parent) {
        const oldIndex = parent.taskOrder.indexOf(active.id);
        const newIndex = parent.taskOrder.indexOf(over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = [...parent.taskOrder];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, active.id);
          reorderTasks(parentId, newOrder, false);
        }
      }
    }
  }, [data, parent, parentId, reorderTasks]);

  // Handle drag end for categories
  const handleCategoryDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const categoryIds = categories.map(c => c.id);
    const oldIndex = categoryIds.indexOf(active.id);
    const newIndex = categoryIds.indexOf(over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = [...categoryIds];
      newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, active.id);
      reorderCategories(parentType, parentId, newOrder);
    }
  }, [categories, parentType, parentId, reorderCategories]);

  if (!parent) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Select a feature or bug</div>
        <div className="empty-state-text">
          Choose a feature or bug from the sidebar to see its tasks
        </div>
      </div>
    );
  }

  const filteredUncategorized = filterTasks(uncategorizedTasks);
  const hasContent = categories.length > 0 || filteredUncategorized.length > 0;

  return (
    <div className="task-list">
      {/* Categories with drag-and-drop reordering */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleCategoryDragEnd}
      >
        <SortableContext
          items={categories.map(c => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {categories.map(category => {
            const categoryTasks = filterTasks(getCategoryTasks(category));
            return (
              <DraggableCategory key={category.id} category={category}>
                {({ dragHandleProps }) => (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleTaskDragEnd}
                  >
                    <SortableContext
                      items={categoryTasks.map(t => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <CategorySection
                        category={category}
                        tasks={categoryTasks}
                        tags={data?.tags}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={selectTask}
                        onToggleTask={toggleTaskComplete}
                        onUpdateCategory={updateCategory}
                        onDeleteCategory={deleteCategory}
                        onAddTask={handleAddTaskToCategory}
                        dragHandleProps={dragHandleProps}
                      />
                    </SortableContext>
                  </DndContext>
                )}
              </DraggableCategory>
            );
          })}
        </SortableContext>
      </DndContext>

      {/* Uncategorized tasks */}
      {filteredUncategorized.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleTaskDragEnd}
        >
          <div className="category-section">
            {categories.length > 0 && (
              <div className="category-header">
                <span className="category-name">Uncategorized</span>
                <span className="category-count">{filteredUncategorized.filter(t => t.status !== 'done').length}</span>
              </div>
            )}
            <SortableContext
              items={filteredUncategorized.map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="category-tasks">
                {filteredUncategorized.map(task => (
                  <SortableTaskItem
                    key={task.id}
                    task={task}
                    tags={data?.tags}
                    isSelected={selectedTaskId === task.id}
                    onSelect={selectTask}
                    onToggle={toggleTaskComplete}
                  />
                ))}
              </div>
            </SortableContext>
          </div>
        </DndContext>
      )}

      {/* Empty state */}
      {!hasContent && (
        <div className="empty-state">
          <div className="empty-state-title">No tasks yet</div>
          <div className="empty-state-text">
            Click the + button to add a task
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(TaskList);
