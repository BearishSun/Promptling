# Implementation Plan: Side-by-Side Task View

## Summary
Modify the task view to open as a panel to the right of the Features/Bugs list, creating a side-by-side layout where both views are visible simultaneously.

## Current Behavior
- MainPanel switches between two views: Section View (items list) OR Item View (tasks)
- When user clicks arrow on an item, the entire MainPanel is replaced with TaskList
- User loses sight of the section list

## New Behavior
- Section list remains visible on the left
- Task panel opens to the right when an item is expanded
- Both panels visible simultaneously
- User can navigate section list while viewing tasks

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/index.css` | Add 3-column grid layout, task panel styles |
| `client/src/components/layout/TaskPanel.jsx` | **NEW** - Task panel component |
| `client/src/context/TaskProvider.jsx` | Add `closeTaskPanel` action, modify `setActiveItem` |
| `client/src/App.jsx` | Add TaskPanel to layout, conditional grid class |
| `client/src/components/layout/MainPanel.jsx` | Remove task view rendering, simplify to section-only |

## Phases

### Phase 1: CSS Layout Infrastructure
- [ ] Add `--task-panel-width: 500px` CSS variable
- [ ] Add `.app-layout.with-task-panel` with 3-column grid
- [ ] Add `.task-panel` styles (border, background, flex column)
- [ ] Add responsive fallback for narrow screens (<1200px) - overlay mode

### Phase 2: Create TaskPanel Component
- [ ] Create `client/src/components/layout/TaskPanel.jsx`
- [ ] Include header with item title and close button
- [ ] Include search input and add menu (task/category)
- [ ] Render existing TaskList component
- [ ] Wire up close button to `closeTaskPanel` action

### Phase 3: State Management Updates
- [ ] Add `closeTaskPanel` action to TaskProvider
- [ ] Modify `setActiveItem` to NOT change `activeView` to 'item'
- [ ] Keep `activeItemId` as the trigger for task panel visibility
- [ ] Update `setActiveSection` to close task panel

### Phase 4: Update App Layout
- [ ] Import TaskPanel in App.jsx
- [ ] Add conditional class `with-task-panel` when `activeItemId` is set
- [ ] Render `<TaskPanel />` conditionally after MainPanel

### Phase 5: Simplify MainPanel
- [ ] Remove `activeView === 'item'` conditional rendering
- [ ] Remove back button (no longer needed)
- [ ] Remove task-related add menu items
- [ ] Always render SectionItemsList for section view

### Phase 6: Polish
- [ ] Add visual highlight to active item in section list
- [ ] Test responsive behavior
- [ ] Ensure DetailPanel still works correctly over the new layout

## Technical Approach

### Layout Change
```css
/* Before: 2 columns */
.app-layout {
  grid-template-columns: var(--sidebar-width) 1fr;
}

/* After: 3 columns when task panel open */
.app-layout.with-task-panel {
  grid-template-columns: var(--sidebar-width) 1fr var(--task-panel-width);
}
```

### State Flow
```
User clicks item arrow
  -> setActiveItem(itemId)
  -> activeItemId = itemId (activeView stays 'section')
  -> App.jsx adds 'with-task-panel' class
  -> TaskPanel renders with TaskList

User clicks close on TaskPanel
  -> closeTaskPanel()
  -> activeItemId = null
  -> TaskPanel unmounts
```

### Component Structure
```
App.jsx
├── Sidebar
├── MainPanel (always shows section list)
├── TaskPanel (conditional, shows tasks for activeItemId)
└── DetailPanel (modal overlay for editing)
```

## Testing
- [ ] Expand a feature - task panel appears on right
- [ ] Section list remains visible and navigable
- [ ] Click different item - task panel updates
- [ ] Click close - task panel closes
- [ ] Click task - DetailPanel opens correctly
- [ ] Switch sections - task panel closes
- [ ] Narrow screen - panel behaves as overlay