import { memo, useMemo, useCallback } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTaskData, useTaskActions, useUIState } from '../../context/TaskProvider';
import { useSortableList } from '../../hooks/useSortableList';
import { DraggableCategoryWrapper, DroppableUncategorizedZone } from '../shared/CategoryList';
import TaskItem from './TaskItem';

// Sortable task item wrapper
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
    moveTaskToCategory,
    reorderTasks,
    reorderCategories
  } = useTaskActions();
  const { selectedTaskId, selectTask, searchQuery } = useUIState();

  // Get the parent (feature or bug) from unified items
  const parent = useMemo(() => {
    return data?.items?.[parentId];
  }, [data?.items, parentId]);

  // Use shared sortable list hook
  const {
    sensors,
    categories,
    uncategorizedItems: uncategorizedTasks,
    allSortableIds,
    getCategoryItems: getCategoryTasks,
    getNonCompletedCount
  } = useSortableList({
    data,
    parentId,
    parent,
    categoriesKey: 'taskCategories',
    itemsKey: 'tasks',
    itemOrderKey: 'taskOrder',
    searchQuery,
    categoryIdPrefix: 'tcat-'
  });

  // Add task to a specific category
  const handleAddTaskToCategory = useCallback(async (categoryId) => {
    const task = await createTask(parentType, parentId, categoryId, 'New Task');
    selectTask(task.id);
  }, [createTask, parentType, parentId, selectTask]);

  // Unified drag end handler
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle category drag (prefixed with tcat-)
    if (activeId.startsWith('tcat-')) {
      if (!overId.startsWith('tcat-')) return;

      const activeCatId = activeId.replace('tcat-', '');
      const overCatId = overId.replace('tcat-', '');

      if (activeCatId === overCatId) return;

      const oldIndex = categories.findIndex(c => c.id === activeCatId);
      const newIndex = categories.findIndex(c => c.id === overCatId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = categories.map(c => c.id);
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, activeCatId);
        reorderCategories(parentType, parentId, newOrder);
      }
      return;
    }

    // Handle task drag
    const activeTask = data?.tasks?.[activeId];
    if (!activeTask) return;

    // Check if dropped on a category zone (droppable)
    const overData = over.data?.current;
    if (overData?.type === 'task-category') {
      const targetCategoryId = overData.categoryId;
      const currentCategoryId = activeTask.categoryId || null;

      if (targetCategoryId !== currentCategoryId) {
        moveTaskToCategory(activeId, targetCategoryId);
        return;
      }
    }

    // Check if dropped on another task
    const overTask = data?.tasks?.[overId];
    if (overTask) {
      const targetCategoryId = overTask.categoryId || null;
      const currentCategoryId = activeTask.categoryId || null;

      // Prevent mixing completed and non-completed tasks when reordering
      const activeCompleted = activeTask.status === 'done';
      const overCompleted = overTask.status === 'done';
      if (activeCompleted !== overCompleted) {
        return;
      }

      // If tasks are in different categories, move to target category
      if (targetCategoryId !== currentCategoryId) {
        moveTaskToCategory(activeId, targetCategoryId);
        return;
      }

      // Same category - reorder within that category
      if (targetCategoryId) {
        const category = data?.taskCategories?.[targetCategoryId];
        if (category) {
          const taskOrder = category.taskOrder || [];
          const oldIndex = taskOrder.indexOf(activeId);
          const newIndex = taskOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newOrder = [...taskOrder];
            newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, activeId);
            reorderTasks(targetCategoryId, newOrder, true);
          }
        }
      } else {
        // Both uncategorized - reorder in parent's taskOrder
        const parentTaskOrder = parent?.taskOrder || [];
        const uncatIds = parentTaskOrder.filter(id => {
          const task = data.tasks[id];
          return task && !task.categoryId;
        });
        const oldIndex = uncatIds.indexOf(activeId);
        const newIndex = uncatIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = [...uncatIds];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, activeId);
          // Rebuild full taskOrder: categorized tasks stay, uncategorized get new order
          const categorizedIds = parentTaskOrder.filter(id => {
            const task = data.tasks[id];
            return task && task.categoryId;
          });
          reorderTasks(parentId, [...categorizedIds, ...newOrder], false);
        }
      }
    }
  }, [data, parent, parentId, parentType, categories, moveTaskToCategory, reorderTasks, reorderCategories]);

  // Render tasks for a category
  const renderTasks = useCallback((tasks) => {
    return tasks.map(task => (
      <SortableTaskItem
        key={task.id}
        task={task}
        tags={data?.tags}
        isSelected={selectedTaskId === task.id}
        onSelect={selectTask}
        onToggle={toggleTaskComplete}
      />
    ));
  }, [data?.tags, selectedTaskId, selectTask, toggleTaskComplete]);

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

  const hasContent = categories.length > 0 || uncategorizedTasks.length > 0;

  return (
    <div className="task-list">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
          {/* Categories with their tasks */}
          {categories.map(category => {
            const tasks = getCategoryTasks(category);
            return (
              <DraggableCategoryWrapper
                key={category.id}
                category={category}
                sortableId={`tcat-${category.id}`}
                droppableId={`task-category-${category.id}`}
                droppableData={{ type: 'task-category', categoryId: category.id }}
                onUpdateCategory={updateCategory}
                onDeleteCategory={deleteCategory}
                onAddItem={handleAddTaskToCategory}
                deleteConfirmMessage={`Delete category "${category.name}"? Tasks will be moved to uncategorized.`}
                emptyMessage="No tasks in this category"
                itemCount={getNonCompletedCount(tasks)}
              >
                {renderTasks(tasks)}
              </DraggableCategoryWrapper>
            );
          })}

          {/* Uncategorized tasks */}
          {(uncategorizedTasks.length > 0 || categories.length > 0) && (
            <DroppableUncategorizedZone
              droppableId="uncategorized-tasks"
              droppableData={{ type: 'task-category', categoryId: null }}
              showHeader={categories.length > 0}
              headerLabel="Uncategorized"
              itemCount={getNonCompletedCount(uncategorizedTasks)}
              emptyMessage="Drop tasks here to uncategorize"
            >
              {renderTasks(uncategorizedTasks)}
            </DroppableUncategorizedZone>
          )}
        </SortableContext>
      </DndContext>

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
