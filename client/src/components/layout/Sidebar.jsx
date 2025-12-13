import { memo, useState, useRef } from 'react';
import { useTaskData, useUIState, useTaskActions } from '../../context/TaskProvider';

// Icons as simple SVG components
const FeaturesIcon = () => (
  <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const BugsIcon = () => (
  <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
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
  const { activeView, activeItemId, setActiveView, theme, setTheme } = useUIState();
  const { exportData, importData } = useTaskActions();
  const [featuresExpanded, setFeaturesExpanded] = useState(true);
  const fileInputRef = useRef(null);

  if (!data) return null;

  // Get in-progress features - include both categorized and uncategorized
  const allFeatureIds = [
    ...(data.globalFeatureOrder || []),
    ...Object.values(data.featureCategories || {}).flatMap(cat => cat.featureOrder || [])
  ];
  // Remove duplicates
  const uniqueFeatureIds = [...new Set(allFeatureIds)];

  const activeFeatures = uniqueFeatureIds
    .map(id => data.features[id])
    .filter(f => f && f.status === 'in-progress');

  const featureCount = activeFeatures.length;
  const bugCount = data.globalBugOrder?.length || 0;


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

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>TaskList</h1>
      </div>

      <div className="sidebar-content">
        {/* Global Views */}
        <div className="sidebar-section">
          <NavItem
            icon={<FeaturesIcon />}
            label="Features"
            count={Object.keys(data.features || {}).length}
            active={activeView === 'features'}
            onClick={() => setActiveView('features')}
          />
          <NavItem
            icon={<BugsIcon />}
            label="Bugs"
            count={bugCount}
            active={activeView === 'bugs'}
            onClick={() => setActiveView('bugs')}
          />
        </div>

        {/* Active Features Section */}
        <div className="sidebar-section">
          <div
            className="sidebar-section-title"
            onClick={() => setFeaturesExpanded(!featuresExpanded)}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ChevronIcon expanded={featuresExpanded} />
            <span>In Progress</span>
          </div>
          {featuresExpanded && (
            <div>
              {activeFeatures.map(feature => {
                const taskCount = feature.taskOrder?.length || 0;
                return (
                  <NavItem
                    key={feature.id}
                    label={feature.title}
                    count={taskCount}
                    active={activeView === 'feature' && activeItemId === feature.id}
                    onClick={() => setActiveView('feature', feature.id)}
                    indent
                    status={feature.status}
                  />
                );
              })}
              {featureCount === 0 && (
                <div style={{ padding: '8px 12px 8px 28px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  No features in progress
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
    </aside>
  );
}

// Memoized NavItem component
const NavItem = memo(function NavItem({ icon, label, count, active, onClick, indent, status }) {
  return (
    <div
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
      style={indent ? { paddingLeft: '28px' } : undefined}
    >
      {icon && icon}
      {status && <StatusDot status={status} />}
      <span className="nav-item-label">{label}</span>
      {count !== undefined && <span className="nav-item-count">{count}</span>}
    </div>
  );
});

export default memo(Sidebar);
