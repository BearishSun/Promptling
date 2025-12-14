# Implementation Plan: Unified List Components

## Summary
Consolidate the duplicated code between `SectionItemsList` (MainPanel.jsx, ~400 lines) and `TaskList` (TaskList.jsx, ~560 lines) into reusable shared components. Both components implement nearly identical functionality for displaying categorized, sortable, drag-and-drop lists with dnd-kit.

## Analysis

### Current State
- **TaskList.jsx** (~560 lines): Handles tasks within items (features/bugs)
- **SectionItemsList** (in MainPanel.jsx, ~400 lines): Handles items within sections
- Both share ~80% identical code patterns

### Duplicated Patterns
1. **dnd-kit setup**: Identical sensor configuration, collision detection, strategies
2. **Category components**: DroppableCategory, DraggableCategory with same behavior
3. **Uncategorized zones**: Same droppable implementation
4. **Icons**: ChevronIcon, DragIcon, PlusIcon, TrashIcon (duplicated)
5. **Utility functions**: `filterItems`, `sortCompletedToBottom`
6. **Drag handlers**: Nearly identical logic for category and item reordering

### Unique Features
- **SectionItemsList**: Convert item to task (Shift+drag), status/priority/complexity badges, DragOverlay
- **TaskList**: Uses TaskItem component for rendering

## Phases

### Phase 1: Extract Shared Icons
- [ ] Create `client/src/components/shared/icons.jsx`
- [ ] Move shared icons: ChevronIcon, DragIcon, PlusIcon, TrashIcon
- [ ] Update imports in TaskList.jsx and MainPanel.jsx

### Phase 2: Create Shared Category Components
- [ ] Create `client/src/components/shared/CategoryList/` directory
- [ ] Create `DroppableCategory.jsx` - generic droppable category container
  - Props: `category`, `expanded`, `onToggle`, `onUpdate`, `onDelete`, `onAdd`, `children`, `dragHandleProps`
  - Handles: expand/collapse, inline name editing, delete confirmation
- [ ] Create `DraggableCategoryWrapper.jsx` - wraps DroppableCategory with useSortable
- [ ] Create `DroppableUncategorizedZone.jsx` - generic uncategorized drop zone
  - Props: `droppableId`, `items`, `showHeader`, `emptyMessage`, `children`

### Phase 3: Create Shared List Hook
- [ ] Create `client/src/hooks/useSortableList.js`
- [ ] Extract shared logic:
  - dnd-kit sensors configuration
  - Category ordering computation from `categoryOrder`
  - Items filtering by search query
  - `sortCompletedToBottom` utility
  - Build sortable IDs (categories prefixed + items)
- [ ] Return: `sensors`, `sortableIds`, `filteredItems`, `getCategoryItems`

### Phase 4: Create Generic SortableList Component
- [ ] Create `client/src/components/shared/CategoryList/SortableList.jsx`
- [ ] Accept configuration via props:
  ```jsx
  <SortableList
    categories={categories}
    uncategorizedItems={uncategorizedItems}
    getCategoryItems={getCategoryItems}
    renderItem={renderItem}
    onDragEnd={handleDragEnd}
    categoryIdPrefix="cat-"  // "tcat-" for tasks, "icat-" for items
    droppablePrefix="category-"
  />
  ```
- [ ] Use render props pattern for item rendering flexibility

### Phase 5: Refactor TaskList
- [ ] Import shared icons from `shared/icons.jsx`
- [ ] Import shared category components
- [ ] Use `useSortableList` hook
- [ ] Use SortableList with TaskItem render prop
- [ ] Maintain existing TaskItem and SortableTaskItem
- [ ] Keep task-specific drag logic in handleDragEnd

### Phase 6: Refactor SectionItemsList
- [ ] Import shared icons from `shared/icons.jsx`
- [ ] Import shared category components
- [ ] Use `useSortableList` hook
- [ ] Use SortableList with SortableItem render prop
- [ ] Keep item-specific features:
  - Convert to task (Shift+drag)
  - DragOverlay for convert mode
  - Status/priority/complexity badges

### Phase 7: Testing & Cleanup
- [ ] Test TaskList functionality:
  - [ ] Create/delete tasks and categories
  - [ ] Drag reorder tasks within category
  - [ ] Drag tasks between categories
  - [ ] Drag reorder categories
  - [ ] Filter by search
  - [ ] Completed items at bottom
- [ ] Test SectionItemsList functionality:
  - [ ] Create/delete items and categories
  - [ ] Drag reorder items within category
  - [ ] Drag items between categories
  - [ ] Drag reorder categories
  - [ ] Convert item to task (Shift+drag)
  - [ ] Filter by search
  - [ ] Completed items at bottom
- [ ] Remove any remaining duplicated code

## Files to Modify

### New Files
- `client/src/components/shared/icons.jsx` - Shared icon components
- `client/src/components/shared/CategoryList/index.js` - Barrel export
- `client/src/components/shared/CategoryList/DroppableCategory.jsx` - Category container
- `client/src/components/shared/CategoryList/DraggableCategoryWrapper.jsx` - Sortable wrapper
- `client/src/components/shared/CategoryList/DroppableUncategorizedZone.jsx` - Uncategorized zone
- `client/src/components/shared/CategoryList/SortableList.jsx` - Main list orchestrator
- `client/src/hooks/useSortableList.js` - Shared list logic hook

### Modified Files
- `client/src/components/tasks/TaskList.jsx` - Use shared components
- `client/src/components/layout/MainPanel.jsx` - Use shared components in SectionItemsList

## Technical Approach

### Component Architecture
```
SortableList (orchestrator)
├── DndContext
│   └── SortableContext
│       ├── DraggableCategoryWrapper × N
│       │   └── DroppableCategory
│       │       └── {renderItem()} × M
│       └── DroppableUncategorizedZone
│           └── {renderItem()} × K
```

### Render Props Pattern
```jsx
// TaskList usage
<SortableList
  renderItem={(task, { isSelected, onSelect, onToggle, dragHandleProps }) => (
    <TaskItem task={task} {...props} />
  )}
/>

// SectionItemsList usage
<SortableList
  renderItem={(item, { convertMode, ...props }) => (
    <SortableItem item={item} convertMode={convertMode} {...props} />
  )}
/>
```

### Hook Interface
```js
const {
  sensors,
  allSortableIds,
  filteredCategories,
  uncategorizedItems,
  getCategoryItems,
  sortCompletedToBottom
} = useSortableList({
  data,
  parentId,
  categoriesKey: 'taskCategories', // or 'itemCategories'
  itemsKey: 'tasks', // or 'items'
  orderKey: 'taskOrder', // or 'itemOrder'
  searchQuery
});
```

## Testing

### Manual Testing Checklist
1. **TaskList (in item detail view)**:
   - Add new task → appears in list
   - Add new category → category section appears
   - Drag task within category → reorders correctly
   - Drag task to different category → moves correctly
   - Drag task to uncategorized → moves correctly
   - Drag category → reorders categories
   - Double-click category name → inline edit works
   - Delete category → tasks move to uncategorized
   - Search → filters tasks correctly
   - Complete task → moves to bottom

2. **SectionItemsList (in section view)**:
   - Add new item → appears in list
   - Add new category → category section appears
   - Drag item within category → reorders correctly
   - Drag item to different category → moves correctly
   - Shift+drag item onto another → converts to task
   - Drag category → reorders categories
   - Double-click category name → inline edit works
   - Delete category → items move to uncategorized
   - Search → filters items correctly
   - Complete item → moves to bottom

## Risk Assessment

### Low Risk
- Icon extraction (pure components, no logic)
- Hook extraction (no UI changes)

### Medium Risk
- Category component extraction (complex props drilling)
- Render props implementation (needs careful prop mapping)

### Mitigation
- Make changes incrementally
- Test each phase before proceeding
- Keep original implementations until new code is verified
