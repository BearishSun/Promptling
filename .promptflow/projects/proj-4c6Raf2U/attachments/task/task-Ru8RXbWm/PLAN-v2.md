# Implementation Plan: Unified Sections System

## Summary
Refactor the application to use a unified sections system where Features and Bugs become built-in system sections, and users can create custom sections. All section types share the same data structure and UI components.

## Data Structure Changes

```javascript
// NEW unified structure - replaces features/bugs with sections
{
  sections: {
    'sect-features': {
      id: 'sect-features',
      name: 'Features',
      icon: 'layers',
      color: '#3b82f6',
      isSystem: true,      // cannot be deleted
      itemOrder: [],
      categoryOrder: [],
      createdAt: '...'
    },
    'sect-bugs': {
      id: 'sect-bugs', 
      name: 'Bugs',
      icon: 'bug',
      color: '#ef4444',
      isSystem: true,
      itemOrder: [],
      categoryOrder: [],
      createdAt: '...'
    },
    'sect-custom': {
      id: 'sect-custom',
      name: 'Milestones',
      icon: 'flag',
      color: '#6366f1',
      isSystem: false,     // user-created, can be deleted
      itemOrder: [],
      categoryOrder: [],
      createdAt: '...'
    }
  },
  sectionOrder: ['sect-features', 'sect-bugs', 'sect-custom'],
  
  items: {                 // unified items (formerly features/bugs/sectionItems)
    'item-xyz': {
      id: 'item-xyz',
      sectionId: 'sect-features',
      title: 'User Auth',
      description: '...',
      status: 'open',
      priority: 'medium',
      complexity: null,
      taskOrder: [],
      categoryOrder: [],
      attachments: [],
      promptHistory: [],
      createdAt: '...',
      finishedAt: null
    }
  },
  
  itemCategories: {        // categories within sections (for grouping items)
    'icat-abc': { id, sectionId, name, itemOrder: [] }
  },
  
  tasks: { ... },          // unchanged - tasks belong to items
  taskCategories: { ... }, // renamed from 'categories'
  tags: { ... }            // unchanged
}
```

## Migration Strategy
On data load, detect old format and migrate:
1. Create system sections for Features and Bugs
2. Move `features` → `items` with `sectionId: 'sect-features'`
3. Move `bugs` → `items` with `sectionId: 'sect-bugs'`
4. Rename `featureCategories` → `itemCategories` with appropriate sectionId
5. Rename `bugCategories` → `itemCategories`
6. Rename `categories` → `taskCategories`
7. Update task `parentType`/`parentId` → just `itemId`

## Phases

### Phase 1: Data Migration Layer
- [ ] Create migration function `migrateToUnifiedSections(data)`
- [ ] Update `getDefaultData()` with unified structure
- [ ] Add migration detection in `loadData()`
- [ ] Bump version to 4

### Phase 2: Backend API Refactor
- [ ] Replace feature/bug endpoints with unified section/item endpoints
- [ ] POST `/api/tasks/section` - create section
- [ ] PATCH/DELETE `/api/tasks/section/:id`
- [ ] POST `/api/tasks/item` - create item in section
- [ ] PATCH/DELETE `/api/tasks/item/:id`
- [ ] Update reorder endpoint for sections and items
- [ ] Keep task endpoints unchanged (just update parentType reference)

### Phase 3: MCP Tools Update
- [ ] Update `search` to use unified items
- [ ] Update `get` for section/item types
- [ ] Update `create` with section/item types
- [ ] Update `update` for sections/items
- [ ] Update `list` for section categories

### Phase 4: Client API Refactor
- [ ] Replace feature/bug methods with section/item methods in `api.js`
- [ ] Add backwards-compat aliases during transition

### Phase 5: TaskProvider Refactor
- [ ] Replace separate feature/bug state with unified sections/items
- [ ] Update all actions to use new structure
- [ ] Simplify code by removing duplication

### Phase 6: Sidebar UI
- [ ] Render all sections from `sectionOrder`
- [ ] Add "New Section" button
- [ ] Section editing (name, icon, color)
- [ ] Protect system sections from deletion
- [ ] Section reordering

### Phase 7: MainPanel Refactor
- [ ] Replace `GlobalFeaturesList`/`GlobalBugsList` with `SectionItemsList`
- [ ] Single component handles all sections
- [ ] View types: `'section'` (list items), `'item'` (list tasks)

### Phase 8: DetailPanel Update
- [ ] Unified item detail editing
- [ ] Show section badge/indicator

## Files to Modify
- `server/routes/tasks.js` - Full refactor to unified model
- `server/routes/mcp.js` - Update tool handlers
- `client/src/services/api.js` - Unified API methods
- `client/src/context/TaskProvider.jsx` - Unified state
- `client/src/components/layout/Sidebar.jsx` - Dynamic sections
- `client/src/components/layout/MainPanel.jsx` - Single list component
- `client/src/components/layout/DetailPanel.jsx` - Unified item details

## Icon Options
System: `layers` (Features), `bug` (Bugs)
User: `flag`, `star`, `rocket`, `target`, `calendar`, `folder`, `bookmark`, `lightning`, `check-circle`, `archive`

## Benefits of Unified Approach
1. **Less code duplication** - One set of components for all sections
2. **Consistent behavior** - All sections work identically
3. **Easier maintenance** - Single code path to update
4. **Flexible** - Users can rename/recolor even system sections
5. **Extensible** - Easy to add new section types

## Testing
- Fresh install creates system sections correctly
- Migration from v3 data preserves all features/bugs
- CRUD operations on sections and items
- System sections cannot be deleted
- Reordering works across all sections
- Import/export compatibility
- MCP tools work with new structure
