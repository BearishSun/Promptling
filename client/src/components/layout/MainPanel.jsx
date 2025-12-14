import { memo, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
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
import { useTaskData, useTaskActions, useUIState, SYSTEM_SECTIONS } from '../../context/TaskProvider';
import { useToast } from '../../context/ToastContext';
import TaskList from '../tasks/TaskList';
import { PRIORITIES, COMPLEXITIES } from '../../services/api';

const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

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

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const BugIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

const FeatureIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
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
    // Determine parent type based on item's section
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

  const handleDelete = useCallback(async () => {
    if (!activeItemId || activeView !== 'item') return;
    if (!confirm('Delete this item?')) return;
    await deleteItem(activeItemId);
    setActiveSection(activeSectionId);
  }, [activeView, activeItemId, activeSectionId, deleteItem, setActiveSection]);

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

  // V4 handlers for section views
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
  const canAddGlobal = activeView === 'section';

  return (
    <main className="main-panel">
      <div className="main-header">
        <div className="main-header-content">
        {/* Back button for item view, or spacer for alignment */}
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

        {/* Title */}
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

        {/* Search - centered */}
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

        {/* Add dropdown for section view (v4) */}
        {activeView === 'section' && (
          <div className="dropdown">
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              <PlusIcon />
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



        {/* Add button for item detail view (tasks) */}
        {canAdd && (
          <div className="dropdown">
            <button
              className="btn btn-primary"
              onClick={() => setShowAddMenu(!showAddMenu)}
            >
              <PlusIcon />
              Add
            </button>
            {showAddMenu && (
              <div className="dropdown-menu">
                <div className="dropdown-item" onClick={handleAddTask}>
                  <PlusIcon />
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

      {/* Click outside handler for dropdown */}
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

// Arrow right icon for viewing tasks
const ArrowRightIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M5 12h14M12 5l7 7-7 7" />
  </svg>
);




// ============ V4 UNIFIED SECTION ITEMS LIST ============

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

  // Filter items by search query
  const filterItems = useCallback((items) => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(item =>
      item.title.toLowerCase().includes(query) ||
      (item.description || '').toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Get categories for this section
  const categories = useMemo(() => {
    if (!section || !data?.itemCategories) return [];
    return (section.categoryOrder || [])
      .map(id => data.itemCategories[id])
      .filter(Boolean);
  }, [section, data?.itemCategories]);

  // Get uncategorized items
  const uncategorizedItemsRaw = useMemo(() => {
    if (!section || !data?.items) return [];
    return (section.itemOrder || [])
      .map(id => data.items[id])
      .filter(item => item && !item.categoryId);
  }, [section, data?.items]);

  // Sort items with completed ones at the bottom
  const sortCompletedToBottom = useCallback((items) => {
    const nonCompleted = items.filter(item => item.status !== 'done');
    const completed = items.filter(item => item.status === 'done');
    return [...nonCompleted, ...completed];
  }, []);

  const uncategorizedItems = useMemo(() => {
    return sortCompletedToBottom(filterItems(uncategorizedItemsRaw));
  }, [uncategorizedItemsRaw, filterItems, sortCompletedToBottom]);

  const getCategoryItems = useCallback((category) => {
    if (!data?.items) return [];
    const items = (category.itemOrder || [])
      .map(id => data.items[id])
      .filter(Boolean);
    return sortCompletedToBottom(filterItems(items));
  }, [data?.items, filterItems, sortCompletedToBottom]);

  // Handle adding item to specific category
  const handleAddItemToCategory = useCallback(async (categoryId) => {
    const item = await createItem(sectionId, 'New Item', categoryId);
    selectItem('item', item.id);
  }, [sectionId, createItem, selectItem]);

  // All sortable IDs
  const allSortableIds = useMemo(() => {
    const ids = [];
    categories.forEach(cat => ids.push(`icat-${cat.id}`));
    categories.forEach(cat => {
      const catItems = getCategoryItems(cat);
      catItems.forEach(item => ids.push(item.id));
    });
    uncategorizedItems.forEach(item => ids.push(item.id));
    return ids;
  }, [categories, getCategoryItems, uncategorizedItems]);

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
      // Only allow dropping on other categories
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
        // Don't allow reordering between completed and non-completed
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
          // Rebuild full itemOrder: categorized items stay in place, uncategorized get new order
          const categorizedIds = sectionItemOrder.filter(id => {
            const item = data.items[id];
            return item && item.categoryId;
          });
          reorderSectionItems(sectionId, [...categorizedIds, ...newOrder]);
        }
      }
    }
  }, [data, section, sectionId, shiftHeld, convertToTask, moveItemToCategory, reorderItemsInCategory, reorderSectionItems, categories, reorderItemCategories]);

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
          {categories.map(category => (
            <DraggableItemCategory
              key={category.id}
              category={category}
              items={getCategoryItems(category)}
              data={data}
              onSelect={setActiveItem}
              onEdit={selectItem}
              onUpdateCategory={updateItemCategory}
              onDeleteCategory={deleteItemCategory}
              onAddItem={handleAddItemToCategory}
              convertMode={shiftHeld}
            />
          ))}

          {/* Uncategorized items */}
          {(uncategorizedItems.length > 0 || categories.length > 0) && (
            <div className="category-section">
              {categories.length > 0 && (
                <div className="category-header">
                  <span className="category-name">Uncategorized</span>
                  <span className="category-count">{uncategorizedItems.filter(i => i.status !== 'done').length}</span>
                </div>
              )}
              <DroppableUncategorizedItems
                items={uncategorizedItems}
                data={data}
                onOpenDetails={selectItem}
                onViewTasks={setActiveItem}
                convertMode={shiftHeld}
              />
            </div>
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

// Droppable category for items
function DroppableItemCategory({ category, items, data, onSelect, onEdit, onUpdateCategory, onDeleteCategory, onAddItem, convertMode, dragHandleProps }) {
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
    id: `item-category-${category.id}`,
    data: { type: 'item-category', categoryId: category.id }
  });

  const toggleExpanded = useCallback(() => {
    onUpdateCategory(category.id, { expanded: !expanded });
  }, [category.id, expanded, onUpdateCategory]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    if (confirm(`Delete category "${category.name}"? Items will be moved to uncategorized.`)) {
      onDeleteCategory(category.id);
    }
  }, [category.id, category.name, onDeleteCategory]);

  const handleNameSubmit = useCallback(() => {
    if (editName.trim() && editName !== category.name) {
      onUpdateCategory(category.id, { name: editName.trim() });
    }
    setIsEditing(false);
  }, [editName, category.id, category.name, onUpdateCategory]);

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
        <span className="category-count">{items.filter(i => i.status !== 'done').length}</span>
        {onAddItem && (
          <button
            className="btn btn-ghost btn-sm category-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddItem(category.id);
            }}
            title="Add item to category"
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
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            {items.map(item => {
              const taskCount = item.taskOrder?.length || 0;
              const completedCount = (item.taskOrder || []).filter(tid => data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done').length;
              return (
                <SortableItem
                  key={item.id}
                  item={item}
                  taskCount={taskCount}
                  completedCount={completedCount}
                  onOpenDetails={() => onEdit('item', item.id)}
                  onViewTasks={() => onSelect(item.id)}
                  convertMode={convertMode}
                />
              );
            })}
            {items.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No items in this category
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </>
  );
}

// Draggable wrapper for item category
function DraggableItemCategory({ category, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `icat-${category.id}` }); // Prefix with icat- to distinguish from items

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="category-section">
      <DroppableItemCategory
        category={category}
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Droppable uncategorized zone for items
function DroppableUncategorizedItems({ items, data, onOpenDetails, onViewTasks, convertMode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'uncategorized-items',
    data: { type: 'item-category', categoryId: null }
  });

  return (
    <div
      ref={setNodeRef}
      className="category-tasks"
      style={{
        background: isOver ? 'var(--bg-hover)' : undefined,
        borderRadius: isOver ? '6px' : undefined,
        transition: 'background 0.15s ease'
      }}
    >
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        {items.map(item => {
          const taskCount = item.taskOrder?.length || 0;
          const completedCount = (item.taskOrder || []).filter(tid => data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done').length;
          return (
            <SortableItem
              key={item.id}
              item={item}
              taskCount={taskCount}
              completedCount={completedCount}
              onOpenDetails={() => onOpenDetails('item', item.id)}
              onViewTasks={() => onViewTasks(item.id)}
              convertMode={convertMode}
            />
          );
        })}
        {items.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Drop items here to uncategorize
          </div>
        )}
      </SortableContext>
    </div>
  );
}

export default memo(MainPanel);
