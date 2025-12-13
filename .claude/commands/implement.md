Implement a feature, bug, or task from the PromptFlow application.

## Usage
/implement <item name or partial title>

## Instructions

1. Use the `search` MCP tool to find the item by name
2. Use `get` to get full details including description, attachments, and sub-tasks
3. If there are image attachments, use `read` with `contentType: 'image'` to analyze them
4. If there's an existing plan, use `read` with `contentType: 'plan'` to read it
5. Mark the item as in-progress using `update` with `updates: { status: 'in-progress' }`
6. Implement the feature/bug/task according to its description and plan
7. When complete, mark as done using `update` with `updates: { status: 'done' }`
8. Record what was implemented using `update` with `action: 'append_prompt'` (keep to 1-2 lines, e.g., "Implemented X: added Y, modified Z")

## MCP Tool Reference

```javascript
// Search for item
search({ query: 'item name', itemType: 'all' })

// Get full item details
get({ type: 'task', id: 'task-xxx' })

// Read existing plan
read({ type: 'task', id: 'task-xxx', contentType: 'plan' })

// Read image attachment
read({ type: 'task', id: 'task-xxx', contentType: 'image', attachmentId: 'att-xxx' })

// Mark in-progress
update({ type: 'task', id: 'task-xxx', updates: { status: 'in-progress' } })

// Mark done
update({ type: 'task', id: 'task-xxx', updates: { status: 'done' } })

// Record implementation notes
update({ type: 'task', id: 'task-xxx', action: 'append_prompt', promptEntry: { role: 'assistant', content: 'Implemented: ...' } })
```

## Example
User: /implement user authentication
Claude: *searches for "user authentication", finds the feature, reads its description and plan, marks it in-progress, implements the code, then marks it done*
