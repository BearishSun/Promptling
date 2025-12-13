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
import { useTaskData, useTaskActions, useUIState } from '../../context/TaskProvider';
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
  const { createTask, createCategory, deleteFeature, deleteBug, updateFeature, updateBug, createFeature, createBug, createFeatureCategory, createBugCategory } = useTaskActions();
  const { activeView, activeItemId, searchQuery, setSearchQuery, setActiveView, selectItem, selectTask } = useUIState();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');

  // Get current parent item
  const currentItem = activeView === 'feature'
    ? data?.features?.[activeItemId]
    : activeView === 'bug'
      ? data?.bugs?.[activeItemId]
      : null;

  // Get title based on view
  const getTitle = () => {
    switch (activeView) {
      case 'features': return 'Features';
      case 'bugs': return 'Bugs';
      case 'feature': return currentItem?.title || 'Feature';
      case 'bug': return currentItem?.title || 'Bug';
      default: return 'Tasks';
    }
  };

  const handleAddTask = useCallback(async () => {
    if (!activeItemId) return;
    const task = await createTask(
      activeView === 'feature' ? 'feature' : 'bug',
      activeItemId,
      null,
      'New Task'
    );
    setShowAddMenu(false);
    selectTask(task.id);
  }, [activeView, activeItemId, createTask, selectTask]);

  const handleAddCategory = useCallback(async () => {
    if (!activeItemId) return;
    await createCategory(
      activeView === 'feature' ? 'feature' : 'bug',
      activeItemId,
      'New Category'
    );
    setShowAddMenu(false);
  }, [activeView, activeItemId, createCategory]);

  const handleDelete = useCallback(async () => {
    if (!activeItemId) return;
    if (!confirm(`Delete this ${activeView}?`)) return;

    if (activeView === 'feature') {
      await deleteFeature(activeItemId);
    } else if (activeView === 'bug') {
      await deleteBug(activeItemId);
    }
  }, [activeView, activeItemId, deleteFeature, deleteBug]);

  const handleTitleEdit = useCallback(() => {
    if (currentItem) {
      setEditTitle(currentItem.title);
      setIsEditingTitle(true);
    }
  }, [currentItem]);

  const handleTitleSubmit = useCallback(() => {
    if (editTitle.trim() && editTitle !== currentItem?.title) {
      if (activeView === 'feature') {
        updateFeature(activeItemId, { title: editTitle.trim() });
      } else if (activeView === 'bug') {
        updateBug(activeItemId, { title: editTitle.trim() });
      }
    }
    setIsEditingTitle(false);
  }, [editTitle, currentItem, activeView, activeItemId, updateFeature, updateBug]);

  // Global add handlers for Features/Bugs views
  const handleAddFeature = useCallback(async () => {
    const feature = await createFeature('New Feature');
    setShowAddMenu(false);
    selectItem('feature', feature.id);
  }, [createFeature, selectItem]);

  const handleAddBug = useCallback(async () => {
    const bug = await createBug('New Bug');
    setShowAddMenu(false);
    selectItem('bug', bug.id);
  }, [createBug, selectItem]);

  const handleAddFeatureCategory = useCallback(async () => {
    await createFeatureCategory('New Category');
    setShowAddMenu(false);
  }, [createFeatureCategory]);

  const handleAddBugCategory = useCallback(async () => {
    await createBugCategory('New Category');
    setShowAddMenu(false);
  }, [createBugCategory]);

  const canAdd = activeView === 'feature' || activeView === 'bug';
  const canAddGlobal = activeView === 'features' || activeView === 'bugs';

  return (
    <main className="main-panel">
      <div className="main-header">
        <div className="main-header-content">
        {/* Back button for task view, or spacer for alignment */}
        {(activeView === 'feature' || activeView === 'bug') ? (
          <button
            className="btn btn-ghost"
            onClick={() => setActiveView(activeView === 'feature' ? 'features' : 'bugs')}
            title={`Back to ${activeView === 'feature' ? 'Features' : 'Bugs'}`}
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

        {/* Add dropdown for Features view */}
        {activeView === 'features' && (
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
                <div className="dropdown-item" onClick={handleAddFeature}>
                  <FeatureIcon />
                  Add Feature
                </div>
                <div className="dropdown-item" onClick={handleAddFeatureCategory}>
                  <FolderIcon />
                  Add Category
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add dropdown for Bugs view */}
        {activeView === 'bugs' && (
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
                <div className="dropdown-item" onClick={handleAddBug}>
                  <BugIcon />
                  Add Bug
                </div>
                <div className="dropdown-item" onClick={handleAddBugCategory}>
                  <FolderIcon />
                  Add Category
                </div>
              </div>
            )}
          </div>
        )}

        {/* Add button for feature/bug detail view (tasks) */}
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
        {(activeView === 'feature' || activeView === 'bug') && activeItemId ? (
          <TaskList
            parentType={activeView}
            parentId={activeItemId}
          />
        ) : activeView === 'features' ? (
          <GlobalFeaturesList />
        ) : activeView === 'bugs' ? (
          <GlobalBugsList />
        ) : (
          <div className="empty-state">
            <div className="empty-state-title">Select a view</div>
            <div className="empty-state-text">
              Choose a feature or bug from the sidebar
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

// Sortable Feature Item
function SortableFeatureItem({ feature, completedCount, taskCount, onOpenDetails, onViewTasks, convertMode }) {
  const { showToast } = useToast();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: feature.id });

  const style = {
    // Don't move items when in convert mode (Shift held)
    transform: convertMode ? undefined : CSS.Translate.toString(transform),
    transition: convertMode ? undefined : transition,
    opacity: isDragging ? 0.5 : 1
  };

  const status = feature.status || 'open';

  const handleClick = (e) => {
    // Click opens detail panel
    onOpenDetails(feature.id);
  };

  const handleViewTasksClick = (e) => {
    // Button navigates to feature's tasks
    e.stopPropagation();
    onViewTasks(feature.id);
  };

  const handleCopyId = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(feature.id).then(() => {
      showToast(`Copied: ${feature.id}`);
    });
  }, [feature.id, showToast]);

  const priorityInfo = PRIORITIES.find(p => p.value === feature.priority);
  const complexityInfo = COMPLEXITIES.find(c => c.value === feature.complexity);

  return (
    <div ref={setNodeRef} style={style} className={`task-item compact ${status === 'done' ? 'completed' : ''}`} onClick={handleClick}>
      <div {...attributes} {...listeners}>
        <DragIcon />
      </div>
      <div className="task-content">
        <div className="task-title">{feature.title}</div>
        {feature.description && (
          <div className="task-description-preview">{feature.description}</div>
        )}
        <div className="task-meta">
          <StatusBadge status={status} />
          {priorityInfo && (
            <span className={`priority-badge ${feature.priority}`}>
              <span style={{ color: priorityInfo.color }}>{priorityInfo.icon}</span>
              {priorityInfo.label}
            </span>
          )}
          {complexityInfo && (
            <span className="complexity-badge" style={{ background: complexityInfo.color, color: 'white' }}>
              {complexityInfo.label}
            </span>
          )}
          <span>{taskCount} tasks</span>
          <span>{completedCount} done</span>
        </div>
      </div>
      <button className="btn btn-icon btn-ghost btn-sm item-copy-btn" onClick={handleCopyId} title="Copy feature ID">
        <CopyIcon />
      </button>
      <button className="btn btn-icon btn-ghost btn-sm item-edit-btn" onClick={handleViewTasksClick} title="View tasks">
        <ArrowRightIcon />
      </button>
    </div>
  );
}

// Droppable Category Zone for features
function DroppableFeatureCategory({ category, features, data, onSelect, onEdit, onUpdateCategory, onDeleteCategory, onAddFeature, convertMode, dragHandleProps }) {
  const expanded = category.expanded !== false; // Default to true
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const isEditingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Sync editName when category.name changes from outside (e.g., data reload)
  useEffect(() => {
    if (!isEditingRef.current) {
      setEditName(category.name);
    }
  }, [category.name]);

  // Make this category a drop target
  const { setNodeRef, isOver } = useDroppable({
    id: `category-${category.id}`,
    data: { type: 'category', categoryId: category.id }
  });

  const toggleExpanded = useCallback(() => {
    onUpdateCategory(category.id, { expanded: !expanded });
  }, [category.id, expanded, onUpdateCategory]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    if (confirm(`Delete category "${category.name}"? Features will be moved to uncategorized.`)) {
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
        <span className="category-count">{features.length}</span>
        {onAddFeature && (
          <button
            className="btn btn-ghost btn-sm category-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddFeature(category.id);
            }}
            title="Add feature to category"
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
          <SortableContext items={features.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {features.map(feature => {
              const taskCount = feature.taskOrder?.length || 0;
              const completedCount = (feature.taskOrder || []).filter(tid => data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done').length;
              return (
                <SortableFeatureItem
                  key={feature.id}
                  feature={feature}
                  taskCount={taskCount}
                  completedCount={completedCount}
                  onOpenDetails={() => onEdit('feature', feature.id)}
                  onViewTasks={() => onSelect('feature', feature.id)}
                  convertMode={convertMode}
                />
              );
            })}
            {features.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No features in this category
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </>
  );
}

// Draggable wrapper for feature category
function DraggableFeatureCategory({ category, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `fcat-${category.id}` }); // Prefix with fcat- to distinguish from features

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="category-section">
      <DroppableFeatureCategory
        category={category}
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Droppable Uncategorized Zone for features
function DroppableUncategorizedFeatures({ features, data, onOpenDetails, onViewTasks, convertMode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'uncategorized-features',
    data: { type: 'category', categoryId: null }
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
      <SortableContext items={features.map(f => f.id)} strategy={verticalListSortingStrategy}>
        {features.map(feature => {
          const taskCount = feature.taskOrder?.length || 0;
          const completedCount = (feature.taskOrder || []).filter(tid => data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done').length;
          return (
            <SortableFeatureItem
              key={feature.id}
              feature={feature}
              taskCount={taskCount}
              completedCount={completedCount}
              onOpenDetails={() => onOpenDetails('feature', feature.id)}
              onViewTasks={() => onViewTasks('feature', feature.id)}
              convertMode={convertMode}
            />
          );
        })}
        {features.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Drop features here to uncategorize
          </div>
        )}
      </SortableContext>
    </div>
  );
}

// Global Features List component
function GlobalFeaturesList() {
  const { data } = useTaskData();
  const { setActiveView, selectItem, searchQuery } = useUIState();
  const {
    createFeature,
    moveFeatureToCategory,
    updateFeatureCategory,
    deleteFeatureCategory,
    reorderFeatures,
    reorderFeatureCategories,
    reorderFeaturesInCategory,
    convertToTask
  } = useTaskActions();

  // Track Shift key for convert-to-task mode
  const [shiftHeld, setShiftHeld] = useState(false);
  const [activeDragId, setActiveDragId] = useState(null);
  const [activeDragType, setActiveDragType] = useState(null); // 'feature' or 'category'

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

  // Add feature to a specific category
  const handleAddFeatureToCategory = useCallback(async (categoryId) => {
    const feature = await createFeature('New Feature');
    await moveFeatureToCategory(feature.id, categoryId);
    selectItem('feature', feature.id);
  }, [createFeature, moveFeatureToCategory, selectItem]);

  // Filter features by search query
  const filterFeatures = useCallback((features) => {
    if (!searchQuery) return features;
    const query = searchQuery.toLowerCase();
    return features.filter(f =>
      f.title.toLowerCase().includes(query) ||
      (f.description || '').toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Get categories and uncategorized features
  const categories = useMemo(() => {
    if (!data?.featureCategories || !data?.featureCategoryOrder) return [];
    return (data.featureCategoryOrder || [])
      .map(id => data.featureCategories[id])
      .filter(Boolean);
  }, [data?.featureCategories, data?.featureCategoryOrder]);

  const uncategorizedFeaturesRaw = useMemo(() => {
    if (!data?.features || !data?.globalFeatureOrder) return [];
    return (data.globalFeatureOrder || [])
      .map(id => data.features[id])
      .filter(f => f && !f.categoryId);
  }, [data?.features, data?.globalFeatureOrder]);

  const uncategorizedFeatures = useMemo(() => {
    return filterFeatures(uncategorizedFeaturesRaw);
  }, [uncategorizedFeaturesRaw, filterFeatures]);

  const getCategoryFeatures = useCallback((category) => {
    if (!data?.features) return [];
    const features = (category.featureOrder || [])
      .map(id => data.features[id])
      .filter(Boolean);
    return filterFeatures(features);
  }, [data?.features, filterFeatures]);

  // All sortable IDs (categories with prefix + features)
  const allSortableIds = useMemo(() => {
    const ids = [];
    // Add category IDs with prefix
    categories.forEach(cat => ids.push(`fcat-${cat.id}`));
    // Add all feature IDs
    categories.forEach(cat => {
      const catFeatures = getCategoryFeatures(cat);
      catFeatures.forEach(f => ids.push(f.id));
    });
    uncategorizedFeatures.forEach(f => ids.push(f.id));
    return ids;
  }, [categories, getCategoryFeatures, uncategorizedFeatures]);

  // Handle drag start
  const handleDragStart = useCallback((event) => {
    const activeId = String(event.active.id);
    setActiveDragId(activeId);
    setActiveDragType(activeId.startsWith('fcat-') ? 'category' : 'feature');
  }, []);

  // Unified drag end handler for both categories and features
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle category drag
    if (activeId.startsWith('fcat-')) {
      // Only allow dropping on other categories
      if (!overId.startsWith('fcat-')) return;

      const activeCatId = activeId.replace('fcat-', '');
      const overCatId = overId.replace('fcat-', '');

      if (activeCatId === overCatId) return;

      const oldIndex = categories.findIndex(c => c.id === activeCatId);
      const newIndex = categories.findIndex(c => c.id === overCatId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = categories.map(c => c.id);
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, activeCatId);
        reorderFeatureCategories(newOrder);
      }
      return;
    }

    // Handle feature drag
    const activeFeature = data?.features?.[activeId];
    if (!activeFeature) return;

    // If Shift is held and dropping on another feature, convert to task
    if (shiftHeld && data?.features?.[overId]) {
      convertToTask('feature', activeId, overId);
      return;
    }

    // Check if dropped on a category zone (droppable)
    const overData = over.data?.current;
    if (overData?.type === 'category') {
      const targetCategoryId = overData.categoryId;
      const currentCategoryId = activeFeature.categoryId || null;

      if (targetCategoryId !== currentCategoryId) {
        moveFeatureToCategory(activeId, targetCategoryId);
        return;
      }
    }

    // Check if dropped on another feature
    const overFeature = data?.features?.[overId];
    if (overFeature) {
      const targetCategoryId = overFeature.categoryId || null;
      const currentCategoryId = activeFeature.categoryId || null;

      // If features are in different categories, move to target category
      if (targetCategoryId !== currentCategoryId) {
        moveFeatureToCategory(activeId, targetCategoryId);
        return;
      }

      // Same category - reorder within that category
      if (targetCategoryId) {
        const category = data?.featureCategories?.[targetCategoryId];
        if (category) {
          const featureOrder = category.featureOrder || [];
          const oldIndex = featureOrder.indexOf(activeId);
          const newIndex = featureOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newOrder = [...featureOrder];
            newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, activeId);
            reorderFeaturesInCategory(targetCategoryId, newOrder);
          }
        }
      } else {
        // Both uncategorized - reorder in global order
        const uncatIds = data.globalFeatureOrder.filter(id => {
          const f = data.features[id];
          return f && !f.categoryId;
        });
        const oldIndex = uncatIds.indexOf(activeId);
        const newIndex = uncatIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = [...uncatIds];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, activeId);
          const categorizedIds = data.globalFeatureOrder.filter(id => {
            const f = data.features[id];
            return f && f.categoryId;
          });
          reorderFeatures([...categorizedIds, ...newOrder]);
        }
      }
    }
  }, [data, shiftHeld, convertToTask, moveFeatureToCategory, reorderFeaturesInCategory, reorderFeatures, categories, reorderFeatureCategories]);

  const hasContent = categories.length > 0 || uncategorizedFeatures.length > 0 || (data?.globalFeatureOrder?.length > 0);

  if (!hasContent) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No features yet</div>
        <div className="empty-state-text">
          Click "Add Feature" in the header to create one
        </div>
      </div>
    );
  }

  return (
    <div className="task-list">
      {/* Single DndContext for everything */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
          {/* Categories with their features */}
          {categories.map(category => (
            <DraggableFeatureCategory
              key={category.id}
              category={category}
              features={getCategoryFeatures(category)}
              data={data}
              onSelect={setActiveView}
              onEdit={selectItem}
              onUpdateCategory={updateFeatureCategory}
              onDeleteCategory={deleteFeatureCategory}
              onAddFeature={handleAddFeatureToCategory}
              convertMode={shiftHeld}
            />
          ))}

          {/* Uncategorized features */}
          {(uncategorizedFeatures.length > 0 || categories.length > 0) && (
            <div className="category-section">
              {categories.length > 0 && (
                <div className="category-header">
                  <span className="category-name">Uncategorized</span>
                  <span className="category-count">{uncategorizedFeatures.length}</span>
                </div>
              )}
              <DroppableUncategorizedFeatures
                features={uncategorizedFeatures}
                data={data}
                onOpenDetails={selectItem}
                onViewTasks={setActiveView}
                convertMode={shiftHeld}
              />
            </div>
          )}
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeDragId && activeDragType === 'feature' && (
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

// Sortable Bug Item
function SortableBugItem({ bug, completedCount, taskCount, onOpenDetails, onViewTasks }) {
  const { showToast } = useToast();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: bug.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  const status = bug.status || 'open';
  const priorityInfo = PRIORITIES.find(p => p.value === bug.priority);
  const complexityInfo = COMPLEXITIES.find(c => c.value === bug.complexity);

  const handleClick = (e) => {
    // Click opens detail panel
    onOpenDetails(bug.id);
  };

  const handleViewTasksClick = (e) => {
    // Button navigates to bug's tasks
    e.stopPropagation();
    onViewTasks(bug.id);
  };

  const handleCopyId = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(bug.id).then(() => {
      showToast(`Copied: ${bug.id}`);
    });
  }, [bug.id, showToast]);

  return (
    <div ref={setNodeRef} style={style} className={`task-item compact ${status === 'done' ? 'completed' : ''}`} onClick={handleClick}>
      <div {...attributes} {...listeners}>
        <DragIcon />
      </div>
      <div className="task-content">
        <div className="task-title">{bug.title}</div>
        {bug.description && (
          <div className="task-description-preview">{bug.description}</div>
        )}
        <div className="task-meta">
          <StatusBadge status={status} />
          {priorityInfo && (
            <span className={`priority-badge ${bug.priority}`}>
              <span style={{ color: priorityInfo.color }}>{priorityInfo.icon}</span>
              {priorityInfo.label}
            </span>
          )}
          {complexityInfo && (
            <span className="complexity-badge" style={{ background: complexityInfo.color, color: 'white' }}>
              {complexityInfo.label}
            </span>
          )}
          <span>{taskCount} tasks</span>
          <span>{completedCount} done</span>
        </div>
      </div>
      <button className="btn btn-icon btn-ghost btn-sm item-copy-btn" onClick={handleCopyId} title="Copy bug ID">
        <CopyIcon />
      </button>
      <button className="btn btn-icon btn-ghost btn-sm item-edit-btn" onClick={handleViewTasksClick} title="View tasks">
        <ArrowRightIcon />
      </button>
    </div>
  );
}

// Droppable Category Zone for bugs
function DroppableBugCategory({ category, bugs, data, onSelect, onEdit, onUpdateCategory, onDeleteCategory, onAddBug, dragHandleProps }) {
  const expanded = category.expanded !== false; // Default to true
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const isEditingRef = useRef(false);

  // Keep ref in sync with state
  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  // Sync editName when category.name changes from outside (e.g., data reload)
  useEffect(() => {
    if (!isEditingRef.current) {
      setEditName(category.name);
    }
  }, [category.name]);

  // Make this category a drop target
  const { setNodeRef, isOver } = useDroppable({
    id: `bug-category-${category.id}`,
    data: { type: 'bug-category', categoryId: category.id }
  });

  const toggleExpanded = useCallback(() => {
    onUpdateCategory(category.id, { expanded: !expanded });
  }, [category.id, expanded, onUpdateCategory]);

  const handleDelete = useCallback((e) => {
    e.stopPropagation();
    if (confirm(`Delete category "${category.name}"? Bugs will be moved to uncategorized.`)) {
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
        <span className="category-count">{bugs.length}</span>
        {onAddBug && (
          <button
            className="btn btn-ghost btn-sm category-add"
            onClick={(e) => {
              e.stopPropagation();
              onAddBug(category.id);
            }}
            title="Add bug to category"
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
          <SortableContext items={bugs.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {bugs.map(bug => {
              const taskCount = bug.taskOrder?.length || 0;
              const completedCount = (bug.taskOrder || []).filter(tid => data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done').length;
              return (
                <SortableBugItem
                  key={bug.id}
                  bug={bug}
                  taskCount={taskCount}
                  completedCount={completedCount}
                  onOpenDetails={() => onEdit('bug', bug.id)}
                  onViewTasks={() => onSelect('bug', bug.id)}
                />
              );
            })}
            {bugs.length === 0 && (
              <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No bugs in this category
              </div>
            )}
          </SortableContext>
        </div>
      )}
    </>
  );
}

// Draggable wrapper for bug category
function DraggableBugCategory({ category, ...props }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `bcat-${category.id}` }); // Prefix with bcat- to distinguish from bugs

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div ref={setNodeRef} style={style} className="category-section">
      <DroppableBugCategory
        category={category}
        {...props}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

// Droppable Uncategorized Zone for bugs
function DroppableUncategorizedBugs({ bugs, data, onOpenDetails, onViewTasks }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'uncategorized-bugs',
    data: { type: 'bug-category', categoryId: null }
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
      <SortableContext items={bugs.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {bugs.map(bug => {
          const taskCount = bug.taskOrder?.length || 0;
          const completedCount = (bug.taskOrder || []).filter(tid => data.tasks[tid]?.finishedAt || data.tasks[tid]?.status === 'done').length;
          return (
            <SortableBugItem
              key={bug.id}
              bug={bug}
              taskCount={taskCount}
              completedCount={completedCount}
              onOpenDetails={() => onOpenDetails('bug', bug.id)}
              onViewTasks={() => onViewTasks('bug', bug.id)}
            />
          );
        })}
        {bugs.length === 0 && (
          <div style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '13px' }}>
            Drop bugs here to uncategorize
          </div>
        )}
      </SortableContext>
    </div>
  );
}

// Global Bugs List component
function GlobalBugsList() {
  const { data } = useTaskData();
  const { setActiveView, selectItem, searchQuery } = useUIState();
  const {
    createBug,
    moveBugToCategory,
    updateBugCategory,
    deleteBugCategory,
    reorderBugs,
    reorderBugCategories,
    reorderBugsInCategory
  } = useTaskActions();

  const [activeDragId, setActiveDragId] = useState(null);
  const [activeDragType, setActiveDragType] = useState(null); // 'bug' or 'category'

  // Add bug to a specific category
  const handleAddBugToCategory = useCallback(async (categoryId) => {
    const bug = await createBug('New Bug');
    await moveBugToCategory(bug.id, categoryId);
    selectItem('bug', bug.id);
  }, [createBug, moveBugToCategory, selectItem]);

  // Filter bugs by search query
  const filterBugs = useCallback((bugs) => {
    if (!searchQuery) return bugs;
    const query = searchQuery.toLowerCase();
    return bugs.filter(b =>
      b.title.toLowerCase().includes(query) ||
      (b.description || '').toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Get categories and uncategorized bugs
  const categories = useMemo(() => {
    if (!data?.bugCategories || !data?.bugCategoryOrder) return [];
    return (data.bugCategoryOrder || [])
      .map(id => data.bugCategories[id])
      .filter(Boolean);
  }, [data?.bugCategories, data?.bugCategoryOrder]);

  const uncategorizedBugsRaw = useMemo(() => {
    if (!data?.bugs || !data?.globalBugOrder) return [];
    return (data.globalBugOrder || [])
      .map(id => data.bugs[id])
      .filter(b => b && !b.categoryId);
  }, [data?.bugs, data?.globalBugOrder]);

  const uncategorizedBugs = useMemo(() => {
    return filterBugs(uncategorizedBugsRaw);
  }, [uncategorizedBugsRaw, filterBugs]);

  const getCategoryBugs = useCallback((category) => {
    if (!data?.bugs) return [];
    const bugs = (category.bugOrder || [])
      .map(id => data.bugs[id])
      .filter(Boolean);
    return filterBugs(bugs);
  }, [data?.bugs, filterBugs]);

  // All sortable IDs (categories with prefix + bugs)
  const allSortableIds = useMemo(() => {
    const ids = [];
    categories.forEach(cat => ids.push(`bcat-${cat.id}`));
    categories.forEach(cat => {
      const catBugs = getCategoryBugs(cat);
      catBugs.forEach(b => ids.push(b.id));
    });
    uncategorizedBugs.forEach(b => ids.push(b.id));
    return ids;
  }, [categories, getCategoryBugs, uncategorizedBugs]);

  // Handle drag start
  const handleDragStart = useCallback((event) => {
    const activeId = String(event.active.id);
    setActiveDragId(activeId);
    setActiveDragType(activeId.startsWith('bcat-') ? 'category' : 'bug');
  }, []);

  // Unified drag end handler for both categories and bugs
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveDragId(null);
    setActiveDragType(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Handle category drag
    if (activeId.startsWith('bcat-')) {
      if (!overId.startsWith('bcat-')) return;

      const activeCatId = activeId.replace('bcat-', '');
      const overCatId = overId.replace('bcat-', '');

      if (activeCatId === overCatId) return;

      const oldIndex = categories.findIndex(c => c.id === activeCatId);
      const newIndex = categories.findIndex(c => c.id === overCatId);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = categories.map(c => c.id);
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, activeCatId);
        reorderBugCategories(newOrder);
      }
      return;
    }

    // Handle bug drag
    const activeBug = data?.bugs?.[activeId];
    if (!activeBug) return;

    // Check if dropped on a category zone (droppable)
    const overData = over.data?.current;
    if (overData?.type === 'bug-category') {
      const targetCategoryId = overData.categoryId;
      const currentCategoryId = activeBug.categoryId || null;

      if (targetCategoryId !== currentCategoryId) {
        moveBugToCategory(activeId, targetCategoryId);
        return;
      }
    }

    // Check if dropped on another bug
    const overBug = data?.bugs?.[overId];
    if (overBug) {
      const targetCategoryId = overBug.categoryId || null;
      const currentCategoryId = activeBug.categoryId || null;

      // If bugs are in different categories, move to target category
      if (targetCategoryId !== currentCategoryId) {
        moveBugToCategory(activeId, targetCategoryId);
        return;
      }

      // Same category - reorder within that category
      if (targetCategoryId) {
        const category = data?.bugCategories?.[targetCategoryId];
        if (category) {
          const bugOrder = category.bugOrder || [];
          const oldIndex = bugOrder.indexOf(activeId);
          const newIndex = bugOrder.indexOf(overId);
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            const newOrder = [...bugOrder];
            newOrder.splice(oldIndex, 1);
            newOrder.splice(newIndex, 0, activeId);
            reorderBugsInCategory(targetCategoryId, newOrder);
          }
        }
      } else {
        // Both uncategorized - reorder in global order
        const uncatIds = data.globalBugOrder.filter(id => {
          const b = data.bugs[id];
          return b && !b.categoryId;
        });
        const oldIndex = uncatIds.indexOf(activeId);
        const newIndex = uncatIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = [...uncatIds];
          newOrder.splice(oldIndex, 1);
          newOrder.splice(newIndex, 0, activeId);
          const categorizedIds = data.globalBugOrder.filter(id => {
            const b = data.bugs[id];
            return b && b.categoryId;
          });
          reorderBugs([...categorizedIds, ...newOrder]);
        }
      }
    }
  }, [data, moveBugToCategory, reorderBugsInCategory, reorderBugs, categories, reorderBugCategories]);

  const hasContent = categories.length > 0 || uncategorizedBugs.length > 0 || (data?.globalBugOrder?.length > 0);

  if (!hasContent) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">No bugs yet</div>
        <div className="empty-state-text">
          Click "Add Bug" in the header to create one
        </div>
      </div>
    );
  }

  return (
    <div className="task-list">
      {/* Single DndContext for everything */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={allSortableIds} strategy={verticalListSortingStrategy}>
          {/* Categories with their bugs */}
          {categories.map(category => (
            <DraggableBugCategory
              key={category.id}
              category={category}
              bugs={getCategoryBugs(category)}
              data={data}
              onSelect={setActiveView}
              onEdit={selectItem}
              onUpdateCategory={updateBugCategory}
              onDeleteCategory={deleteBugCategory}
              onAddBug={handleAddBugToCategory}
            />
          ))}

          {/* Uncategorized bugs */}
          {(uncategorizedBugs.length > 0 || categories.length > 0) && (
            <div className="category-section">
              {categories.length > 0 && (
                <div className="category-header">
                  <span className="category-name">Uncategorized</span>
                  <span className="category-count">{uncategorizedBugs.length}</span>
                </div>
              )}
              <DroppableUncategorizedBugs
                bugs={uncategorizedBugs}
                data={data}
                onOpenDetails={selectItem}
                onViewTasks={setActiveView}
              />
            </div>
          )}
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay dropAnimation={null}>
          {activeDragId && activeDragType === 'bug' && (
            <div style={{
              padding: '8px 12px',
              background: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              borderRadius: '6px',
              fontSize: '12px',
              boxShadow: 'var(--shadow-lg)',
              whiteSpace: 'nowrap',
              transform: 'translate(20px, 20px)',
              pointerEvents: 'none'
            }}>
              Drag to reorder or move to category
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

export default memo(MainPanel);
