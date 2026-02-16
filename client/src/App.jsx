import { useMemo } from 'react';
import { TaskProvider, useTaskData, useUIState } from './context/TaskProvider';
import { ToastProvider } from './context/ToastContext';
import { ProjectProvider, useProjects } from './context/ProjectProvider';
import { TerminalProvider, useTerminals } from './context/TerminalProvider';
import Sidebar from './components/layout/Sidebar';
import MainPanel from './components/layout/MainPanel';
import DetailPanel from './components/layout/DetailPanel';
import TerminalColumn from './components/terminal/TerminalColumn';

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
  const { terminals } = useTerminals();
  const { activeProjectId } = useProjects();

  // Only show terminal column for terminals belonging to the active project
  const hasActiveTerminals = useMemo(() => {
    for (const t of terminals.values()) {
      if (t.projectId === activeProjectId) return true;
    }
    return false;
  }, [terminals, activeProjectId]);

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
    <div className={`app-layout${hasActiveTerminals ? ' has-terminals' : ''}${selectedItemId ? ' has-detail' : ''}`}>
      <Sidebar />
      <MainPanel />
      {selectedItemId && <DetailPanel />}
      {hasActiveTerminals && <TerminalColumn />}
    </div>
  );
}

function App() {
  return (
    <ToastProvider>
      <ProjectProvider>
        <TerminalProvider>
          <TaskProviderWithProject>
            <AppContent />
          </TaskProviderWithProject>
        </TerminalProvider>
      </ProjectProvider>
    </ToastProvider>
  );
}

export default App;
