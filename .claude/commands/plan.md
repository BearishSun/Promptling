Create or iterate on an implementation plan for a feature, bug, or task from the TaskList application.

## Usage
/plan <item name or partial title> [additional context or changes]

## Instructions

1. Use the `search_items` MCP tool to find the item by name
2. Use `get_item_context` to get full details including:
   - Description (the main prompt/requirements)
   - Existing sub-tasks
   - Attached documents and images
3. Check if a plan already exists using `get_plan`:
   - **If no plan exists**: Create a new implementation plan
   - **If plan exists**: Iterate on it, incorporating any new context provided
4. If there are image attachments, use `read_image` to analyze them
5. If there are text attachments, use `read_attachment` to read them
6. Use `get_prompt_history` to understand previous discussions
7. Create/update the plan:
   - Break down into phases or steps
   - Identify files to modify
   - Consider edge cases and error handling
   - Note dependencies or prerequisites
8. Use `create_plan` (new) or `update_plan` (iterate) to save
9. Use `append_prompt_history` to record this session

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
