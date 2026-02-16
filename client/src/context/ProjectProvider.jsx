import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { setActiveProjectId as setApiActiveProjectId } from '../services/api';

const ProjectContext = createContext(null);

// Helper: check response status, throw with server error message on failure
async function handleResponse(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// API functions for projects
const projectsApi = {
  getAll: () => fetch('/api/projects').then(handleResponse),
  create: (data) => fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(handleResponse),
  update: (id, data) => fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(handleResponse),
  delete: (id) => fetch(`/api/projects/${id}`, {
    method: 'DELETE'
  }).then(handleResponse),
  setActive: (projectId) => fetch('/api/projects/active', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  }).then(handleResponse),
  reorder: (order) => fetch('/api/projects/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order })
  }).then(handleResponse)
};

export function ProjectProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectsApi.getAll();
      setProjects(data.projects || []);
      setActiveProjectId(data.activeProjectId);
      // Update API interceptor with active project
      if (data.activeProjectId) {
        setApiActiveProjectId(data.activeProjectId);
      }
    } catch (err) {
      setError(err.message || 'Failed to load projects');
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const createProject = useCallback(async (name, color, workingDir) => {
    try {
      const data = { name, color };
      if (workingDir) data.workingDir = workingDir;
      const project = await projectsApi.create(data);
      setProjects(prev => [...prev, project]);
      return project;
    } catch (err) {
      console.error('Failed to create project:', err);
      throw err;
    }
  }, []);

  const updateProject = useCallback(async (id, updates) => {
    try {
      const updated = await projectsApi.update(id, updates);
      setProjects(prev => prev.map(p => p.id === id ? updated : p));
      return updated;
    } catch (err) {
      console.error('Failed to update project:', err);
      throw err;
    }
  }, []);

  const deleteProject = useCallback(async (id) => {
    try {
      const result = await projectsApi.delete(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (result.newActiveProjectId) {
        setActiveProjectId(result.newActiveProjectId);
      }
      return result;
    } catch (err) {
      console.error('Failed to delete project:', err);
      throw err;
    }
  }, []);

  const switchProject = useCallback(async (projectId) => {
    try {
      await projectsApi.setActive(projectId);
      setActiveProjectId(projectId);
      // Update API interceptor with new active project
      setApiActiveProjectId(projectId);
    } catch (err) {
      console.error('Failed to switch project:', err);
      throw err;
    }
  }, []);

  const reorderProjects = useCallback(async (newOrder) => {
    try {
      // Optimistic update
      setProjects(prev => {
        const projectMap = Object.fromEntries(prev.map(p => [p.id, p]));
        return newOrder.map(id => projectMap[id]).filter(Boolean);
      });
      await projectsApi.reorder(newOrder);
    } catch (err) {
      console.error('Failed to reorder projects:', err);
      // Reload on error
      await loadProjects();
    }
  }, []);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || null;
  }, [projects, activeProjectId]);

  const value = useMemo(() => ({
    projects,
    activeProjectId,
    activeProject,
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
    switchProject,
    reorderProjects,
    reload: loadProjects
  }), [
    projects,
    activeProjectId,
    activeProject,
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
    switchProject,
    reorderProjects
  ]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within ProjectProvider');
  }
  return context;
}

export function useActiveProject() {
  const { activeProject, activeProjectId } = useProjects();
  return { activeProject, activeProjectId };
}

export default ProjectProvider;
