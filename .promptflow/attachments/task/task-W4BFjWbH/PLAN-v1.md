# Implementation Plan: Multi-Project Support

## Summary
Add the ability to manage multiple projects in the TaskList application. Each project will have its own isolated set of features, bugs, tasks, categories, and tags. Users can create, switch between, rename, and delete projects.

## Phases

### Phase 1: Data Model & Storage Refactoring
- [ ] Design new data structure with projects as top-level containers
- [ ] Create project metadata model (id, name, createdAt, settings)
- [ ] Refactor server storage to support project-scoped data files
- [ ] Add migration logic for existing single-project data
- [ ] Create global settings file for cross-project preferences

### Phase 2: Server API Changes
- [ ] Add project CRUD endpoints (`GET/POST/PATCH/DELETE /api/projects`)
- [ ] Refactor all existing routes to accept `projectId` parameter
- [ ] Add project-specific data loading (`GET /api/projects/:id/data`)
- [ ] Update attachment storage paths to include project scope
- [ ] Add project export/import endpoints
- [ ] Update search to optionally search across projects

### Phase 3: Client Context Refactoring
- [ ] Create `ProjectProvider` context for project management
- [ ] Add `activeProjectId` to UI state
- [ ] Update `TaskProvider` to load data for active project only
- [ ] Create `useProjects()`, `useActiveProject()` hooks
- [ ] Update API service with project-scoped endpoints

### Phase 4: UI Implementation
- [ ] Add project selector dropdown in sidebar header
- [ ] Create "New Project" modal dialog
- [ ] Add project settings/rename functionality
- [ ] Add project delete with confirmation
- [ ] Show project indicator in main header
- [ ] Update sidebar to show current project context

### Phase 5: Polish & Migration
- [ ] Implement automatic migration of existing data to "Default" project
- [ ] Add keyboard shortcut for project switching (Cmd/Ctrl+P)
- [ ] Persist last active project in global settings
- [ ] Add loading states for project switching
- [ ] Test cross-project data isolation

## Files to Modify

### Server
- `server/routes/tasks.js` - Refactor all routes for project scope
- `server/routes/projects.js` - **New file** for project CRUD
- `server/index.js` - Add projects router

### Client
- `client/src/context/ProjectProvider.jsx` - **New file** for project context
- `client/src/context/TaskProvider.jsx` - Add project dependency
- `client/src/services/api.js` - Add project endpoints
- `client/src/App.jsx` - Wrap with ProjectProvider
- `client/src/components/layout/Sidebar.jsx` - Add project selector
- `client/src/components/projects/ProjectSelector.jsx` - **New file**
- `client/src/components/projects/NewProjectModal.jsx` - **New file**

### Data
- `.tasklist/projects.json` - **New file** for project metadata
- `.tasklist/projects/{projectId}/data.json` - Project-specific data
- `.tasklist/settings.json` - **New file** for global user settings

## Technical Approach

### Data Structure
```
.tasklist/
├── projects.json          # {projects: {id: {id, name, createdAt}}, order: []}
├── settings.json          # {activeProjectId, theme}
└── projects/
    ├── proj-ABC123/
    │   ├── data.json      # Current data.json structure
    │   └── attachments/
    └── proj-DEF456/
        ├── data.json
        └── attachments/
```

### Project Model
```javascript
{
  id: "proj-XXXXXXXX",
  name: "My Project",
  createdAt: "2025-01-01T00:00:00.000Z",
  color: "#3b82f6"  // Optional accent color
}
```

### API Design
```
Projects:
  GET    /api/projects              - List all projects
  POST   /api/projects              - Create project
  PATCH  /api/projects/:id          - Update project
  DELETE /api/projects/:id          - Delete project
  
Project Data:
  GET    /api/projects/:id/data     - Get project data
  PUT    /api/projects/:id/data     - Save project data
  
Existing routes become:
  POST   /api/projects/:id/feature  - Create feature in project
  etc.
```

### Migration Strategy
1. On first load, check for existing `data.json` at root level
2. If exists, create "Default" project and move data into it
3. Update `projects.json` with new project entry
4. Delete old root `data.json`
5. Set "Default" as active project

### Context Hierarchy
```
<ToastProvider>
  <ProjectProvider>      <!-- NEW: manages projects list & active project -->
    <TaskProvider>       <!-- Loads data for activeProjectId -->
      <AppContent />
    </TaskProvider>
  </ProjectProvider>
</ToastProvider>
```

## Testing

### Unit Tests
- Project CRUD operations
- Data isolation between projects
- Migration of existing data

### Integration Tests
- Create project → verify isolated data
- Switch projects → verify data reloads
- Delete project → verify cleanup
- Export/import project

### Manual Testing Checklist
- [ ] Create new project from scratch
- [ ] Switch between multiple projects
- [ ] Verify features/bugs/tasks don't leak between projects
- [ ] Rename project
- [ ] Delete project (verify confirmation)
- [ ] Export single project
- [ ] Import into new project
- [ ] Verify attachments work per-project
- [ ] Test migration of existing data

## Risks & Considerations

1. **Data Migration**: Existing users will have their data auto-migrated. Need to handle edge cases carefully.

2. **Performance**: Loading project list on startup adds latency. Consider lazy loading project data.

3. **Attachments**: File paths must be carefully managed to prevent cross-project access.

4. **URL/State**: Consider if project should be in URL for bookmarking/sharing.

5. **Backward Compatibility**: MCP server routes need to support project context while maintaining compatibility.

## Dependencies
- No new npm packages required
- Leverages existing React Context patterns
- Uses existing UI component styles

## Estimated Complexity
- **Phase 1**: Medium - Core refactoring
- **Phase 2**: Medium - Many routes to update
- **Phase 3**: Low-Medium - Pattern already established
- **Phase 4**: Low - Mostly UI components
- **Phase 5**: Low - Polish work
