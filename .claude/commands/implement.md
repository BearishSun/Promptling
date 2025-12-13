Implement a feature, bug, or task from the TaskList application.

## Usage
/implement <item name or partial title>

## Instructions

1. Use the `search_items` MCP tool to find the item by name
2. Use `get_item_context` to get full details including description, attachments, and sub-tasks
3. If there are image attachments, use `read_image` to analyze them for context
4. If there's an existing plan, use `get_plan` to read it
5. Use `mark_in_progress` to update the item's status
6. Implement the feature/bug/task according to its description
7. When complete, use `mark_done` to update status
8. Use `append_prompt_history` to record what was implemented

## Example
User: /implement user authentication
Claude: *searches for "user authentication", finds the feature, reads its description and plan, marks it in-progress, implements the code, then marks it done*
