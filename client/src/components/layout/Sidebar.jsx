import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { useTaskData, useUIState, useTaskActions, SYSTEM_SECTIONS } from '../../context/TaskProvider';
import ProjectSelector from '../projects/ProjectSelector';
import NewProjectModal from '../projects/NewProjectModal';

// Trash icon for delete button
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

// Edit icon for edit button
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// Section icons mapping
const SECTION_ICONS = {
  layers: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  bug: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  ),
  folder: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
    </svg>
  ),
  flag: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
    </svg>
  ),
  star: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  rocket: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
    </svg>
  ),
  target: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  ),
  calendar: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  bookmark: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  ),
  lightning: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  'check-circle': () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  archive: () => (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <path d="M10 12h4" />
    </svg>
  )
};

// Get icon component for section
const getSectionIcon = (iconName) => {
  const IconComponent = SECTION_ICONS[iconName] || SECTION_ICONS.folder;
  return <IconComponent />;
};

// Plus icon for adding sections
const PlusIcon = () => (
  <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ChevronIcon = ({ expanded }) => (
  <svg
    className={`nav-item-icon ${expanded ? '' : 'collapsed'}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
  >
    <path d="M9 18l6-6-6-6" />
  </svg>
);

const StatusDot = ({ status }) => {
  const colors = {
    'open': '#3b82f6',
    'in-progress': '#f59e0b',
    'done': '#22c55e'
  };
  return (
    <span style={{
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: colors[status] || colors.open,
      flexShrink: 0
    }} />
  );
};

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
  </svg>
);

const MonitorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

function Sidebar() {
  const { data } = useTaskData();
  const { activeView, activeSectionId, activeItemId, setActiveSection, setActiveItem, setActiveView, theme, setTheme } = useUIState();
  const { exportData, importData, createSection, updateSection, deleteSection } = useTaskActions();
  const [inProgressExpanded, setInProgressExpanded] = useState(true);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [showNewSectionInput, setShowNewSectionInput] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState('');
  const fileInputRef = useRef(null);
  const newSectionInputRef = useRef(null);
  const editSectionInputRef = useRef(null);

  if (!data) return null;

  // Get sections in order
  const sections = (data.sectionOrder || [])
    .map(id => data.sections?.[id])
    .filter(Boolean);

  // Get in-progress items from all sections
  const allItems = Object.values(data.items || {});
  const inProgressItems = allItems.filter(item => item.status === 'in-progress');

  // Get item count for a section
  const getSectionItemCount = (sectionId) => {
    const section = data.sections?.[sectionId];
    if (!section) return 0;
    // Count items in section (both in categories and uncategorized)
    const itemsInSection = allItems.filter(item => item.sectionId === sectionId);
    return itemsInSection.length;
  };

  const handleExport = () => {
    exportData();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      const merge = confirm('Merge with existing data? Click Cancel to replace all data.');
      await importData(jsonData, merge);
      alert('Import successful!');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    // Reset input
    e.target.value = '';
  };

  const handleNewProject = () => {
    setEditingProject(null);
    setShowProjectModal(true);
  };

  const handleEditProject = (project) => {
    setEditingProject(project);
    setShowProjectModal(true);
  };

  const handleAddSection = () => {
    setShowNewSectionInput(true);
    setNewSectionName('');
    setTimeout(() => newSectionInputRef.current?.focus(), 50);
  };

  const handleCreateSection = async () => {
    if (!newSectionName.trim()) {
      setShowNewSectionInput(false);
      return;
    }
    try {
      await createSection(newSectionName.trim());
      setShowNewSectionInput(false);
      setNewSectionName('');
    } catch (err) {
      alert('Failed to create section: ' + err.message);
    }
  };

  const handleNewSectionKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleCreateSection();
    } else if (e.key === 'Escape') {
      setShowNewSectionInput(false);
    }
  };

  // Section edit handlers
  const handleStartEditSection = (section) => {
    setEditingSectionId(section.id);
    setEditingSectionName(section.name);
    setTimeout(() => editSectionInputRef.current?.focus(), 50);
  };

  const handleSaveEditSection = async () => {
    if (!editingSectionId) return;

    const trimmedName = editingSectionName.trim();
    if (trimmedName && trimmedName !== data.sections?.[editingSectionId]?.name) {
      try {
        await updateSection(editingSectionId, { name: trimmedName });
      } catch (err) {
        alert('Failed to update section: ' + err.message);
      }
    }
    setEditingSectionId(null);
    setEditingSectionName('');
  };

  const handleEditSectionKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveEditSection();
    } else if (e.key === 'Escape') {
      setEditingSectionId(null);
      setEditingSectionName('');
    }
  };

  const handleDeleteSection = async (section) => {
    // Prevent deleting system sections
    if (section.isSystem) {
      alert('Cannot delete system sections (Features/Bugs)');
      return;
    }

    const itemCount = getSectionItemCount(section.id);
    const confirmMsg = itemCount > 0
      ? `Delete "${section.name}"? This will also delete ${itemCount} item(s) in this section.`
      : `Delete "${section.name}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      await deleteSection(section.id);
      // If we deleted the active section, switch to Features
      if (activeSectionId === section.id) {
        setActiveSection(SYSTEM_SECTIONS.FEATURES);
      }
    } catch (err) {
      alert('Failed to delete section: ' + err.message);
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <ProjectSelector
          onNewProject={handleNewProject}
          onEditProject={handleEditProject}
        />
      </div>

      <div className="sidebar-content">
        {/* Dynamic Sections */}
        <div className="sidebar-section">
          {sections.map(section => {
            const isEditing = editingSectionId === section.id;
            const isActive = activeView === 'section' && activeSectionId === section.id;
            const itemCount = getSectionItemCount(section.id);

            if (isEditing) {
              return (
                <div key={section.id} className="nav-item" style={{ padding: '4px 12px' }}>
                  {getSectionIcon(section.icon)}
                  <input
                    ref={editSectionInputRef}
                    type="text"
                    className="input input-sm"
                    value={editingSectionName}
                    onChange={(e) => setEditingSectionName(e.target.value)}
                    onKeyDown={handleEditSectionKeyDown}
                    onBlur={handleSaveEditSection}
                    style={{ fontSize: '13px', padding: '2px 6px', flex: 1 }}
                  />
                </div>
              );
            }

            return (
              <div
                key={section.id}
                className={`nav-item section-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {getSectionIcon(section.icon)}
                <span className="nav-item-label">{section.name}</span>
                {itemCount !== undefined && <span className="nav-item-count">{itemCount}</span>}
                <div className="section-actions">
                  <button
                    className="btn btn-icon btn-ghost btn-xs section-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEditSection(section);
                    }}
                    title="Edit section"
                  >
                    <EditIcon />
                  </button>
                  {!section.isSystem && (
                    <button
                      className="btn btn-icon btn-ghost btn-xs section-action-btn section-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSection(section);
                      }}
                      title="Delete section"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* New Section Input */}
          {showNewSectionInput && (
            <div className="new-section-input-wrapper" style={{ padding: '4px 12px' }}>
              <input
                ref={newSectionInputRef}
                type="text"
                className="input input-sm"
                placeholder="Section name..."
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={handleNewSectionKeyDown}
                onBlur={handleCreateSection}
                style={{ fontSize: '13px', padding: '4px 8px' }}
              />
            </div>
          )}

          {/* Add Section Button */}
          <NavItem
            icon={<PlusIcon />}
            label="Add Section"
            onClick={handleAddSection}
            isAddButton
          />
        </div>

        {/* In Progress Section */}
        <div className="sidebar-section">
          <div
            className="sidebar-section-title"
            onClick={() => setInProgressExpanded(!inProgressExpanded)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ChevronIcon expanded={inProgressExpanded} />
            <span>In Progress</span>
          </div>
          {inProgressExpanded && (
            <div>
              {inProgressItems.map(item => {
                const taskCount = item.taskOrder?.length || 0;
                const section = data.sections?.[item.sectionId];
                const sectionName = section?.name || 'Unknown';
                return (
                  <div
                    key={item.id}
                    className={`nav-item in-progress-item ${activeView === 'item' && activeItemId === item.id ? 'active' : ''}`}
                    onClick={() => setActiveItem(item.id)}
                    style={{ paddingLeft: '28px' }}
                  >
                    <span
                      className="section-indicator"
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: section?.color || '#6b7280',
                        flexShrink: 0
                      }}
                      title={sectionName}
                    />
                    <span className="nav-item-label">{item.title}</span>
                    <span className="in-progress-section-label">{sectionName}</span>
                  </div>
                );
              })}
              {inProgressItems.length === 0 && (
                <div style={{ padding: '8px 12px 8px 28px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No items in progress
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer with theme toggle and import/export */}
      <div className="sidebar-footer">
        {/* Theme Toggle */}
        <div className="sidebar-footer-row">
          <span className="sidebar-footer-label">Theme</span>
          <div className="theme-toggle">
            <button
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              title="Light"
            >
              <SunIcon />
            </button>
            <button
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              title="Dark"
            >
              <MoonIcon />
            </button>
            <button
              className={`theme-option ${theme === 'system' ? 'active' : ''}`}
              onClick={() => setTheme('system')}
              title="System"
            >
              <MonitorIcon />
            </button>
          </div>
        </div>

        {/* Import/Export */}
        <div className="sidebar-footer-row">
          <span className="sidebar-footer-label">Data</span>
          <div className="import-export-buttons">
            <button className="btn btn-secondary btn-sm" onClick={handleExport} title="Export data">
              <DownloadIcon />
              Export
            </button>
            <button className="btn btn-secondary btn-sm" onClick={handleImportClick} title="Import data">
              <UploadIcon />
              Import
            </button>
          </div>
        </div>

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Project Modal */}
      <NewProjectModal
        isOpen={showProjectModal}
        onClose={() => {
          setShowProjectModal(false);
          setEditingProject(null);
        }}
        editProject={editingProject}
      />
    </aside>
  );
}

// Memoized NavItem component
const NavItem = memo(function NavItem({ icon, label, count, active, onClick, indent, status, sectionColor, isAddButton }) {
  const style = {};
  if (indent) style.paddingLeft = '28px';

  return (
    <div
      className={`nav-item ${active ? 'active' : ''} ${isAddButton ? 'nav-item-add' : ''}`}
      onClick={onClick}
      style={style}
    >
      {sectionColor && !icon && (
        <span
          className="section-color-dot"
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: sectionColor,
            flexShrink: 0
          }}
        />
      )}
      {icon && icon}
      {status && <StatusDot status={status} />}
      <span className="nav-item-label">{label}</span>
      {count !== undefined && <span className="nav-item-count">{count}</span>}
    </div>
  );
});

export default memo(Sidebar);
