Break a feature or bug into sub-tasks based on its title, description, and implementation plan.

## Usage
/breakdown <item name or partial title>

## Important
- This command ANALYZES the feature and CREATES sub-tasks - it does NOT implement code
- If the target is a task (not a feature/bug), ask the user if they want to promote it first
- Generally create 3-5 sub-tasks, potentially more for very large features
- If the plan has phases, each phase should become a sub-task
- Copy relevant parts of the plan into each sub-task's description

## Instructions

1. Use the `search` MCP tool to find the item by name
2. Use `get` to get full details including:
   - Title and description
   - Existing sub-tasks (to avoid duplicates)
   - Attachment summary (to check for plan)
3. **Check if it's a task**: If `get` returns `type: 'task'`, use AskUserQuestion to ask the user:
   - "The item you specified is a task, not a feature/bug. Would you like to promote it to a feature first?"
   - If yes, use Bash with curl to promote it:
     ```bash
     curl -X POST http://localhost:3001/api/tasks/promote-task \
       -H "Content-Type: application/json" \
       -d '{"taskId": "<task-id>", "targetSectionId": "sect-features"}'
     ```
   - Then continue with the new item ID from the response
4. Check if a plan exists using `read` with `contentType: 'plan'`:
   - If plan exists, analyze its phases/sections to structure the breakdown
   - Each major phase should become a sub-task
5. Analyze the feature and create a breakdown:
   - Consider the title, description, and plan (if available)
   - Group related work into logical sub-tasks
   - Each sub-task should be independently completable
   - Aim for 3-5 sub-tasks for typical features, more for complex ones
6. Create each sub-task using `create` with:
   - `itemType: 'task'`
   - `parentId: '<item-id>'`
   - `title: '<descriptive task title>'`
   - `description: '<relevant details from plan/description>'`
7. Record this session using `update` with `action: 'append_prompt'`
   - Example: "Broke down into 4 sub-tasks: Task 1, Task 2, Task 3, Task 4"

## MCP Tool Reference

```javascript
// Search for item (itemType: 'all' | 'item' | 'task')
search({ query: 'item name', itemType: 'all' })

// Get full item details (type: 'item' | 'task')
get({ type: 'item', id: '<item-id>' })

// Read existing plan
read({ type: 'item', id: '<item-id>', contentType: 'plan' })

// Create a sub-task
create({
  itemType: 'task',
  parentId: '<item-id>',
  title: 'Task title',
  description: '## Scope\n- Detail 1\n- Detail 2'
})

// Record what was done
update({
  type: 'item',
  id: '<item-id>',
  action: 'append_prompt',
  promptEntry: { role: 'assistant', content: 'Broke down into N sub-tasks' }
})
```

## Sub-task Description Format

Each sub-task description should include:
```markdown
## Scope
[What this task covers]

## From Plan
[Relevant excerpt from the implementation plan, if available]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

## Breakdown Guidelines

1. **Logical grouping**: Group related changes together (e.g., "Backend API endpoints" vs "Frontend components")
2. **Independent tasks**: Each task should be completable without blocking on others when possible
3. **Clear scope**: Task titles should clearly indicate what's included
4. **Plan alignment**: If a plan has phases, respect those phase boundaries
5. **Avoid over-splitting**: 3-5 tasks is usually enough; don't create trivially small tasks

## Examples

### Feature with Plan (3 phases)
- `/breakdown user authentication`
- Finds feature, reads plan with Phase 1 (DB schema), Phase 2 (API), Phase 3 (UI)
- Creates 3 sub-tasks, one per phase, with relevant plan content copied to each

### Feature without Plan
- `/breakdown dark mode toggle`
- Analyzes title/description
- Creates logical tasks: "Add theme context/state", "Create toggle component", "Update CSS variables", "Test theme persistence"

### Bug with simple fix
- `/breakdown login redirect bug`
- If it's a simple bug, might create just 2-3 tasks: "Investigate root cause", "Implement fix", "Add regression test"
