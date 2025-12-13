import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Store to hold the active project ID
let activeProjectId = null;

// Function to set the active project ID (called by ProjectProvider)
export function setActiveProjectId(projectId) {
  activeProjectId = projectId;
}

// Add interceptor to include project ID in all requests
api.interceptors.request.use((config) => {
  if (activeProjectId) {
    config.headers['X-Project-ID'] = activeProjectId;
  }
  return config;
});

// System section IDs (must match server)
export const SYSTEM_SECTIONS = {
  FEATURES: 'sect-features',
  BUGS: 'sect-bugs'
};

export const tasksApi = {
  // Load all data
  getAll: () => api.get('/tasks').then(res => res.data),

  // Save all data
  saveAll: (data) => api.put('/tasks', data).then(res => res.data),

  // ============ UNIFIED SECTIONS API (v4) ============

  // Sections
  createSection: (data) => api.post('/tasks/section', data).then(res => res.data),
  updateSection: (id, data) => api.patch(`/tasks/section/${id}`, data).then(res => res.data),
  deleteSection: (id) => api.delete(`/tasks/section/${id}`).then(res => res.data),

  // Items (unified features/bugs)
  createItem: (data) => api.post('/tasks/item', data).then(res => res.data),
  updateItem: (id, data) => api.patch(`/tasks/item/${id}`, data).then(res => res.data),
  deleteItem: (id) => api.delete(`/tasks/item/${id}`).then(res => res.data),
  moveItem: (data) => api.put('/tasks/move-item', data).then(res => res.data),

  // Item Categories (unified feature/bug categories)
  createItemCategory: (data) => api.post('/tasks/item-category', data).then(res => res.data),
  updateItemCategory: (id, data) => api.patch(`/tasks/item-category/${id}`, data).then(res => res.data),
  deleteItemCategory: (id) => api.delete(`/tasks/item-category/${id}`).then(res => res.data),

  // ============ LEGACY API (backward compat) ============

  // Features (maps to items in Features section)
  createFeature: (data) => api.post('/tasks/feature', data).then(res => res.data),
  updateFeature: (id, data) => api.patch(`/tasks/feature/${id}`, data).then(res => res.data),
  deleteFeature: (id) => api.delete(`/tasks/feature/${id}`).then(res => res.data),

  // Bugs (maps to items in Bugs section)
  createBug: (data) => api.post('/tasks/bug', data).then(res => res.data),
  updateBug: (id, data) => api.patch(`/tasks/bug/${id}`, data).then(res => res.data),
  deleteBug: (id) => api.delete(`/tasks/bug/${id}`).then(res => res.data),

  // Tasks
  createTask: (data) => api.post('/tasks/task', data).then(res => res.data),
  updateTask: (id, data) => api.patch(`/tasks/task/${id}`, data).then(res => res.data),
  deleteTask: (id) => api.delete(`/tasks/task/${id}`).then(res => res.data),
  moveTask: (data) => api.put('/tasks/move-task', data).then(res => res.data),

  // Task Categories (was just "categories")
  createCategory: (data) => api.post('/tasks/category', data).then(res => res.data),
  updateCategory: (id, data) => api.patch(`/tasks/category/${id}`, data).then(res => res.data),
  deleteCategory: (id) => api.delete(`/tasks/category/${id}`).then(res => res.data),

  // Reorder
  reorder: (type, parentId, order) =>
    api.put('/tasks/reorder', { type, parentId, order }).then(res => res.data),

  // Settings
  updateSettings: (settings) => api.put('/tasks/settings', settings).then(res => res.data),

  // Tags
  createTag: (data) => api.post('/tasks/tag', data).then(res => res.data),
  updateTag: (id, data) => api.patch(`/tasks/tag/${id}`, data).then(res => res.data),
  deleteTag: (id) => api.delete(`/tasks/tag/${id}`).then(res => res.data),

  // Feature Categories (legacy - maps to item categories in Features section)
  createFeatureCategory: (data) => api.post('/tasks/feature-category', data).then(res => res.data),
  updateFeatureCategory: (id, data) => api.patch(`/tasks/feature-category/${id}`, data).then(res => res.data),
  deleteFeatureCategory: (id) => api.delete(`/tasks/feature-category/${id}`).then(res => res.data),
  moveFeature: (data) => api.put('/tasks/move-feature', data).then(res => res.data),

  // Bug Categories (legacy - maps to item categories in Bugs section)
  createBugCategory: (data) => api.post('/tasks/bug-category', data).then(res => res.data),
  updateBugCategory: (id, data) => api.patch(`/tasks/bug-category/${id}`, data).then(res => res.data),
  deleteBugCategory: (id) => api.delete(`/tasks/bug-category/${id}`).then(res => res.data),
  moveBug: (data) => api.put('/tasks/move-bug', data).then(res => res.data),

  // Import/Export
  exportData: () => api.get('/tasks/export').then(res => res.data),
  importData: (data) => api.post('/tasks/import', data).then(res => res.data),
  importMerge: (data) => api.post('/tasks/import/merge', data).then(res => res.data),

  // Attachments
  uploadAttachment: (itemType, itemId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('itemType', itemType);
    formData.append('itemId', itemId);
    return api.post('/tasks/attachment', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },
  getAttachmentUrl: (storedPath) => `/api/tasks/attachment/${storedPath}`,
  getAttachmentFilePath: (storedPath) =>
    api.get(`/tasks/attachment-path/${storedPath}`).then(res => res.data.path),
  deleteAttachment: (itemType, itemId, attachmentId) =>
    api.delete(`/tasks/attachment/${itemType}/${itemId}/${attachmentId}`).then(res => res.data),

  // Health check
  health: () => api.get('/health').then(res => res.data),

  // Prompt History
  getPromptHistory: (type, id) => api.get(`/tasks/${type}/${id}/prompt-history`).then(res => res.data),
  clearPromptHistory: (type, id) => api.delete(`/tasks/${type}/${id}/prompt-history`).then(res => res.data),

  // Plans
  getPlan: (type, id, version) => {
    const url = version ? `/tasks/${type}/${id}/plan?version=${version}` : `/tasks/${type}/${id}/plan`;
    return api.get(url).then(res => res.data);
  },
  getPlanVersions: (type, id) => api.get(`/tasks/${type}/${id}/plan/versions`).then(res => res.data)
};

// Status options for tasks
export const TASK_STATUSES = [
  { value: 'open', label: 'Open', color: '#3b82f6' },
  { value: 'in-progress', label: 'In Progress', color: '#f59e0b' },
  { value: 'done', label: 'Done', color: '#22c55e' }
];

// Priority options
export const PRIORITIES = [
  { value: 'low', label: 'Low', color: '#6b7280', icon: '▽' },
  { value: 'medium', label: 'Medium', color: '#3b82f6', icon: '◇' },
  { value: 'high', label: 'High', color: '#f59e0b', icon: '△' },
  { value: 'critical', label: 'Critical', color: '#ef4444', icon: '▲' }
];

// Complexity options (1-5 scale, green to red)
export const COMPLEXITIES = [
  { value: 1, label: '1', description: 'Trivial', color: '#22c55e' },
  { value: 2, label: '2', description: 'Simple', color: '#84cc16' },
  { value: 3, label: '3', description: 'Medium', color: '#f59e0b' },
  { value: 4, label: '4', description: 'Complex', color: '#f97316' },
  { value: 5, label: '5', description: 'Hard', color: '#ef4444' }
];

export default tasksApi;
