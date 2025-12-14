# Implementation Plan: Move Items Between Sections

## Summary
Add UI functionality to allow users to move features/bugs/items from one section to another. The backend API already supports this (`PUT /api/tasks/move-item`), so this is primarily a frontend implementation.

## Current State
- **Backend:** ✅ `PUT /api/tasks/move-item` endpoint exists and supports `targetSectionId`
- **API Client:** ✅ `tasksApi.moveItem()` exists
- **Context Action:** ✅ `moveItemToCategory()` exists but doesn't expose section moving in UI
- **Frontend UI:** ❌ No way to move items between sections

## Phases

### Phase 1: Add "Move to Section" Option in Detail Panel
- [ ] Add a "Section" dropdown in `DetailPanel.jsx`
- [ ] Show all available sections (current section pre-selected)
- [ ] Call `moveItemToCategory(itemId, null, targetSectionId)` when section is changed
- [ ] Refresh data after move

### Phase 2: Add Context Menu Option in Item List (Optional)
- [ ] Add right-click context menu to item rows in MainPanel
- [ ] Include "Move to Section" submenu with available sections
- [ ] Trigger the move action on selection

### Phase 3: Drag-and-Drop Between Sections (Optional Enhancement)
- [ ] Extend drag-and-drop to allow dropping items on sidebar sections
- [ ] Add drop zone indicators on Sidebar section items
- [ ] Handle cross-section drag-and-drop events

## Files to Modify

### Phase 1 (Primary)
- `client/src/components/layout/DetailPanel.jsx`
  - Add section selector dropdown
  - Add handler for section change
  - Place after Description section or near Category

## Technical Approach

### Phase 1 Implementation

Add a Section dropdown in DetailPanel.jsx for items (not tasks):

```jsx
{/* Section selector - only for items */}
{selectedItemType === 'item' && (
  <div className="detail-section">
    <div className="detail-section-title">Section</div>
    <select
      className="form-select"
      value={item.sectionId}
      onChange={(e) => handleMoveToSection(e.target.value)}
    >
      {Object.values(data.sections || {}).map(section => (
        <option key={section.id} value={section.id}>
          {section.name}
        </option>
      ))}
    </select>
  </div>
)}
```

Handler function:
```jsx
const handleMoveToSection = useCallback(async (targetSectionId) => {
  if (targetSectionId === item.sectionId) return;
  await moveItemToCategory(selectedItemId, null, targetSectionId);
}, [item?.sectionId, selectedItemId, moveItemToCategory]);
```

Note: `moveItemToCategory` already exists in TaskProvider and calls `tasksApi.moveItem()` then reloads data.

## Testing

### Manual Testing
1. Open an item in the Features section
2. Use the Section dropdown to select "Bugs"
3. Verify:
   - Item disappears from Features section
   - Item appears in Bugs section
   - Detail panel updates or closes appropriately
   - Any category assignment is cleared (item becomes uncategorized)

### Edge Cases
- Moving item that's in a category (categoryId should be cleared)
- Moving to same section (should be no-op)
- Moving last item from a section (section should remain)
- Custom sections work correctly

## Notes
- When moving between sections, the item's `categoryId` is cleared since categories are section-specific
- The existing backend and context action handle this correctly
- Phase 1 is the minimum viable implementation
- Phases 2-3 are enhancements for better UX
