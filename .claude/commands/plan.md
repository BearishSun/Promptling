Create or iterate on an implementation plan for a feature, bug, or task from the PromptFlow application.

## Usage
/plan <item name or partial title> [additional context or changes]

## Important
- This command is for RESEARCH and PLANNING only - do NOT write or edit any code
- Do NOT use EnterPlanMode - that is a different feature
- Save the plan to PromptFlow using the MCP `update` tool with `action: 'save_plan'`

## Instructions

1. Use the `search` MCP tool to find the item by name
2. Use `get` to get full details including:
   - Description (the main prompt/requirements)
   - Existing sub-tasks
   - Attachment summary
3. Check if a plan exists using `read` with `contentType: 'plan'`:
   - **If no plan exists**: Create a new implementation plan
   - **If plan exists**: Iterate on it, incorporating any new context provided
4. If there are image attachments, use `read` with `contentType: 'image'` to analyze them
5. If there are text attachments, use `read` with `contentType: 'attachment'` to read them
6. Use `read` with `contentType: 'prompt_history'` to understand previous discussions
7. Create/update the plan using `update` with `action: 'save_plan'` and `planContent` (returns file path)
8. Record this session using `update` with `action: 'append_prompt'` (keep to 1-2 lines, e.g., "Created plan v1 for X feature")

## MCP Tool Reference

```javascript
// Search for item (itemType: 'all' | 'item' | 'task')
search({ query: 'item name', itemType: 'all' })

// Get full item details (type: 'item' | 'task')
// IDs: feat-xxx for features, bug-xxx for bugs, task-xxx for tasks
get({ type: 'item', id: '<item-id>' })

// Read existing plan
read({ type: 'item', id: '<item-id>', contentType: 'plan' })

// Read image attachment
read({ type: 'item', id: '<item-id>', contentType: 'image', attachmentId: 'att-xxx' })

// Read prompt history
read({ type: 'item', id: '<item-id>', contentType: 'prompt_history' })

// Save plan (auto-versions)
update({ type: 'item', id: '<item-id>', action: 'save_plan', planContent: '# Plan...' })

// Append to prompt history
update({ type: 'item', id: '<item-id>', action: 'append_prompt', promptEntry: { role: 'assistant', content: 'Created plan v1' } })
```

## Plan Format
```markdown
# Implementation Plan: [Title]

## Summary
[Brief description of what's being implemented]

## Phases
### Phase 1: [Name]
- [ ] Step 1
- [ ] Step 2

### Phase 2: [Name]
...

## Files to Modify
- `path/to/file.js` - Description of changes

## Technical Approach
[How the implementation will work]

## Testing
[How to verify the implementation]
```

## Examples
- `/plan user authentication` - Creates new plan for user authentication feature
- `/plan user authentication add OAuth support` - Updates existing plan to include OAuth
