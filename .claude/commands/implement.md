Implement a feature, bug, or task from the Promptling application.

## Usage
/implement <item name or partial title>

## Instructions

1. Use the `search` MCP tool to find the item by name
2. Use `get` to get full details including description, attachments, and sub-tasks
3. If there are image attachments, use `read` with `contentType: 'image'` to analyze them
4. If there's an existing plan, use `read` with `contentType: 'plan'` to read it
5. **For sub-tasks**: If implementing a task (not a top-level item), also read the parent item's plan:
   - The `get` response for a task includes `parentId`
   - Use `read` with `contentType: 'plan'` on the parent item to understand the broader context
   - Extract relevant information about how this task fits into the overall implementation
6. Mark the item as in-progress using `update` with `updates: { status: 'in-progress' }`
7. Implement the feature/bug/task according to its description and plan
8. When complete, mark as done using `update` with `updates: { status: 'done' }`
9. Record what was implemented using `update` with `action: 'append_prompt'`:
   - `title`: Brief summary (e.g., "Implemented user login API")
   - `description`: Detailed notes including:
     - Files created or modified
     - Key implementation decisions
     - Any deviations from the plan
     - Testing notes or known limitations

## MCP Tool Reference

```javascript
// Search for item (itemType: 'all' | 'item' | 'task')
search({ query: 'item name', itemType: 'all' })

// Get full item details (type: 'item' | 'task')
// IDs: feat-xxx for features, bug-xxx for bugs, task-xxx for tasks
get({ type: 'item', id: '<item-id>' })
get({ type: 'task', id: '<task-id>' })  // Returns parentId for context

// Read existing plan
read({ type: 'item', id: '<item-id>', contentType: 'plan' })

// For sub-tasks: read parent's plan for context
read({ type: 'item', id: '<parent-item-id>', contentType: 'plan' })

// Read image attachment
read({ type: 'item', id: '<item-id>', contentType: 'image', attachmentId: 'att-xxx' })

// Mark in-progress
update({ type: 'item', id: '<item-id>', updates: { status: 'in-progress' } })

// Mark done
update({ type: 'item', id: '<item-id>', updates: { status: 'done' } })

// Record implementation notes (verbose format)
update({
  type: 'item',
  id: '<item-id>',
  action: 'append_prompt',
  promptEntry: {
    role: 'assistant',
    title: 'Implemented user authentication backend',
    description: 'Created auth routes in server/routes/auth.js with login/register/logout endpoints. Added JWT middleware in server/middleware/auth.js. Modified User model to include password hashing with bcrypt. Deviated from plan: Used httpOnly cookies instead of localStorage for tokens (security improvement). Tests passing. Note: Frontend integration pending.'
  }
})
```

## Example
User: /implement user authentication
Claude: *searches for "user authentication", finds the feature, reads its description and plan, marks it in-progress, implements the code, then marks it done with detailed notes*
