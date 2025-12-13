import { memo, useState, useRef, useEffect } from 'react';
import { useProjects } from '../../context/ProjectProvider';

const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SettingsIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

function ProjectSelector({ onNewProject, onEditProject }) {
  const { projects, activeProjectId, activeProject, switchProject, loading } = useProjects();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProjectSelect = async (projectId) => {
    if (projectId !== activeProjectId) {
      await switchProject(projectId);
      // TaskProvider will remount automatically due to key={activeProjectId}
    }
    setIsOpen(false);
  };

  if (loading) {
    return (
      <div className="project-selector">
        <div className="project-selector-button">
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="project-selector" ref={dropdownRef}>
      <button
        className="project-selector-button"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span
          className="project-color-dot"
          style={{ backgroundColor: activeProject?.color || '#3b82f6' }}
        />
        <span className="project-name">{activeProject?.name || 'Select Project'}</span>
        <ChevronDown />
      </button>

      {isOpen && (
        <div className="project-dropdown">
          <div className="project-dropdown-header">
            <span>Projects</span>
            <button
              className="project-dropdown-settings"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                onEditProject?.(activeProject);
              }}
              title="Project settings"
            >
              <SettingsIcon />
            </button>
          </div>

          <div className="project-dropdown-list">
            {projects.map(project => (
              <button
                key={project.id}
                className={`project-dropdown-item ${project.id === activeProjectId ? 'active' : ''}`}
                onClick={() => handleProjectSelect(project.id)}
              >
                <span
                  className="project-color-dot"
                  style={{ backgroundColor: project.color || '#3b82f6' }}
                />
                <span className="project-item-name">{project.name}</span>
                {project.id === activeProjectId && <CheckIcon />}
              </button>
            ))}
          </div>

          <div className="project-dropdown-footer">
            <button
              className="project-dropdown-new"
              onClick={() => {
                setIsOpen(false);
                onNewProject?.();
              }}
            >
              <PlusIcon />
              <span>New Project</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ProjectSelector);
