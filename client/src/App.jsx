import { TaskProvider, useTaskData, useUIState } from './context/TaskProvider';
import { ToastProvider } from './context/ToastContext';
import { ProjectProvider, useProjects } from './context/ProjectProvider';
import Sidebar from './components/layout/Sidebar';
import MainPanel from './components/layout/MainPanel';
import DetailPanel from './components/layout/DetailPanel';

function TaskProviderWithProject({ children }) {
  const { activeProjectId, loading: projectsLoading } = useProjects();

  // Don't render TaskProvider until we have an active project
  if (projectsLoading || !activeProjectId) {
    return (
      <div className="loading">
        Loading projects...
      </div>
    );
  }

  // Key the TaskProvider by activeProjectId to force remount when switching projects
  // This triggers a fresh data load automatically
  return (
    <TaskProvider key={activeProjectId}>
      {children}
    </TaskProvider>
  );
}

function AppContent() {
  const { loading, error } = useTaskData();
  const { selectedItemId } = useUIState();

  if (loading) {
    return (
      <div className="loading">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading" style={{ color: 'var(--danger)' }}>
        Error: {error}
        <button
          className="btn btn-primary"
          style={{ marginTop: '16px' }}
          onClick={() => window.location.reload()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <MainPanel />
      {selectedItemId && <DetailPanel />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <ProjectProvider>
        <TaskProviderWithProject>
          <AppContent />
        </TaskProviderWithProject>
      </ProjectProvider>
    </ToastProvider>
  );
}

export default App;
