import { TaskProvider, useTaskData, useUIState } from './context/TaskProvider';
import { ToastProvider } from './context/ToastContext';
import Sidebar from './components/layout/Sidebar';
import MainPanel from './components/layout/MainPanel';
import DetailPanel from './components/layout/DetailPanel';

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
      <TaskProvider>
        <AppContent />
      </TaskProvider>
    </ToastProvider>
  );
}

export default App;
