import { memo, useMemo, useCallback, useState, useRef, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTaskData, useTaskActions, useUIState } from '../../context/TaskProvider';
import TaskItem from './TaskItem';

const ChevronIcon = ({ expanded }) => (
  <svg
    className={`category-toggle ${expanded ? '' : 'collapsed'}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const DragIcon = () => (
  <svg className="task-drag-handle" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

// Sortable task item
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

// Droppable category section with tasks
function DroppableTaskCategory({ category, tasks, tags, selectedTaskId, onSelectTask, onToggleTask, onUpdateCategory, onDeleteCategory, onAddTask, dragHandleProps }) {
  const expanded = category.expanded !== false;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const isEditingRef = useRef(false);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    if (!isEditingRef.current) {
      setEditName(category.name);
    }
  }, [category.name]);

  const { setNodeRef, isOver } = useDroppable({
    id: `task-category-${category.id}`,
    data: { type: 'task-category', categoryId: category.id }
  });

  const toggleExpanded = useCallback(() => {
    onUpdateCategory(category.id, { expanded: !expanded });
  }, [category.id, expanded, onUpdateCategory]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    if (confirm(`Delete category "${category.name}"? Tasks will be moved to uncategorized.`)) {
      onDeleteCategory(category.id);
    }
  }, [category.id, category.name, onDeleteCategory]);

  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== category.name) {
      onUpdateCategory(category.id, { name: editName.trim() });
    }
    setIsEditing(false);
  }, [editName, category.id, category.name, onUpdateCategory]);

  const remainingCount = tasks.filter(t => t.status !== 'done').length;

  return (
    <>
      <div className="category-header" onClick={toggleExpanded}>
        {dragHandleProps && (
          <div {...dragHandleProps} onClick={(e) => e.stopPropagation()}>
            <DragIcon />
          </div>
        )}
        <ChevronIcon expanded={expanded} />
        {isEditing ? (
          <input
            type="text"
            className="category-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSubmit();
              if (e.key === 'Escape') { setEditName(category.name); setIsEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            style={{
              flex: 1,
              padding: '2px 6px',
              border: '1px solid var(--accent)',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'var(--bg-input)',
              color: 'var(--text-primary)'
            }}
          />
        ) : (
          <span
            className="category-name"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => setIsEditing(true)}
          >
            {category.name}
          </span>
        )}
        <span className="category-count">{remainingCount}</span>
        {onAddTask && (
          <button
            className="btn btn-ghost btn-sm category-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddTask(category.id);
            }}
            title="Add task to category"
          >
            <PlusIcon />
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm category-delete"
          onClick={handleDelete}
          title="Delete category"
        >
          <TrashIcon />
        </button>
      </div>

      {expanded && (
        <div
          ref={setNodeRef}
          className="category-tasks"
          style={{
            background: isOver ? 'var(--bg-hover)' : undefined,
            borderRadius: isOver ? '6px' : undefined,
            transition: 'background 0.15s ease'
          }}
        >
          {tasks.map(task => (
            <SortableTaskItem
              key={task.id}
              task={task}
              tags={tags}
              isSelected={selectedTaskId === task.id}
              onSelect={onSelectTask}
              onToggle={onToggleTask}
            />
          ))}
          {tasks.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
              No tasks in this category
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Draggable wrapper for category
function DraggableTaskCategory({ category, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `tcat-${category.id}` });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="category-section">
      <DroppableTaskCategory
        category={category}
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Droppable uncategorized zone
function DroppableUncategorizedTasks({ tasks, tags, selectedTaskId, onSelectTask, onToggleTask, showHeader }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'uncategorized-tasks',
    data: { type: 'task-category', categoryId: null }
  });

  return (
    <div className="category-section">
      {showHeader && (
        <div className="category-header">
          <span className="category-name">Uncategorized</span>
          <span className="category-count">{tasks.filter(t => t.status !== 'done').length}</span>
        </div>
      )}
      <div
        ref={setNodeRef}
        className="category-tasks"
        style={{
          background: isOver ? 'var(--bg-hover)' : undefined,
          borderRadius: isOver ? '6px' : undefined,
          transition: 'background 0.15s ease'
        }}
      >
        {tasks.map(task => (
          <SortableTaskItem
            key={task.id}
            task={task}
            tags={tags}
            isSelected={selectedTaskId === task.id}
            onSelect={onSelectTask}
            onToggle={onToggleTask}
          />
        ))}
        {tasks.length === 0 && showHeader && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Drop tasks here to uncategorize
          </div>
        )}
      </div>
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Get the parent (feature or bug) from unified items
  const parent = useMemo(() => {
    return data?.items?.[parentId];
  }, [data?.items, parentId]);

  // Get categories for this parent, ordered by categoryOrder
  const categories = useMemo(() => {
    if (!data?.taskCategories || !parent) return [];

    const categoryOrder = parent.categoryOrder || [];
    const allCategories = Object.values(data.taskCategories)
      .filter(cat => cat.parentId === parentId);

    return allCategories.sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.id);
      const bIndex = categoryOrder.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [data?.taskCategories, parent, parentId]);

  // Get uncategorized tasks
  const uncategorizedTasksRaw = useMemo(() => {
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

  const uncategorizedTasks = useMemo(() => filterTasks(uncategorizedTasksRaw), [uncategorizedTasksRaw, filterTasks]);

  // Get tasks for a category
  const getCategoryTasks = useCallback((category) => {
    if (!data?.tasks) return [];
    const tasks = (category.taskOrder || [])
      .map(id => data.tasks[id])
      .filter(Boolean);
    return filterTasks(tasks);
  }, [data?.tasks, filterTasks]);

  // Add task to a specific category
  const handleAddTaskToCategory = useCallback(async (categoryId) => {
    const task = await createTask(parentType, parentId, categoryId, 'New Task');
    selectTask(task.id);
  }, [createTask, parentType, parentId, selectTask]);

  // Build all sortable IDs (categories prefixed with tcat-, then all tasks)
  const allSortableIds = useMemo(() => {
    const ids = [];
    // Add category IDs
    categories.forEach(cat => ids.push(`tcat-${cat.id}`));
    // Add task IDs from each category
    categories.forEach(cat => {
      const catTasks = getCategoryTasks(cat);
      catTasks.forEach(task => ids.push(task.id));
    });
    // Add uncategorized task IDs
    uncategorizedTasks.forEach(task => ids.push(task.id));
    return ids;
  }, [categories, getCategoryTasks, uncategorizedTasks]);

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
          {categories.map(category => (
            <DraggableTaskCategory
              key={category.id}
              category={category}
              tasks={getCategoryTasks(category)}
              tags={data?.tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onToggleTask={toggleTaskComplete}
              onUpdateCategory={updateCategory}
              onDeleteCategory={deleteCategory}
              onAddTask={handleAddTaskToCategory}
            />
          ))}

          {/* Uncategorized tasks */}
          {(uncategorizedTasks.length > 0 || categories.length > 0) && (
            <DroppableUncategorizedTasks
              tasks={uncategorizedTasks}
              tags={data?.tags}
              selectedTaskId={selectedTaskId}
              onSelectTask={selectTask}
              onToggleTask={toggleTaskComplete}
              showHeader={categories.length > 0}
            />
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
