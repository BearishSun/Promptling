import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useTaskData, useTaskActions, useUIState } from '../../context/TaskProvider';
import MarkdownEditor from '../detail/MarkdownEditor';
import { formatDateTime } from '../../utils/dateFormat';
import tasksApi, { TASK_STATUSES, PRIORITIES, COMPLEXITIES } from '../../services/api';

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const XIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

const PaperclipIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
  </svg>
);

const FileIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
  </svg>
);

const ImageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21,15 16,10 5,21" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

const CopyIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

// Default tag colors
const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

// Get item type label
const getItemTypeLabel = (type) => {
  switch (type) {
    case 'feature': return 'Feature';
    case 'bug': return 'Bug';
    case 'task': return 'Task';
    default: return 'Item';
  }
};

function DetailPanel() {
  const { data } = useTaskData();
  const { updateTask, deleteTask, updateFeature, deleteFeature, updateBug, deleteBug, createTag, addTagToTask, removeTagFromTask, uploadAttachment, deleteAttachment } = useTaskActions();
  const { selectedItemType, selectedItemId, clearSelection } = useUIState();
  const [editTitle, setEditTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Get the selected item based on type
  const item = (() => {
    if (!selectedItemId || !selectedItemType) return null;
    switch (selectedItemType) {
      case 'task': return data?.tasks?.[selectedItemId];
      case 'feature': return data?.features?.[selectedItemId];
      case 'bug': return data?.bugs?.[selectedItemId];
      default: return null;
    }
  })();

  // Tags are only for tasks currently
  const allTags = Object.values(data?.tags || {});
  const itemTags = selectedItemType === 'task' ? (item?.tagIds || []).map(id => data?.tags?.[id]).filter(Boolean) : [];
  const availableTags = allTags.filter(tag => !(item?.tagIds || []).includes(tag.id));

  // Update local title when item changes
  useEffect(() => {
    if (item) {
      setEditTitle(item.title);
    }
  }, [selectedItemId, item?.title]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isEditingTitle && !showTagDropdown) {
        clearSelection();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection, isEditingTitle, showTagDropdown]);

  const handleTitleSubmit = useCallback(() => {
    if (editTitle.trim() && editTitle !== item?.title) {
      switch (selectedItemType) {
        case 'task':
          updateTask(selectedItemId, { title: editTitle.trim() });
          break;
        case 'feature':
          updateFeature(selectedItemId, { title: editTitle.trim() });
          break;
        case 'bug':
          updateBug(selectedItemId, { title: editTitle.trim() });
          break;
      }
    }
    setIsEditingTitle(false);
  }, [editTitle, item?.title, selectedItemType, selectedItemId, updateTask, updateFeature, updateBug]);

  const handleDescriptionChange = useCallback((description) => {
    switch (selectedItemType) {
      case 'task':
        updateTask(selectedItemId, { description });
        break;
      case 'feature':
        updateFeature(selectedItemId, { description });
        break;
      case 'bug':
        updateBug(selectedItemId, { description });
        break;
    }
  }, [selectedItemType, selectedItemId, updateTask, updateFeature, updateBug]);

  const handleDelete = useCallback(async () => {
    const label = getItemTypeLabel(selectedItemType);
    if (!confirm(`Delete this ${label.toLowerCase()}?`)) return;

    switch (selectedItemType) {
      case 'task':
        await deleteTask(selectedItemId);
        break;
      case 'feature':
        await deleteFeature(selectedItemId);
        break;
      case 'bug':
        await deleteBug(selectedItemId);
        break;
    }
    clearSelection();
  }, [selectedItemType, selectedItemId, deleteTask, deleteFeature, deleteBug, clearSelection]);

  const handleStatusChange = useCallback((newStatus) => {
    const updates = { status: newStatus };
    // Auto-set finishedAt when marking as done
    if (newStatus === 'done' && !item?.finishedAt) {
      updates.finishedAt = new Date().toISOString();
    } else if (newStatus !== 'done' && item?.finishedAt) {
      updates.finishedAt = null;
    }

    switch (selectedItemType) {
      case 'task':
        updateTask(selectedItemId, updates);
        break;
      case 'feature':
        updateFeature(selectedItemId, updates);
        break;
      case 'bug':
        updateBug(selectedItemId, updates);
        break;
    }
  }, [item?.finishedAt, selectedItemType, selectedItemId, updateTask, updateFeature, updateBug]);

  const handlePriorityChange = useCallback((newPriority) => {
    switch (selectedItemType) {
      case 'task':
        updateTask(selectedItemId, { priority: newPriority });
        break;
      case 'feature':
        updateFeature(selectedItemId, { priority: newPriority });
        break;
      case 'bug':
        updateBug(selectedItemId, { priority: newPriority });
        break;
    }
  }, [selectedItemType, selectedItemId, updateTask, updateFeature, updateBug]);

  const handleComplexityChange = useCallback((newComplexity) => {
    switch (selectedItemType) {
      case 'task':
        updateTask(selectedItemId, { complexity: newComplexity });
        break;
      case 'feature':
        updateFeature(selectedItemId, { complexity: newComplexity });
        break;
      case 'bug':
        updateBug(selectedItemId, { complexity: newComplexity });
        break;
    }
  }, [selectedItemType, selectedItemId, updateTask, updateFeature, updateBug]);

  const handleAddTag = useCallback((tagId) => {
    if (selectedItemType === 'task') {
      addTagToTask(selectedItemId, tagId);
    }
    setShowTagDropdown(false);
  }, [selectedItemType, selectedItemId, addTagToTask]);

  const handleRemoveTag = useCallback((tagId) => {
    if (selectedItemType === 'task') {
      removeTagFromTask(selectedItemId, tagId);
    }
  }, [selectedItemType, selectedItemId, removeTagFromTask]);

  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim() || selectedItemType !== 'task') return;
    const tag = await createTag(newTagName.trim(), newTagColor);
    addTagToTask(selectedItemId, tag.id);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
    setShowTagDropdown(false);
  }, [newTagName, newTagColor, selectedItemType, createTag, addTagToTask, selectedItemId]);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await uploadAttachment(selectedItemType, selectedItemId, file);
    } catch (error) {
      console.error('Failed to upload attachment:', error);
      alert(error.response?.data?.error || 'Failed to upload file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedItemType, selectedItemId, uploadAttachment]);

  const handleDeleteAttachment = useCallback(async (attachmentId) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      await deleteAttachment(selectedItemType, selectedItemId, attachmentId);
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      alert('Failed to delete attachment');
    }
  }, [selectedItemType, selectedItemId, deleteAttachment]);

  const isImageFile = useCallback((mimeType) => {
    return mimeType?.startsWith('image/');
  }, []);

  const formatFileSize = useCallback((bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }, []);

  const handleCopyPath = useCallback(async (attachment) => {
    try {
      const storedPath = attachment.storedPath || attachment.storedName;
      const filePath = await tasksApi.getAttachmentFilePath(storedPath);
      await navigator.clipboard.writeText(filePath);
      // Brief visual feedback could be added here
    } catch (error) {
      console.error('Failed to copy path:', error);
      alert('Failed to copy file path');
    }
  }, []);

  // Get the URL for an attachment (handles both old and new structure)
  const getAttachmentUrl = useCallback((attachment) => {
    const storedPath = attachment.storedPath || attachment.storedName;
    return tasksApi.getAttachmentUrl(storedPath);
  }, []);

  if (!item) {
    return null;
  }

  const currentStatus = item.status || 'open';
  const typeLabel = getItemTypeLabel(selectedItemType);
  const isTask = selectedItemType === 'task';
  const isFeatureOrBug = selectedItemType === 'feature' || selectedItemType === 'bug';

  // Count tasks for features/bugs
  const taskCount = isFeatureOrBug ? (item.taskOrder?.length || 0) : 0;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      clearSelection();
    }
  };

  return (
    <div className="detail-overlay" onClick={handleOverlayClick}>
    <aside className="detail-panel">
      <div className="detail-header">
        <button className="detail-close" onClick={clearSelection} title="Close">
          <CloseIcon />
        </button>

        {isEditingTitle ? (
          <input
            type="text"
            className="detail-title-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setEditTitle(item.title);
                setIsEditingTitle(false);
              }
            }}
            autoFocus
          />
        ) : (
          <input
            type="text"
            className="detail-title-input"
            value={item.title}
            onFocus={() => setIsEditingTitle(true)}
            readOnly
          />
        )}

        <button
          className="btn btn-icon btn-secondary"
          onClick={handleDelete}
          title={`Delete ${typeLabel.toLowerCase()}`}
        >
          <TrashIcon />
        </button>
      </div>

      <div className="detail-content">
        {/* Type indicator */}
        <div className="detail-section">
          <span className={`type-badge type-${selectedItemType}`}>
            {typeLabel}
          </span>
        </div>

        {/* Status */}
        <div className="detail-section">
          <div className="detail-section-title">Status</div>
          <div className="status-select">
            {TASK_STATUSES.map(status => (
              <button
                key={status.value}
                className={`status-option ${status.value} ${currentStatus === status.value ? 'selected' : ''}`}
                onClick={() => handleStatusChange(status.value)}
              >
                <span className={`status-dot ${status.value}`} />
                {status.label}
              </button>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="detail-section">
          <div className="detail-section-title">Priority</div>
          <div className="priority-select">
            {PRIORITIES.map(priority => (
              <button
                key={priority.value}
                className={`priority-option ${item.priority === priority.value ? 'selected' : ''}`}
                onClick={() => handlePriorityChange(priority.value)}
                style={{
                  '--priority-color': priority.color,
                  borderColor: item.priority === priority.value ? priority.color : undefined,
                  background: item.priority === priority.value ? `${priority.color}15` : undefined
                }}
                title={priority.label}
              >
                <span className="priority-icon" style={{ color: priority.color }}>{priority.icon}</span>
                {priority.label}
              </button>
            ))}
          </div>
        </div>

        {/* Complexity */}
        <div className="detail-section">
          <div className="detail-section-title">Complexity</div>
          <div className="complexity-select">
            {COMPLEXITIES.map(complexity => (
              <button
                key={complexity.value}
                className={`complexity-option ${item.complexity === complexity.value ? 'selected' : ''}`}
                onClick={() => handleComplexityChange(complexity.value)}
                title={complexity.description}
                style={{
                  '--complexity-color': complexity.color,
                  borderColor: item.complexity === complexity.value ? complexity.color : undefined,
                  background: item.complexity === complexity.value ? complexity.color : undefined
                }}
              >
                {complexity.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tags - only for tasks */}
        {isTask && (
          <div className="detail-section">
            <div className="detail-section-title">Tags</div>
            <div className="tags-container" style={{ marginBottom: '8px' }}>
              {itemTags.map(tag => (
                <span key={tag.id} className="tag tag-removable" onClick={() => handleRemoveTag(tag.id)}>
                  <span className="tag-dot" style={{ background: tag.color }} />
                  {tag.name}
                  <span className="tag-remove"><XIcon /></span>
                </span>
              ))}
              {itemTags.length === 0 && (
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No tags</span>
              )}
            </div>

            <div className="dropdown" style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowTagDropdown(!showTagDropdown)}
              >
                <PlusIcon />
                Add Tag
              </button>

              {showTagDropdown && (
                <>
                  <div
                    className="dropdown-menu"
                    style={{ left: 0, right: 'auto', maxHeight: '250px', overflow: 'auto' }}
                  >
                    {/* Existing tags */}
                    {availableTags.length > 0 && (
                      <>
                        {availableTags.map(tag => (
                          <div
                            key={tag.id}
                            className="dropdown-item"
                            onClick={() => handleAddTag(tag.id)}
                          >
                            <span className="tag-dot" style={{ background: tag.color }} />
                            {tag.name}
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid var(--border-color)', margin: '4px 0' }} />
                      </>
                    )}

                    {/* Create new tag */}
                    <div style={{ padding: '8px 12px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Create new tag
                      </div>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Tag name"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                        style={{ marginBottom: '8px', padding: '6px 8px', fontSize: '13px' }}
                      />
                      <div className="color-picker" style={{ marginBottom: '8px' }}>
                        {TAG_COLORS.map(color => (
                          <div
                            key={color}
                            className={`color-swatch ${newTagColor === color ? 'selected' : ''}`}
                            style={{ background: color }}
                            onClick={() => setNewTagColor(color)}
                          />
                        ))}
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleCreateTag}
                        disabled={!newTagName.trim()}
                        style={{ width: '100%' }}
                      >
                        Create Tag
                      </button>
                    </div>
                  </div>

                  {/* Backdrop */}
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                    onClick={() => setShowTagDropdown(false)}
                  />
                </>
              )}
            </div>
          </div>
        )}


        {/* Description */}
        <div className="detail-section">
          <div className="detail-section-title">Description</div>
          <MarkdownEditor
            value={item.description || ''}
            onChange={handleDescriptionChange}
            placeholder="Add a description... (supports Markdown)"
          />
        </div>

        {/* Attachments */}
        <div className="detail-section">
          <div className="detail-section-title">Attachments</div>

          {/* Attachment list */}
          {(item.attachments || []).length > 0 && (
            <div className="attachments-list">
              {item.attachments.map(attachment => (
                <div key={attachment.id} className="attachment-item">
                  {isImageFile(attachment.mimeType) ? (
                    <a
                      href={getAttachmentUrl(attachment)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-preview"
                    >
                      <img
                        src={getAttachmentUrl(attachment)}
                        alt={attachment.filename}
                        className="attachment-thumbnail"
                      />
                    </a>
                  ) : (
                    <div className="attachment-file-icon">
                      <FileIcon />
                    </div>
                  )}
                  <div className="attachment-info">
                    <a
                      href={getAttachmentUrl(attachment)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment-filename"
                    >
                      {attachment.filename}
                    </a>
                    <span className="attachment-size">{formatFileSize(attachment.size)}</span>
                  </div>
                  <div className="attachment-actions">
                    <button
                      className="btn btn-icon btn-ghost btn-sm"
                      onClick={() => handleCopyPath(attachment)}
                      title="Copy file path"
                    >
                      <CopyIcon />
                    </button>
                    <a
                      href={getAttachmentUrl(attachment)}
                      download={attachment.filename}
                      className="btn btn-icon btn-ghost btn-sm"
                      title="Download"
                    >
                      <DownloadIcon />
                    </a>
                    <button
                      className="btn btn-icon btn-ghost btn-sm"
                      onClick={() => handleDeleteAttachment(attachment.id)}
                      title="Delete"
                    >
                      <XIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <div className="attachment-upload">
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.markdown,.jpg,.jpeg,.png,.gif,.webp,.svg"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <>Uploading...</>
              ) : (
                <>
                  <PaperclipIcon />
                  Add Attachment
                </>
              )}
            </button>
            <span className="attachment-hint">
              Images, text, or markdown files (max 10MB)
            </span>
          </div>
        </div>

        {/* Category - only for tasks */}
        {isTask && item.categoryId && data?.categories?.[item.categoryId] && (
          <div className="detail-section">
            <div className="detail-section-title">Category</div>
            <div style={{ fontSize: '14px' }}>
              {data.categories[item.categoryId].name}
            </div>
          </div>
        )}

        {/* Feature Category - for features */}
        {selectedItemType === 'feature' && item.categoryId && data?.featureCategories?.[item.categoryId] && (
          <div className="detail-section">
            <div className="detail-section-title">Category</div>
            <div style={{ fontSize: '14px' }}>
              {data.featureCategories[item.categoryId].name}
            </div>
          </div>
        )}

        {/* Bug Category - for bugs */}
        {selectedItemType === 'bug' && item.categoryId && data?.bugCategories?.[item.categoryId] && (
          <div className="detail-section">
            <div className="detail-section-title">Category</div>
            <div style={{ fontSize: '14px' }}>
              {data.bugCategories[item.categoryId].name}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="detail-section">
          <div className="detail-section-title">Details</div>
          <div className="detail-meta">
            <div className="detail-meta-row">
              <span className="detail-meta-label">Created</span>
              <span className="detail-meta-value">{formatDateTime(item.createdAt)}</span>
            </div>
            {item.finishedAt && (
              <div className="detail-meta-row">
                <span className="detail-meta-label">Completed</span>
                <span className="detail-meta-value">{formatDateTime(item.finishedAt)}</span>
              </div>
            )}
            <div className="detail-meta-row">
              <span className="detail-meta-label">ID</span>
              <span className="detail-meta-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                {item.id}
              </span>
            </div>
          </div>
        </div>
      </div>
    </aside>
    </div>
  );
}

export default memo(DetailPanel);
