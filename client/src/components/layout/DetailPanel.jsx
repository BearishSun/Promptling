import { memo, useState, useCallback, useEffect, useRef } from 'react';
import { useTaskData, useTaskActions, useUIState, SYSTEM_SECTIONS } from '../../context/TaskProvider';
import MarkdownEditor from '../detail/MarkdownEditor';
import MarkdownViewer from '../detail/MarkdownViewer';
import { formatDateTime } from '../../utils/dateFormat';
import tasksApi, { TASK_STATUSES, COMPLEXITIES } from '../../services/api';

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

const HistoryIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12,6 12,12 16,14" />
  </svg>
);

const ChevronIcon = ({ expanded }) => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
  >
    <polyline points="9,18 15,12 9,6" />
  </svg>
);

const PlanIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14,2 14,8 20,8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

const PromoteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19V5M5 12l7-7 7 7" />
  </svg>
);

// Default tag colors
const TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

// Get item type label
const getItemTypeLabel = (type, item, data) => {
  switch (type) {
    case 'feature': return 'Feature';
    case 'bug': return 'Bug';
    case 'task': return 'Task';
    case 'item': {
      // For unified items, determine label from section
      if (item?.sectionId) {
        const section = data?.sections?.[item.sectionId];
        if (section) {
          // Return singular form of section name
          return section.name?.replace(/s$/, '') || 'Item';
        }
      }
      return 'Item';
    }
    default: return 'Item';
  }
};

function DetailPanel() {
  const { data } = useTaskData();
  const { updateTask, deleteTask, updateItem, deleteItem, createTag, addTagToTask, removeTagFromTask, uploadAttachment, deleteAttachment, moveItemToCategory, promoteTask } = useTaskActions();
  const { selectedItemType, selectedItemId, clearSelection } = useUIState();
  const [editTitle, setEditTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [isUploading, setIsUploading] = useState(false);
  const [showPromptHistory, setShowPromptHistory] = useState(false);
  const [promptHistory, setPromptHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [planVersions, setPlanVersions] = useState([]);
  const [markdownViewer, setMarkdownViewer] = useState(null); // { title, content, versions?, selectedVersion? }
  const fileInputRef = useRef(null);

  // Get the selected item based on type
  const item = (() => {
    if (!selectedItemId || !selectedItemType) return null;
    switch (selectedItemType) {
      case 'task': return data?.tasks?.[selectedItemId];
      case 'item': return data?.items?.[selectedItemId];
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
      if (selectedItemType === 'task') {
        updateTask(selectedItemId, { title: editTitle.trim() });
      } else if (selectedItemType === 'item') {
        updateItem(selectedItemId, { title: editTitle.trim() });
      }
    }
    setIsEditingTitle(false);
  }, [editTitle, item?.title, selectedItemType, selectedItemId, updateTask, updateItem]);

  const handleDescriptionChange = useCallback((description) => {
    if (selectedItemType === 'task') {
      updateTask(selectedItemId, { description });
    } else if (selectedItemType === 'item') {
      updateItem(selectedItemId, { description });
    }
  }, [selectedItemType, selectedItemId, updateTask, updateItem]);

  const handleDelete = useCallback(async () => {
    const label = getItemTypeLabel(selectedItemType, item, data);
    if (!confirm(`Delete this ${label.toLowerCase()}?`)) return;

    if (selectedItemType === 'task') {
      await deleteTask(selectedItemId);
    } else if (selectedItemType === 'item') {
      await deleteItem(selectedItemId);
    }
    clearSelection();
  }, [selectedItemType, selectedItemId, item, data, deleteTask, deleteItem, clearSelection]);

  const handleStatusChange = useCallback((newStatus) => {
    const updates = { status: newStatus };
    // Auto-set finishedAt when marking as done
    if (newStatus === 'done' && !item?.finishedAt) {
      updates.finishedAt = new Date().toISOString();
    } else if (newStatus !== 'done' && item?.finishedAt) {
      updates.finishedAt = null;
    }

    if (selectedItemType === 'task') {
      updateTask(selectedItemId, updates);
    } else if (selectedItemType === 'item') {
      updateItem(selectedItemId, updates);
    }
  }, [item?.finishedAt, selectedItemType, selectedItemId, updateTask, updateItem]);

  const handleComplexityChange = useCallback((newComplexity) => {
    if (selectedItemType === 'task') {
      updateTask(selectedItemId, { complexity: newComplexity });
    } else if (selectedItemType === 'item') {
      updateItem(selectedItemId, { complexity: newComplexity });
    }
  }, [selectedItemType, selectedItemId, updateTask, updateItem]);

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

  // Fetch prompt history when toggled open
  const handleTogglePromptHistory = useCallback(async () => {
    if (!showPromptHistory) {
      setIsLoadingHistory(true);
      try {
        const response = await tasksApi.getPromptHistory(selectedItemType, selectedItemId);
        setPromptHistory(response.history || []);
      } catch (error) {
        console.error('Failed to fetch prompt history:', error);
        setPromptHistory([]);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    setShowPromptHistory(!showPromptHistory);
  }, [showPromptHistory, selectedItemType, selectedItemId]);

  const handleClearPromptHistory = useCallback(async () => {
    if (!confirm('Clear all prompt history for this item?')) return;
    try {
      await tasksApi.clearPromptHistory(selectedItemType, selectedItemId);
      setPromptHistory([]);
    } catch (error) {
      console.error('Failed to clear prompt history:', error);
      alert('Failed to clear prompt history');
    }
  }, [selectedItemType, selectedItemId]);

  // Reset prompt history state when item changes
  useEffect(() => {
    setShowPromptHistory(false);
    setPromptHistory([]);
  }, [selectedItemId]);

  // Fetch plan versions when item changes
  useEffect(() => {
    const fetchPlanVersions = async () => {
      if (!selectedItemType || !selectedItemId) {
        setPlanVersions([]);
        return;
      }
      try {
        const response = await tasksApi.getPlanVersions(selectedItemType, selectedItemId);
        setPlanVersions(response.versions || []);
      } catch (error) {
        // No plan exists - that's fine
        setPlanVersions([]);
      }
    };
    fetchPlanVersions();
  }, [selectedItemType, selectedItemId]);

  // Handle opening a plan
  const handleOpenPlan = useCallback(async (version) => {
    try {
      const response = await tasksApi.getPlan(selectedItemType, selectedItemId, version);
      setMarkdownViewer({
        title: `Implementation Plan${version ? ` (v${version})` : ''}`,
        content: response.content,
        versions: planVersions,
        selectedVersion: version || planVersions[planVersions.length - 1]?.version,
        type: 'plan'
      });
    } catch (error) {
      console.error('Failed to fetch plan:', error);
    }
  }, [selectedItemType, selectedItemId, planVersions]);

  // Handle opening a markdown attachment
  const handleOpenMarkdownAttachment = useCallback(async (attachment) => {
    try {
      const storedPath = attachment.storedPath || attachment.storedName;
      const response = await fetch(tasksApi.getAttachmentUrl(storedPath));
      const content = await response.text();
      setMarkdownViewer({
        title: attachment.filename,
        content,
        type: 'attachment'
      });
    } catch (error) {
      console.error('Failed to fetch attachment:', error);
    }
  }, []);

  // Handle changing plan version in viewer
  const handlePlanVersionChange = useCallback(async (version) => {
    try {
      const response = await tasksApi.getPlan(selectedItemType, selectedItemId, version);
      setMarkdownViewer(prev => ({
        ...prev,
        content: response.content,
        selectedVersion: version
      }));
    } catch (error) {
      console.error('Failed to fetch plan version:', error);
    }
  }, [selectedItemType, selectedItemId]);

  const isMarkdownFile = useCallback((filename) => {
    return filename?.toLowerCase().endsWith('.md') || filename?.toLowerCase().endsWith('.markdown');
  }, []);

  const handleMoveToSection = useCallback(async (targetSectionId) => {
    if (targetSectionId === item?.sectionId) return;
    await moveItemToCategory(selectedItemId, null, targetSectionId);
  }, [item?.sectionId, selectedItemId, moveItemToCategory]);

  const handlePromoteTask = useCallback(async (targetSectionId) => {
    if (selectedItemType !== 'task') return;
    try {
      await promoteTask(selectedItemId, targetSectionId);
      clearSelection();
    } catch (error) {
      console.error('Failed to promote task:', error);
      alert('Failed to promote task');
    }
  }, [selectedItemType, selectedItemId, promoteTask, clearSelection]);

  if (!item) {
    return null;
  }

  const currentStatus = item.status || 'open';
  const typeLabel = getItemTypeLabel(selectedItemType, item, data);
  const isTask = selectedItemType === 'task';
  const isFeatureOrBug = selectedItemType === 'feature' || selectedItemType === 'bug' || selectedItemType === 'item';

  // Count tasks for features/bugs/items
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
        {/* Description */}
        <div className="detail-section">
          <div className="detail-section-title">Description</div>
          <MarkdownEditor
            key={selectedItemId}
            value={item.description || ''}
            onChange={handleDescriptionChange}
            placeholder="Add a description... (supports Markdown)"
          />
        </div>

        {/* Section selector - only for items */}
        {selectedItemType === 'item' && (
          <div className="detail-section">
            <div className="detail-section-title">Section</div>
            <select
              className="form-select"
              value={item.sectionId || ''}
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

        {/* Promote task to item - only for tasks */}
        {isTask && (
          <div className="detail-section">
            <div className="detail-section-title">Promote to Item</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                className="form-select"
                style={{ flex: 1 }}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handlePromoteTask(e.target.value);
                    e.target.value = '';
                  }
                }}
              >
                <option value="" disabled>Select section...</option>
                {Object.values(data.sections || {}).map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
              <PromoteIcon />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', marginBottom: 0 }}>
              Convert this task into a standalone feature or bug
            </p>
          </div>
        )}

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

        {/* Complexity */}
        <div className="detail-section">
          <div className="detail-section-title">Complexity</div>
          <div className="complexity-select">
            {COMPLEXITIES.map(complexity => (
              <button
                key={complexity.value}
                className={`complexity-option ${item.complexity === complexity.value ? 'selected' : ''}`}
                onClick={() => handleComplexityChange(complexity.value)}
                title={complexity.label}
                style={{
                  '--complexity-color': complexity.color,
                  borderColor: item.complexity === complexity.value ? complexity.color : undefined,
                  background: item.complexity === complexity.value ? complexity.color : undefined
                }}
              >
                <span className="complexity-icon" style={{ color: item.complexity === complexity.value ? 'white' : complexity.color }}>{complexity.icon}</span>
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

        {/* Plans */}
        {planVersions.length > 0 && (
          <div className="detail-section">
            <div className="detail-section-title">Implementation Plan</div>
            <div className="plans-list">
              {planVersions.map((planVersion, index) => (
                <button
                  key={planVersion.version}
                  className="plan-item"
                  onClick={() => handleOpenPlan(planVersion.version)}
                >
                  <PlanIcon />
                  <span className="plan-name">
                    {index === planVersions.length - 1 ? 'Current Plan' : `Plan v${planVersion.version}`}
                  </span>
                  <span className="plan-meta">v{planVersion.version}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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
                  ) : isMarkdownFile(attachment.filename) ? (
                    <button
                      className="attachment-file-icon attachment-clickable"
                      onClick={() => handleOpenMarkdownAttachment(attachment)}
                    >
                      <PlanIcon />
                    </button>
                  ) : (
                    <div className="attachment-file-icon">
                      <FileIcon />
                    </div>
                  )}
                  <div className="attachment-info">
                    {isMarkdownFile(attachment.filename) ? (
                      <button
                        className="attachment-filename attachment-filename-btn"
                        onClick={() => handleOpenMarkdownAttachment(attachment)}
                      >
                        {attachment.filename}
                      </button>
                    ) : (
                      <a
                        href={getAttachmentUrl(attachment)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="attachment-filename"
                      >
                        {attachment.filename}
                      </a>
                    )}
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

        {/* Item Category - for unified items */}
        {selectedItemType === 'item' && item.categoryId && data?.itemCategories?.[item.categoryId] && (
          <div className="detail-section">
            <div className="detail-section-title">Category</div>
            <div style={{ fontSize: '14px' }}>
              {data.itemCategories[item.categoryId].name}
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

        {/* Prompt History (Claude Code Integration) */}
        <div className="detail-section">
          <button
            className="prompt-history-toggle"
            onClick={handleTogglePromptHistory}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'none',
              border: 'none',
              padding: '0',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              width: '100%',
            }}
          >
            <ChevronIcon expanded={showPromptHistory} />
            <HistoryIcon />
            Claude Prompt History
            {isLoadingHistory && <span style={{ marginLeft: 'auto', fontSize: '11px' }}>Loading...</span>}
          </button>

          {showPromptHistory && (
            <div className="prompt-history-content" style={{ marginTop: '12px' }}>
              {promptHistory.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
                  No prompt history yet. Use Claude Code with this item to see conversation history here.
                </p>
              ) : (
                <>
                  <div className="prompt-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {promptHistory.map((entry) => (
                      <div
                        key={entry.id}
                        className="prompt-history-entry"
                        style={{
                          padding: '10px 12px',
                          borderRadius: '6px',
                          background: entry.role === 'user' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                          borderLeft: `3px solid ${entry.role === 'user' ? 'var(--accent-color)' : '#22c55e'}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: entry.role === 'user' ? 'var(--accent-color)' : '#22c55e',
                            textTransform: 'uppercase',
                          }}>
                            {entry.role === 'user' ? 'User' : 'Claude'}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {formatDateTime(entry.timestamp)}
                          </span>
                        </div>
                        <p style={{
                          margin: 0,
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.5',
                        }}>
                          {entry.content}
                        </p>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleClearPromptHistory}
                    style={{ marginTop: '12px', color: 'var(--text-muted)' }}
                  >
                    <TrashIcon /> Clear History
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>

    {/* Markdown Viewer Modal */}
    {markdownViewer && (
      <MarkdownViewer
        title={markdownViewer.title}
        content={markdownViewer.content}
        onClose={() => setMarkdownViewer(null)}
        versionSelector={markdownViewer.type === 'plan' && markdownViewer.versions?.length > 1 ? (
          <select
            className="plan-version-select"
            value={markdownViewer.selectedVersion}
            onChange={(e) => handlePlanVersionChange(Number(e.target.value))}
          >
            {markdownViewer.versions.map((v, i) => (
              <option key={v.version} value={v.version}>
                {i === markdownViewer.versions.length - 1 ? `v${v.version} (Current)` : `v${v.version}`}
              </option>
            ))}
          </select>
        ) : null}
      />
    )}
    </div>
  );
}

export default memo(DetailPanel);
