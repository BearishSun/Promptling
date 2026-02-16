import { memo, useState, useEffect, useRef } from 'react';
import { useProjects } from '../../context/ProjectProvider';

const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
];

function NewProjectModal({ isOpen, onClose, editProject }) {
  const { createProject, updateProject, deleteProject, switchProject } = useProjects();
  const [name, setName] = useState('');
  const [workingDir, setWorkingDir] = useState('');
  const [color, setColor] = useState(DEFAULT_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef(null);

  const isEdit = !!editProject;

  useEffect(() => {
    if (isOpen) {
      if (editProject) {
        setName(editProject.name || '');
        setWorkingDir(editProject.workingDir || '');
        setColor(editProject.color || DEFAULT_COLORS[0]);
      } else {
        setName('');
        setWorkingDir('');
        setColor(DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)]);
      }
      // Focus input after a short delay
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, editProject]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setSaving(true);
      if (isEdit) {
        const updates = { name: name.trim(), color };
        const trimmedDir = workingDir.trim();
        updates.workingDir = trimmedDir || ''; // empty string tells server to clear
        await updateProject(editProject.id, updates);
      } else {
        const project = await createProject(name.trim(), color, workingDir.trim());
        // Switch to the new project - TaskProvider will remount due to key change
        await switchProject(project.id);
      }
      onClose();
    } catch (err) {
      alert('Failed to save project: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editProject) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${editProject.name}"?\n\nThis will permanently delete all features, bugs, tasks, and attachments in this project.`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      await deleteProject(editProject.id);
      onClose();
    } catch (err) {
      alert('Failed to delete project: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEdit ? 'Edit Project' : 'New Project'}</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="project-name">Project Name</label>
              <input
                ref={inputRef}
                id="project-name"
                type="text"
                className="input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My Project"
                required
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-working-dir">Working Directory</label>
              <input
                id="project-working-dir"
                type="text"
                className="input"
                value={workingDir}
                onChange={e => setWorkingDir(e.target.value)}
                placeholder="D:\Projects\MyProject"
                maxLength={500}
              />
            </div>

            <div className="form-group">
              <label>Color</label>
              <div className="color-picker">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    className={`color-option ${color === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="modal-footer">
            {isEdit && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={deleting || saving}
              >
                {deleting ? 'Deleting...' : 'Delete Project'}
              </button>
            )}
            <div className="modal-footer-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={saving || deleting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!name.trim() || saving || deleting}
              >
                {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default memo(NewProjectModal);
