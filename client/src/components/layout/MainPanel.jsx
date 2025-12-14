import { memo, useState, useCallback, useEffect } from 'react';
import { DndContext, DragOverlay, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTaskData, useTaskActions, useUIState, SYSTEM_SECTIONS } from '../../context/TaskProvider';
import { useToast } from '../../context/ToastContext';
import { useSortableList } from '../../hooks/useSortableList';
import { DraggableCategoryWrapper, DroppableUncategorizedZone } from '../shared/CategoryList';
import { DragIcon, PlusIcon } from '../shared/icons';
import TaskList from '../tasks/TaskList';
import { PRIORITIES, COMPLEXITIES } from '../../services/api';

// Icons specific to MainPanel
const FolderIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const FeatureIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);

function MainPanel() {
  const { data } = useTaskData();
  const { createTask, createCategory, createItem, deleteItem, updateItem, createItemCategory } = useTaskActions();
  const { activeView, activeSectionId, activeItemId, searchQuery, setSearchQuery, setActiveView, setActiveSection, selectItem, selectTask } = useUIState();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  // Get current section
  const currentSection = data?.sections?.[activeSectionId];

  // Get current parent item (for item view)
  const currentItem = activeView === 'item' ? data?.items?.[activeItemId] : null;

  // Get title based on view
  const getTitle = () => {
    switch (activeView) {
      case 'section':
        return currentSection?.name || 'Section';
      case 'item':
        return currentItem?.title || 'Item';
      default: return 'Tasks';
    }
  };

  const handleAddTask = useCallback(async () => {
    if (!activeItemId) return;
    const item = data?.items?.[activeItemId];
    const parentType = item?.sectionId === SYSTEM_SECTIONS.BUGS ? 'bug' : 'feature';
    const task = await createTask(parentType, activeItemId, null, 'New Task');
    setShowAddMenu(false);
    selectTask(task.id);
  }, [activeItemId, data?.items, createTask, selectTask]);

  const handleAddCategory = useCallback(async () => {
    if (!activeItemId) return;
    const item = data?.items?.[activeItemId];
    const parentType = item?.sectionId === SYSTEM_SECTIONS.BUGS ? 'bug' : 'feature';
    await createCategory(parentType, activeItemId, 'New Category');
    setShowAddMenu(false);
  }, [activeItemId, data?.items, createCategory]);

  const handleTitleEdit = useCallback(() => {
    if (currentItem) {
      setEditTitle(currentItem.title);
      setIsEditingTitle(true);
    }
  }, [currentItem]);

  const handleTitleSubmit = useCallback(() => {
    if (editTitle.trim() && editTitle !== currentItem?.title && activeView === 'item') {
      updateItem(activeItemId, { title: editTitle.trim() });
    }
    setIsEditingTitle(false);
  }, [editTitle, currentItem, activeView, activeItemId, updateItem]);

  const handleAddItem = useCallback(async () => {
    if (!activeSectionId) return;
    const item = await createItem(activeSectionId, 'New Item');
    setShowAddMenu(false);
    selectItem('item', item.id);
  }, [activeSectionId, createItem, selectItem]);

  const handleAddSectionCategory = useCallback(async () => {
    if (!activeSectionId) return;
    await createItemCategory(activeSectionId, 'New Category');
    setShowAddMenu(false);
  }, [activeSectionId, createItemCategory]);

  const canAdd = activeView === 'item';

  return (
    <main className="main-panel">
      <div className="main-header">
        <div className="main-header-content">
        {activeView === 'item' ? (
          <button
            className="btn btn-ghost"
            onClick={() => setActiveSection(activeSectionId)}
            title="Back to section"
          >
            <BackIcon />
          </button>
        ) : (
          <div style={{ width: '32px' }} />
        )}

        {isEditingTitle ? (
          <input
            type="text"
            className="form-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') setIsEditingTitle(false);
            }}
            autoFocus
            style={{ fontSize: '16px', fontWeight: 600, width: 'auto', minWidth: '150px' }}
          />
        ) : (
          <h2
            className="main-title"
            onDoubleClick={currentItem ? handleTitleEdit : undefined}
            style={{ cursor: currentItem ? 'pointer' : 'default' }}
          >
            {getTitle()}
          </h2>
        )}

        <div className="search-wrapper" style={{ flex: 1, maxWidth: '400px', margin: '0 16px' }}>
          <SearchIcon />
          <input
            type="text"
            className="search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {activeView === 'section' && (
          <div className="dropdown">
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              <PlusIcon size={16} />
              Add
            </button>
            {showAddMenu && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={handleAddItem}>
                  <FeatureIcon />
                  Add {currentSection?.name?.replace(/s$/, '') || 'Item'}
                </div>
                <div className="dropdown-item" onClick={handleAddSectionCategory}>
                  <FolderIcon />
                  Add Category
                </div>
              </div>
            )}
          </div>
        )}

        {canAdd && (
          <div className="dropdown">
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              <PlusIcon size={16} />
              Add
            </button>
            {showAddMenu && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={handleAddTask}>
                  <PlusIcon size={16} />
                  Add Task
                </div>
                <div className="dropdown-item" onClick={handleAddCategory}>
                  <FolderIcon />
                  Add Category
                </div>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="task-list-container">
        {activeView === 'item' && activeItemId ? (
          <TaskList
            parentType={currentItem?.sectionId === SYSTEM_SECTIONS.BUGS ? 'bug' : 'feature'}
            parentId={activeItemId}
          />
        ) : activeView === 'section' && activeSectionId ? (
          <SectionItemsList sectionId={activeSectionId} />
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Select a view</div>
            <div className="empty-state-text">
              Choose a section from the sidebar
            </div>
          </div>
        )}
      </div>

      {showAddMenu && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99
          }}
          onClick={() => setShowAddMenu(false)}
        />
      )}
    </main>
  );
}

const StatusBadge = ({ status }) => {
  const statusInfo = {
    'open': { label: 'Open', color: '#3b82f6' },
    'in-progress': { label: 'In Progress', color: '#f59e0b' },
    'done': { label: 'Done', color: '#22c55e' }
  };
  const info = statusInfo[status] || statusInfo.open;
  return (
    <span className={`status-badge ${status || 'open'}`}>
      <span className={`status-dot ${status || 'open'}`} />
      {info.label}
    </span>
  );
};

// Sortable Item component for section items
function SortableItem({ item, completedCount, taskCount, onOpenDetails, onViewTasks, convertMode }) {
  const { showToast } = useToast();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });

  const style = {
    transform: convertMode ? undefined : CSS.Translate.toString(transform),
    transition: convertMode ? undefined : transition,
    opacity: isDragging ? 0.5 : 1
  };

  const status = item.status || 'open';
  const priorityInfo = PRIORITIES.find(p => p.value === item.priority);
  const complexityInfo = COMPLEXITIES.find(c => c.value === item.complexity);

  const handleClick = () => {
    onOpenDetails(item.id);
  };

  const handleViewTasksClick = (e) => {
    e.stopPropagation();
    onViewTasks(item.id);
  };

  const handleCopyId = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.id).then(() => {
      showToast(`Copied: ${item.id}`);
    });
  }, [item.id, showToast]);

  return (
    <div ref={setNodeRef} style={style} className={`task-item compact ${status === 'done' ? 'completed' : ''}`} onClick={handleClick}>
      <div {...attributes} {...listeners}>
        <DragIcon />
      </div>
      <div className="task-content">
        <div className="task-title">{item.title}</div>
        {item.description && (
          <div className="task-description-preview">{item.description}</div>
        )}
        <div className="task-meta">
          <StatusBadge status={status} />
          {priorityInfo && (
            <span className={`priority-badge ${item.priority}`}>
              <span style={{ color: priorityInfo.color }}>{priorityInfo.icon}</span>
              {priorityInfo.label}
            </span>
          )}
          {complexityInfo && (
            <span className="complexity-badge" style={{ background: complexityInfo.color, color: 'white' }}>
              <span className="complexity-icon">{complexityInfo.icon}</span>
              {complexityInfo.label}
            </span>
          )}
          <span>{taskCount} tasks</span>
          <span>{completedCount} done</span>
        </div>
      </div>
      <button className="btn btn-icon btn-ghost btn-sm item-copy-btn" onClick={handleCopyId} title="Copy item ID">
        <CopyIcon />
      </button>
      <button className="btn btn-icon btn-ghost btn-sm item-edit-btn" onClick={handleViewTasksClick} title="View tasks">
        <ArrowRightIcon />
      </button>
    </div>
  );
}

// Section Items List - unified component for any section
function SectionItemsList({ sectionId }) {
  const { data } = useTaskData();
  const { setActiveItem, selectItem, searchQuery } = useUIState();
  const {
    createItem,
    moveItemToCategory,
    updateItemCategory,
    deleteItemCategory,
    convertToTask,
    reorderSectionItems,
    reorderItemsInCategory,
    reorderItemCategories
  } = useTaskActions();

  const [shiftHeld, setShiftHeld] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);
  const [activeDragType, setActiveDragType] = useState(null);

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Shift') setShiftHeld(true); };
    const handleKeyUp = (e) => { if (e.key === 'Shift') setShiftHeld(false); };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const section = data?.sections?.[sectionId];

  // Use shared sortable list hook
  const {
    sensors,
    categories,
    uncategorizedItems,
    allSortableIds,
    getCategoryItems,
    getNonCompletedCount
  } = useSortableList({
    data,
    parentId: sectionId,
    parent: section,
    categoriesKey: 'itemCategories',
    itemsKey: 'items',
    itemOrderKey: 'itemOrder',
    searchQuery,
    categoryIdPrefix: 'icat-'
  });

  // Handle adding item to specific category
  const handleAddItemToCategory = useCallback(async (categoryId) => {
    const item = await createItem(sectionId, 'New Item', categoryId);
    selectItem('item', item.id);
  }, [sectionId, createItem, selectItem]);

  const handleDragStart = useCallback((event) => {
    const activeId = String(event.active.id);
    setActiveDragId(activeId);
    setActiveDragType(activeId.startsWith('icat-') ? 'category' : 'item');
  }, []);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle category drag
    if (activeId.startsWith('icat-')) {
      if (!overId.startsWith('icat-')) return;

      const activeCatId = activeId.replace('icat-', '');
      const overCatId = overId.replace('icat-', '');

      if (activeCatId === overCatId) return;

      const oldIndex = categories.findIndex(c => c.id === activeCatId);
      const newIndex = categories.findIndex(c => c.id === overCatId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = categories.map(c => c.id);
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, activeCatId);
        reorderItemCategories(sectionId, newOrder);
      }
      return;
    }

    // Handle item drag
    const activeItem = data?.items?.[activeId];
    if (!activeItem) return;

    // If Shift is held and dropping on another item, convert to task
    if (shiftHeld && data?.items?.[overId]) {
      convertToTask('feature', activeId, overId);
      return;
    }

    // Check if dropped on a category zone
    const overData = over.data?.current;
    if (overData?.type === 'item-category') {
      const targetCategoryId = overData.categoryId;
      const currentCategoryId = activeItem.categoryId || null;

      if (targetCategoryId !== currentCategoryId) {
        moveItemToCategory(activeId, targetCategoryId);
        return;
      }
    }

    // Check if dropped on another item
    const overItem = data?.items?.[overId];
    if (overItem) {
      const targetCategoryId = overItem.categoryId || null;
      const currentCategoryId = activeItem.categoryId || null;

      // Prevent mixing completed and non-completed items when reordering
      const activeCompleted = activeItem.status === 'done';
      const overCompleted = overItem.status === 'done';
      if (activeCompleted !== overCompleted) {
        return;
      }

      // If items are in different categories, move to target category
      if (targetCategoryId !== currentCategoryId) {
        moveItemToCategory(activeId, targetCategoryId);
        return;
      }

      // Same category - reorder within that category
      if (targetCategoryId) {
        const category = data?.itemCategories?.[targetCategoryId];
        if (category) {
          const itemOrder = category.itemOrder || [];
          const oldIndex = itemOrder.indexOf(activeId);
          const newIndex = itemOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newOrder = [...itemOrder];
            newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, activeId);
            reorderItemsInCategory(targetCategoryId, newOrder);
          }
        }
      } else {
        // Both uncategorized - reorder in section's itemOrder
        const sectionItemOrder = section?.itemOrder || [];
        const uncatIds = sectionItemOrder.filter(id => {
          const item = data.items[id];
          return item && !item.categoryId;
        });
        const oldIndex = uncatIds.indexOf(activeId);
        const newIndex = uncatIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = [...uncatIds];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, activeId);
          const categorizedIds = sectionItemOrder.filter(id => {
            const item = data.items[id];
            return item && item.categoryId;
          });
          reorderSectionItems(sectionId, [...categorizedIds, ...newOrder]);
        }
      }
    }
  }, [data, section, sectionId, shiftHeld, convertToTask, moveItemToCategory, reorderItemsInCategory, reorderSectionItems, categories, reorderItemCategories]);

  // Render items for a category
  const renderItems = useCallback((items) => {
    return items.map(item => {
      const taskCount = item.taskOrder?.length || 0;
      const completedCount = (item.taskOrder || []).filter(tid =>
        data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done'
      ).length;
      return (
        <SortableItem
          key={item.id}
          item={item}
          taskCount={taskCount}
          completedCount={completedCount}
          onOpenDetails={() => selectItem('item', item.id)}
          onViewTasks={() => setActiveItem(item.id)}
          convertMode={shiftHeld}
        />
      );
    });
  }, [data.tasks, selectItem, setActiveItem, shiftHeld]);

  const hasContent = categories.length > 0 || uncategorizedItems.length > 0;

  if (!section) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Section not found</div>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No items yet</div>
        <div className="empty-state-text">
          Click "Add" in the header to create one
        </div>
      </div>
    );
  }

  return (
    <div className="task-list">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
          {/* Categories with their items */}
          {categories.map(category => {
            const items = getCategoryItems(category);
            return (
              <DraggableCategoryWrapper
                key={category.id}
                category={category}
                sortableId={`icat-${category.id}`}
                droppableId={`item-category-${category.id}`}
                droppableData={{ type: 'item-category', categoryId: category.id }}
                onUpdateCategory={updateItemCategory}
                onDeleteCategory={deleteItemCategory}
                onAddItem={handleAddItemToCategory}
                deleteConfirmMessage={`Delete category "${category.name}"? Items will be moved to uncategorized.`}
                emptyMessage="No items in this category"
                itemCount={getNonCompletedCount(items)}
              >
                {renderItems(items)}
              </DraggableCategoryWrapper>
            );
          })}

          {/* Uncategorized items */}
          {(uncategorizedItems.length > 0 || categories.length > 0) && (
            <DroppableUncategorizedZone
              droppableId="uncategorized-items"
              droppableData={{ type: 'item-category', categoryId: null }}
              showHeader={categories.length > 0}
              headerLabel="Uncategorized"
              itemCount={getNonCompletedCount(uncategorizedItems)}
              emptyMessage="Drop items here to uncategorize"
            >
              {renderItems(uncategorizedItems)}
            </DroppableUncategorizedZone>
          )}
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {activeDragId && activeDragType === 'item' && (
            <div style={{
              padding: '8px 12px',
              background: shiftHeld ? 'var(--accent)' : 'var(--bg-secondary)',
              color: shiftHeld ? 'white' : 'var(--text-secondary)',
              borderRadius: '6px',
              fontSize: '12px',
              boxShadow: 'var(--shadow-lg)',
              whiteSpace: 'nowrap',
              transform: 'translate(20px, 20px)',
              pointerEvents: 'none'
            }}>
              {shiftHeld ? '✓ Drop to convert to task' : 'Hold Shift to convert to task'}
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default memo(MainPanel);
