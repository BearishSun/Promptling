# Implementation Plan: Custom High-Level Sections

## Summary
Add user-definable top-level sections beyond the fixed Features/Bugs, allowing custom organization (e.g., "Epics", "Milestones", "Sprints").

## Data Structure Changes

```javascript
// Add to data.json
{
  sections: {
    'sect-abc123': {
      id: 'sect-abc123',
      name: 'Milestones',
      icon: 'flag',        // predefined icon name
      color: '#6366f1',
      itemOrder: [],       // section item IDs
      categoryOrder: [],   // category IDs within section
      createdAt: '...'
    }
  },
  sectionOrder: [],        // order of sections in sidebar
  sectionItems: {          // items within sections (like features/bugs)
    'sitem-xyz': { id, sectionId, title, description, status, taskOrder, categoryOrder, ... }
  },
  sectionCategories: {     // categories within sections
    'scat-def': { id, sectionId, name, itemOrder: [] }
  }
}
```

## Phases

### Phase 1: Backend Data Layer
- [ ] Update `getDefaultData()` with new fields
- [ ] Add section CRUD endpoints: POST/PATCH/DELETE `/api/tasks/section`
- [ ] Add section item endpoints: POST/PATCH/DELETE `/api/tasks/section-item`
- [ ] Add section category endpoints
- [ ] Update reorder endpoint for sections
- [ ] Update MCP tools to support section types

### Phase 2: Client API & State
- [ ] Add section methods to `api.js`
- [ ] Update `TaskProvider.jsx` with section state and actions
- [ ] Add new view types: `'section'`, `'section-item'`

### Phase 3: Sidebar UI
- [ ] Render custom sections below Features/Bugs
- [ ] Add "New Section" button
- [ ] Section name/icon/color editing
- [ ] Section reordering (drag-and-drop)
- [ ] Section deletion

### Phase 4: Main Panel
- [ ] Create `GlobalSectionItemsList` component (clone of `GlobalFeaturesList`)
- [ ] Handle `section` view type
- [ ] Handle `section-item` view for tasks within section items

### Phase 5: Detail Panel
- [ ] Support section item editing in `DetailPanel.jsx`

## Files to Modify
- `server/routes/tasks.js` - New endpoints, data structure
- `server/routes/mcp.js` - Add section to search/create/update
- `client/src/services/api.js` - Section API methods
- `client/src/context/TaskProvider.jsx` - Section state/actions
- `client/src/components/layout/Sidebar.jsx` - Render sections
- `client/src/components/layout/MainPanel.jsx` - Section views
- `client/src/components/layout/DetailPanel.jsx` - Section item details

## Icon Options
Predefined set: `flag`, `star`, `rocket`, `target`, `calendar`, `folder`, `bookmark`, `lightning`

## Testing
- Create section → add item → add tasks → complete workflow
- Reorder sections in sidebar
- Import/export with sections
- MCP tool compatibility
