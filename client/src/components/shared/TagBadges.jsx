import { TAGS_BY_ID } from '../../services/api';

/**
 * Renders an item's/task's selected tags as colored rectangles.
 * Background uses the tag's chosen color; the name is shown in ALL CAPS
 * using the tag's text color. Unknown ids are ignored.
 *
 * Rendered as a fragment so the badges sit inline next to the Status and
 * Complexity badges in a flex meta row.
 */
function TagBadges({ tagIds }) {
  if (!tagIds || tagIds.length === 0) return null;

  return (
    <>
      {tagIds.map(id => {
        const tag = TAGS_BY_ID[id];
        if (!tag) return null;
        return (
          <span
            key={tag.id}
            className="tag-badge"
            style={{ background: tag.bgColor, color: tag.textColor }}
          >
            {tag.name.toUpperCase()}
          </span>
        );
      })}
    </>
  );
}

export default TagBadges;
