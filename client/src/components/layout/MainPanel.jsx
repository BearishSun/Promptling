import { memo, useState, useCallback, useEffect } from 'react';
import { useTaskData, useTaskActions, useUIState, SYSTEM_SECTIONS } from '../../context/TaskProvider';
import { useToast } from '../../context/ToastContext';
import { useSortableList } from '../../hooks/useSortableList';
import { useDragHandlers } from '../../hooks/useDragHandlers';
import { CategorizedList, SortableItemWrapper } from '../shared/CategoryList';
import { DragIcon, PlusIcon, CopyIdIcon, OpenBoxIcon } from '../shared/icons';
import TaskList from '../tasks/TaskList';
import ActionButtons from '../terminal/ActionButtons';
import { COMPLEXITIES } from '../../services/api';

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


function MainPanel() {
  const { data } = useTaskData();
  const { createTask, createCategory, createItem, updateItem, createItemCategory } = useTaskActions();
  const { activeView, activeSectionId, activeItemId, searchQuery, setSearchQuery, setActiveSection, selectItem, selectTask } = useUIState();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  const currentSection = data?.sections?.[activeSectionId];
  const currentItem = activeView === 'item' ? data?.items?.[activeItemId] : null;

  const getTitle = () => {
    switch (activeView) {
      case 'section': return currentSection?.name || 'Section';
      case 'item': return currentItem?.title || 'Item';
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
          <button className="btn btn-ghost" onClick={() => setActiveSection(activeSectionId)} title="Back to section">
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
            <button className="btn btn-primary" onClick={() => setShowAddMenu(!showAddMenu)}>
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
            <button className="btn btn-primary" onClick={() => setShowAddMenu(!showAddMenu)}>
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
            <div className="empty-state-text">Choose a section from the sidebar</div>
          </div>
        )}
      </div>

      {showAddMenu && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowAddMenu(false)} />
      )}
    </main>
  );
}

// Status badge component
const StatusBadge = ({ status }) => {
  const statusInfo = {
    'open': { label: 'Open' },
    'in-progress': { label: 'In Progress' },
    'done': { label: 'Done' }
  };
  const info = statusInfo[status] || statusInfo.open;
  return (
    <span className={`status-badge ${status || 'open'}`}>
      <span className={`status-dot ${status || 'open'}`} />
      {info.label}
    </span>
  );
};

// Item display component (used inside SortableItemWrapper)
function ItemContent({ item, data, onOpenDetails, onViewTasks, dragHandleProps }) {
  const { showToast } = useToast();
  const status = item.status || 'open';
  const complexityInfo = COMPLEXITIES.find(c => c.value === item.complexity);
  const taskCount = item.taskOrder?.length || 0;
  const completedCount = (item.taskOrder || []).filter(tid =>
    data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done'
  ).length;

  const handleCopyId = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(item.id).then(() => {
      showToast(`Copied: ${item.id}`);
    });
  }, [item.id, showToast]);

  return (
    <div className={`task-item compact ${status === 'done' ? 'completed' : ''}`} onClick={() => onOpenDetails(item.id)}>
      <div {...dragHandleProps}>
        <DragIcon />
      </div>
      <div className="task-content">
        <div className="task-title">{item.title}</div>
        {item.description && <div className="task-description-preview">{item.description}</div>}
        <div className="task-meta">
          <StatusBadge status={status} />
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
      <button className="item-action-icon-btn" onClick={handleCopyId} title="Copy item ID">
        <CopyIdIcon />
      </button>
      <button className="item-action-icon-btn" onClick={(e) => { e.stopPropagation(); onViewTasks(item.id); }} title="Show tasks">
        <OpenBoxIcon />
      </button>
      <ActionButtons itemId={item.id} itemTitle={item.title} />
    </div>
  );
}

// Section Items List component
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

  // Callbacks for drag handlers
  const handleReorderCategories = useCallback((newOrder) => {
    reorderItemCategories(sectionId, newOrder);
  }, [reorderItemCategories, sectionId]);

  const handleReorderInCategory = useCallback((categoryId, newOrder) => {
    reorderItemsInCategory(categoryId, newOrder);
  }, [reorderItemsInCategory]);

  const handleReorderUncategorized = useCallback((newOrder) => {
    reorderSectionItems(sectionId, newOrder);
  }, [reorderSectionItems, sectionId]);

  // Move item to category (position not preserved - item goes to end)
  const handleMoveToCategory = useCallback((itemId, categoryId) => {
    moveItemToCategory(itemId, categoryId);
  }, [moveItemToCategory]);

  // Special drop handler for shift+drag to convert to task
  const handleSpecialDrop = useCallback((activeId, overId, activeItem, overItem) => {
    if (shiftHeld && overItem) {
      convertToTask('feature', activeId, overId);
      return true;
    }
    return false;
  }, [shiftHeld, convertToTask]);

  const { handleDragEnd } = useDragHandlers({
    data,
    parent: section,
    parentId: sectionId,
    categories,
    categoryIdPrefix: 'icat-',
    droppableType: 'item-category',
    itemsKey: 'items',
    categoriesKey: 'itemCategories',
    itemOrderKey: 'itemOrder',
    onReorderCategories: handleReorderCategories,
    onMoveToCategory: handleMoveToCategory,
    onReorderInCategory: handleReorderInCategory,
    onReorderUncategorized: handleReorderUncategorized,
    onSpecialDrop: handleSpecialDrop
  });

  const handleDragStart = useCallback((event) => {
    const activeId = String(event.active.id);
    setActiveDragId(activeId);
    setActiveDragType(activeId.startsWith('icat-') ? 'category' : 'item');
  }, []);

  const wrappedDragEnd = useCallback((event) => {
    setActiveDragId(null);
    setActiveDragType(null);
    handleDragEnd(event);
  }, [handleDragEnd]);

  const handleAddItemToCategory = useCallback(async (categoryId) => {
    const item = await createItem(sectionId, 'New Item', categoryId);
    selectItem('item', item.id);
  }, [sectionId, createItem, selectItem]);

  const renderItem = useCallback((item) => (
    <SortableItemWrapper
      key={item.id}
      id={item.id}
      categoryId={item.categoryId}
      items={data?.items}
      disabled={shiftHeld}
    >
      {({ dragHandleProps }) => (
        <ItemContent
          item={item}
          data={data}
          onOpenDetails={() => selectItem('item', item.id)}
          onViewTasks={() => setActiveItem(item.id)}
          dragHandleProps={dragHandleProps}
        />
      )}
    </SortableItemWrapper>
  ), [data, selectItem, setActiveItem, shiftHeld]);

  if (!section) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Section not found</div>
      </div>
    );
  }

  return (
    <CategorizedList
      sensors={sensors}
      allSortableIds={allSortableIds}
      categories={categories}
      uncategorizedItems={uncategorizedItems}
      getCategoryItems={getCategoryItems}
      getNonCompletedCount={getNonCompletedCount}
      renderItem={renderItem}
      onDragStart={handleDragStart}
      onDragEnd={wrappedDragEnd}
      categoryIdPrefix="icat-"
      droppableType="item-category"
      droppableIdPrefix="item-category-"
      uncategorizedDroppableId="uncategorized-items"
      onUpdateCategory={updateItemCategory}
      onDeleteCategory={deleteItemCategory}
      onAddToCategory={handleAddItemToCategory}
      itemLabel="item"
      dragOverlay={
        activeDragId && activeDragType === 'item' ? (
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
        ) : null
      }
      emptyState={
        <div className="empty-state">
          <div className="empty-state-title">No items yet</div>
          <div className="empty-state-text">Click "Add" in the header to create one</div>
        </div>
      }
    />
  );
}

export default memo(MainPanel);
