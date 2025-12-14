import { memo, useMemo, useCallback } from 'react';
import { useTaskData, useTaskActions, useUIState } from '../../context/TaskProvider';
import { useSortableList } from '../../hooks/useSortableList';
import { useDragHandlers } from '../../hooks/useDragHandlers';
import { CategorizedList, SortableItemWrapper } from '../shared/CategoryList';
import TaskItem from './TaskItem';

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

  // Callbacks for drag handlers
  const handleReorderCategories = useCallback((newOrder) => {
    reorderCategories(parentType, parentId, newOrder);
  }, [reorderCategories, parentType, parentId]);

  const handleReorderInCategory = useCallback((categoryId, newOrder) => {
    reorderTasks(categoryId, newOrder, true);
  }, [reorderTasks]);

  const handleReorderUncategorized = useCallback((newOrder) => {
    reorderTasks(parentId, newOrder, false);
  }, [reorderTasks, parentId]);

  // Move task to category with optional insertion position
  const handleMoveToCategory = useCallback((taskId, categoryId, insertBeforeTaskId) => {
    moveTaskToCategory(taskId, categoryId, insertBeforeTaskId);
  }, [moveTaskToCategory]);

  // Use shared drag handlers
  const { handleDragEnd } = useDragHandlers({
    data,
    parent,
    parentId,
    categories,
    categoryIdPrefix: 'tcat-',
    droppableType: 'task-category',
    itemsKey: 'tasks',
    categoriesKey: 'taskCategories',
    itemOrderKey: 'taskOrder',
    onReorderCategories: handleReorderCategories,
    onMoveToCategory: handleMoveToCategory,
    onReorderInCategory: handleReorderInCategory,
    onReorderUncategorized: handleReorderUncategorized
  });

  // Add task to a specific category
  const handleAddTaskToCategory = useCallback(async (categoryId) => {
    const task = await createTask(parentType, parentId, categoryId, 'New Task');
    selectTask(task.id);
  }, [createTask, parentType, parentId, selectTask]);

  // Render a single task item
  const renderTask = useCallback((task) => (
    <SortableItemWrapper key={task.id} id={task.id}>
      {({ dragHandleProps }) => (
        <TaskItem
          task={task}
          tags={data?.tags}
          isSelected={selectedTaskId === task.id}
          onSelect={selectTask}
          onToggle={toggleTaskComplete}
          dragHandleProps={dragHandleProps}
        />
      )}
    </SortableItemWrapper>
  ), [data?.tags, selectedTaskId, selectTask, toggleTaskComplete]);

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

  return (
    <CategorizedList
      sensors={sensors}
      allSortableIds={allSortableIds}
      categories={categories}
      uncategorizedItems={uncategorizedTasks}
      getCategoryItems={getCategoryTasks}
      getNonCompletedCount={getNonCompletedCount}
      renderItem={renderTask}
      onDragEnd={handleDragEnd}
      categoryIdPrefix="tcat-"
      droppableType="task-category"
      droppableIdPrefix="task-category-"
      uncategorizedDroppableId="uncategorized-tasks"
      onUpdateCategory={updateCategory}
      onDeleteCategory={deleteCategory}
      onAddToCategory={handleAddTaskToCategory}
      itemLabel="task"
      emptyState={
        <div className="empty-state">
          <div className="empty-state-title">No tasks yet</div>
          <div className="empty-state-text">
            Click the + button to add a task
          </div>
        </div>
      }
    />
  );
}

export default memo(TaskList);
