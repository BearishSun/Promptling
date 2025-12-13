const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const {
  loadProjects,
  loadSettings,
  getProjectDataPath,
  getProjectDir,
  checkMigrationNeeded,
  migrateOldData
} = require('./projects');

const router = express.Router();
// Store data in the project root (parent of server directory)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, '.promptflow');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// Legacy paths (for backward compatibility during migration)
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'data.json');
const LEGACY_ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');

// Get active project ID from request header or settings
async function getActiveProjectId(req) {
  // Check header first
  const headerProjectId = req.headers['x-project-id'];
  if (headerProjectId) {
    return headerProjectId;
  }
  // Fall back to settings
  const settings = await loadSettings();
  return settings.activeProjectId;
}

// Get data file path for active project
async function getDataFilePath(req) {
  const projectId = await getActiveProjectId(req);
  if (!projectId) {
    // Return legacy path if no project is set
    return LEGACY_DATA_FILE;
  }
  return getProjectDataPath(projectId);
}

// Get attachments directory for active project
async function getAttachmentsDir(req) {
  const projectId = await getActiveProjectId(req);
  if (!projectId) {
    return LEGACY_ATTACHMENTS_DIR;
  }
  return path.join(getProjectDir(projectId), 'attachments');
}

// Allowed file types
const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml'
];

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.markdown', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

// Configure multer for file uploads - use memory storage, we'll save manually
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext) || ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed: txt, md, jpg, png, gif, webp, svg'));
    }
  }
});

// Get unique filename if conflict exists
async function getUniqueFilename(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let finalName = filename;
  let counter = 1;

  while (true) {
    try {
      await fs.access(path.join(dir, finalName));
      // File exists, try with counter
      finalName = `${base} (${counter})${ext}`;
      counter++;
    } catch {
      // File doesn't exist, use this name
      return finalName;
    }
  }
}

// Valid task statuses
const TASK_STATUSES = ['open', 'in-progress', 'done'];

// Default tag colors
const DEFAULT_TAG_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];

// Default data structure
function getDefaultData() {
  return {
    version: 3,
    lastModified: new Date().toISOString(),
    features: {},
    bugs: {},
    tasks: {},
    categories: {},
    tags: {},
    featureCategories: {},  // Categories for grouping features
    bugCategories: {},      // Categories for grouping bugs
    globalFeatureOrder: [],
    globalBugOrder: [],
    featureCategoryOrder: [],  // Order of feature categories
    bugCategoryOrder: [],      // Order of bug categories
    settings: {
      activeView: 'features',
      activeFeatureId: null,
      theme: 'system' // 'light', 'dark', 'system'
    }
  };
}

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Load data with default fallback - now project-aware
async function loadData(req) {
  await ensureDataDir();
  const dataFile = await getDataFilePath(req);

  // Ensure parent directory exists
  const parentDir = path.dirname(dataFile);
  try {
    await fs.access(parentDir);
  } catch {
    await fs.mkdir(parentDir, { recursive: true });
  }

  try {
    const content = await fs.readFile(dataFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const defaultData = getDefaultData();
      await saveData(defaultData, req);
      return defaultData;
    }
    throw error;
  }
}

// Save data atomically (write to temp, then rename) - now project-aware
async function saveData(data, req) {
  data.lastModified = new Date().toISOString();
  await ensureDataDir();
  const dataFile = await getDataFilePath(req);

  // Ensure parent directory exists
  const parentDir = path.dirname(dataFile);
  try {
    await fs.access(parentDir);
  } catch {
    await fs.mkdir(parentDir, { recursive: true });
  }

  const tempFile = `${dataFile}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  await fs.rename(tempFile, dataFile);
}

// Generate unique ID
function generateId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${id}`;
}

// GET /api/tasks - Get all data
router.get('/', async (req, res) => {
  try {
    const data = await loadData(req);
    res.json(data);
  } catch (error) {
    console.error('Error loading tasks:', error);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

// PUT /api/tasks - Save all data
router.put('/', async (req, res) => {
  try {
    await saveData(req.body, req);
    res.json({ saved: true });
  } catch (error) {
    console.error('Error saving tasks:', error);
    res.status(500).json({ error: 'Failed to save tasks' });
  }
});

// POST /api/tasks/feature - Create feature
router.post('/feature', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('feat');
    const feature = {
      id,
      title: req.body.title || 'New Feature',
      description: req.body.description || '',
      status: 'open',
      createdAt: new Date().toISOString(),
      finishedAt: null,
      taskOrder: [],
      categoryOrder: []
    };
    data.features[id] = feature;
    data.globalFeatureOrder.push(id);
    await saveData(data, req);
    res.json(feature);
  } catch (error) {
    console.error('Error creating feature:', error);
    res.status(500).json({ error: 'Failed to create feature' });
  }
});

// POST /api/tasks/bug - Create bug
router.post('/bug', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('bug');
    const bug = {
      id,
      title: req.body.title || 'New Bug',
      description: req.body.description || '',
      status: 'open', // Bugs now have status like features/tasks
      createdAt: new Date().toISOString(),
      finishedAt: null,
      taskOrder: [],
      categoryOrder: []
    };
    data.bugs[id] = bug;
    data.globalBugOrder.push(id);
    await saveData(data, req);
    res.json(bug);
  } catch (error) {
    console.error('Error creating bug:', error);
    res.status(500).json({ error: 'Failed to create bug' });
  }
});

// POST /api/tasks/task - Create task
router.post('/task', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('task');
    const { parentType, parentId, categoryId, title, description, status, tagIds } = req.body;

    const task = {
      id,
      parentType: parentType || 'feature',
      parentId: parentId || null,
      categoryId: categoryId || null,
      title: title || 'New Task',
      description: description || '',
      status: TASK_STATUSES.includes(status) ? status : 'open',
      tagIds: Array.isArray(tagIds) ? tagIds : [],
      createdAt: new Date().toISOString(),
      finishedAt: null
    };

    data.tasks[id] = task;

    // Add to parent's task order
    if (categoryId && data.categories[categoryId]) {
      data.categories[categoryId].taskOrder.push(id);
    } else if (parentId) {
      if (parentType === 'feature' && data.features[parentId]) {
        data.features[parentId].taskOrder.push(id);
      } else if (parentType === 'bug' && data.bugs[parentId]) {
        data.bugs[parentId].taskOrder.push(id);
      }
    }

    await saveData(data, req);
    res.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// POST /api/tasks/category - Create category
router.post('/category', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('cat');
    const { parentType, parentId, name } = req.body;

    const category = {
      id,
      parentType: parentType || 'feature',
      parentId: parentId || null,
      name: name || 'New Category',
      taskOrder: []
    };

    data.categories[id] = category;

    // Add to parent's categoryOrder
    if (parentId) {
      if (parentType === 'feature' && data.features[parentId]) {
        if (!data.features[parentId].categoryOrder) data.features[parentId].categoryOrder = [];
        data.features[parentId].categoryOrder.push(id);
      } else if (parentType === 'bug' && data.bugs[parentId]) {
        if (!data.bugs[parentId].categoryOrder) data.bugs[parentId].categoryOrder = [];
        data.bugs[parentId].categoryOrder.push(id);
      }
    }

    await saveData(data, req);
    res.json(category);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});
// PUT /api/tasks/reorder - Reorder items
router.put('/reorder', async (req, res) => {
  try {
    const { type, parentId, order } = req.body;
    const data = await loadData(req);

    switch (type) {
      case 'features':
        data.globalFeatureOrder = order;
        break;
      case 'bugs':
        data.globalBugOrder = order;
        break;
      case 'tasks':
        if (parentId) {
          // Check if it's a category
          if (data.categories[parentId]) {
            data.categories[parentId].taskOrder = order;
          } else if (data.features[parentId]) {
            data.features[parentId].taskOrder = order;
          } else if (data.bugs[parentId]) {
            data.bugs[parentId].taskOrder = order;
          }
        }
        break;
      case 'feature-categories':
        if (!data.featureCategoryOrder) data.featureCategoryOrder = [];
        data.featureCategoryOrder = order;
        break;
      case 'bug-categories':
        if (!data.bugCategoryOrder) data.bugCategoryOrder = [];
        data.bugCategoryOrder = order;
        break;
      case 'features-in-category':
        if (parentId && data.featureCategories?.[parentId]) {
          data.featureCategories[parentId].featureOrder = order;
        }
        break;
      case 'bugs-in-category':
        if (parentId && data.bugCategories?.[parentId]) {
          data.bugCategories[parentId].bugOrder = order;
        }
        break;
      case 'categories':
        // Reorder task categories within a feature/bug
        if (parentId) {
          if (data.features[parentId]) {
            if (!data.features[parentId].categoryOrder) data.features[parentId].categoryOrder = [];
            data.features[parentId].categoryOrder = order;
          } else if (data.bugs[parentId]) {
            if (!data.bugs[parentId].categoryOrder) data.bugs[parentId].categoryOrder = [];
            data.bugs[parentId].categoryOrder = order;
          }
        }
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    await saveData(data, req);
    res.json({ updated: true });
  } catch (error) {
    console.error('Error reordering:', error);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

// PUT /api/tasks/settings - Update settings
router.put('/settings', async (req, res) => {
  try {
    const data = await loadData(req);
    data.settings = { ...data.settings, ...req.body };
    await saveData(data, req);
    res.json(data.settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PUT /api/tasks/move-task - Move task between categories/parents
router.put('/move-task', async (req, res) => {
  try {
    const { taskId, newCategoryId, newParentType, newParentId } = req.body;
    const data = await loadData(req);

    const task = data.tasks[taskId];
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Remove from old location
    if (task.categoryId && data.categories[task.categoryId]) {
      data.categories[task.categoryId].taskOrder =
        data.categories[task.categoryId].taskOrder.filter(id => id !== taskId);
    } else if (task.parentId) {
      if (task.parentType === 'feature' && data.features[task.parentId]) {
        data.features[task.parentId].taskOrder =
          data.features[task.parentId].taskOrder.filter(id => id !== taskId);
      } else if (task.parentType === 'bug' && data.bugs[task.parentId]) {
        data.bugs[task.parentId].taskOrder =
          data.bugs[task.parentId].taskOrder.filter(id => id !== taskId);
      }
    }

    // Update task
    task.categoryId = newCategoryId || null;
    task.parentType = newParentType || task.parentType;
    task.parentId = newParentId || task.parentId;

    // Add to new location
    if (newCategoryId && data.categories[newCategoryId]) {
      data.categories[newCategoryId].taskOrder.push(taskId);
    } else if (newParentId) {
      if (newParentType === 'feature' && data.features[newParentId]) {
        data.features[newParentId].taskOrder.push(taskId);
      } else if (newParentType === 'bug' && data.bugs[newParentId]) {
        data.bugs[newParentId].taskOrder.push(taskId);
      }
    }

    await saveData(data, req);
    res.json(task);
  } catch (error) {
    console.error('Error moving task:', error);
    res.status(500).json({ error: 'Failed to move task' });
  }
});

// ========== TAG ROUTES ==========

// POST /api/tasks/tag - Create tag
router.post('/tag', async (req, res) => {
  try {
    const data = await loadData(req);
    if (!data.tags) data.tags = {};

    const id = generateId('tag');
    const { name, color } = req.body;

    const tag = {
      id,
      name: name || 'New Tag',
      color: color || DEFAULT_TAG_COLORS[Object.keys(data.tags).length % DEFAULT_TAG_COLORS.length]
    };

    data.tags[id] = tag;
    await saveData(data, req);
    res.json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PATCH /api/tasks/tag/:id - Update tag
router.patch('/tag/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const data = await loadData(req);

    if (!data.tags || !data.tags[id]) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    data.tags[id] = { ...data.tags[id], ...updates };
    await saveData(data, req);
    res.json(data.tags[id]);
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/tasks/tag/:id - Delete tag
router.delete('/tag/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData(req);

    if (!data.tags || !data.tags[id]) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Remove tag from all tasks
    Object.values(data.tasks).forEach(task => {
      if (task.tagIds) {
        task.tagIds = task.tagIds.filter(tagId => tagId !== id);
      }
    });

    delete data.tags[id];
    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ========== FEATURE/BUG CATEGORY ROUTES ==========

// POST /api/tasks/feature-category - Create feature category
router.post('/feature-category', async (req, res) => {
  try {
    const data = await loadData(req);
    if (!data.featureCategories) data.featureCategories = {};
    if (!data.featureCategoryOrder) data.featureCategoryOrder = [];

    const id = generateId('fcat');
    const { name } = req.body;

    const category = {
      id,
      name: name || 'New Category',
      featureOrder: []
    };

    data.featureCategories[id] = category;
    data.featureCategoryOrder.push(id);
    await saveData(data, req);
    res.json(category);
  } catch (error) {
    console.error('Error creating feature category:', error);
    res.status(500).json({ error: 'Failed to create feature category' });
  }
});

// PATCH /api/tasks/feature-category/:id - Update feature category
router.patch('/feature-category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const data = await loadData(req);

    if (!data.featureCategories?.[id]) {
      return res.status(404).json({ error: 'Feature category not found' });
    }

    data.featureCategories[id] = { ...data.featureCategories[id], ...updates };
    await saveData(data, req);
    res.json(data.featureCategories[id]);
  } catch (error) {
    console.error('Error updating feature category:', error);
    res.status(500).json({ error: 'Failed to update feature category' });
  }
});

// DELETE /api/tasks/feature-category/:id - Delete feature category
router.delete('/feature-category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData(req);

    if (!data.featureCategories?.[id]) {
      return res.status(404).json({ error: 'Feature category not found' });
    }

    // Move features back to uncategorized
    const category = data.featureCategories[id];
    for (const featureId of category.featureOrder || []) {
      if (data.features[featureId]) {
        data.features[featureId].categoryId = null;
        if (!data.globalFeatureOrder.includes(featureId)) {
          data.globalFeatureOrder.push(featureId);
        }
      }
    }

    delete data.featureCategories[id];
    data.featureCategoryOrder = (data.featureCategoryOrder || []).filter(cid => cid !== id);
    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting feature category:', error);
    res.status(500).json({ error: 'Failed to delete feature category' });
  }
});

// POST /api/tasks/bug-category - Create bug category
router.post('/bug-category', async (req, res) => {
  try {
    const data = await loadData(req);
    if (!data.bugCategories) data.bugCategories = {};
    if (!data.bugCategoryOrder) data.bugCategoryOrder = [];

    const id = generateId('bcat');
    const { name } = req.body;

    const category = {
      id,
      name: name || 'New Category',
      bugOrder: []
    };

    data.bugCategories[id] = category;
    data.bugCategoryOrder.push(id);
    await saveData(data, req);
    res.json(category);
  } catch (error) {
    console.error('Error creating bug category:', error);
    res.status(500).json({ error: 'Failed to create bug category' });
  }
});

// PATCH /api/tasks/bug-category/:id - Update bug category
router.patch('/bug-category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const data = await loadData(req);

    if (!data.bugCategories?.[id]) {
      return res.status(404).json({ error: 'Bug category not found' });
    }

    data.bugCategories[id] = { ...data.bugCategories[id], ...updates };
    await saveData(data, req);
    res.json(data.bugCategories[id]);
  } catch (error) {
    console.error('Error updating bug category:', error);
    res.status(500).json({ error: 'Failed to update bug category' });
  }
});

// DELETE /api/tasks/bug-category/:id - Delete bug category
router.delete('/bug-category/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData(req);

    if (!data.bugCategories?.[id]) {
      return res.status(404).json({ error: 'Bug category not found' });
    }

    // Move bugs back to uncategorized
    const category = data.bugCategories[id];
    for (const bugId of category.bugOrder || []) {
      if (data.bugs[bugId]) {
        data.bugs[bugId].categoryId = null;
        if (!data.globalBugOrder.includes(bugId)) {
          data.globalBugOrder.push(bugId);
        }
      }
    }

    delete data.bugCategories[id];
    data.bugCategoryOrder = (data.bugCategoryOrder || []).filter(cid => cid !== id);
    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting bug category:', error);
    res.status(500).json({ error: 'Failed to delete bug category' });
  }
});

// PUT /api/tasks/move-feature - Move feature to/from category
router.put('/move-feature', async (req, res) => {
  try {
    const { featureId, targetCategoryId } = req.body;
    const data = await loadData(req);

    const feature = data.features[featureId];
    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' });
    }

    // Remove from old location
    if (feature.categoryId && data.featureCategories?.[feature.categoryId]) {
      data.featureCategories[feature.categoryId].featureOrder =
        data.featureCategories[feature.categoryId].featureOrder.filter(id => id !== featureId);
    } else {
      data.globalFeatureOrder = data.globalFeatureOrder.filter(id => id !== featureId);
    }

    // Add to new location
    if (targetCategoryId && data.featureCategories?.[targetCategoryId]) {
      feature.categoryId = targetCategoryId;
      data.featureCategories[targetCategoryId].featureOrder.push(featureId);
    } else {
      feature.categoryId = null;
      data.globalFeatureOrder.push(featureId);
    }

    await saveData(data, req);
    res.json(feature);
  } catch (error) {
    console.error('Error moving feature:', error);
    res.status(500).json({ error: 'Failed to move feature' });
  }
});

// PUT /api/tasks/move-bug - Move bug to/from category
router.put('/move-bug', async (req, res) => {
  try {
    const { bugId, targetCategoryId } = req.body;
    const data = await loadData(req);

    const bug = data.bugs[bugId];
    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    // Remove from old location
    if (bug.categoryId && data.bugCategories?.[bug.categoryId]) {
      data.bugCategories[bug.categoryId].bugOrder =
        data.bugCategories[bug.categoryId].bugOrder.filter(id => id !== bugId);
    } else {
      data.globalBugOrder = data.globalBugOrder.filter(id => id !== bugId);
    }

    // Add to new location
    if (targetCategoryId && data.bugCategories?.[targetCategoryId]) {
      bug.categoryId = targetCategoryId;
      data.bugCategories[targetCategoryId].bugOrder.push(bugId);
    } else {
      bug.categoryId = null;
      data.globalBugOrder.push(bugId);
    }

    await saveData(data, req);
    res.json(bug);
  } catch (error) {
    console.error('Error moving bug:', error);
    res.status(500).json({ error: 'Failed to move bug' });
  }
});

// ========== IMPORT/EXPORT ROUTES ==========

// GET /api/tasks/export - Export all data as JSON
router.get('/export', async (req, res) => {
  try {
    const data = await loadData(req);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="tasklist-export-${new Date().toISOString().split('T')[0]}.json"`);
    res.json(data);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// POST /api/tasks/import - Import data from JSON
router.post('/import', async (req, res) => {
  try {
    const importData = req.body;

    // Validate structure
    if (!importData || typeof importData !== 'object') {
      return res.status(400).json({ error: 'Invalid import data' });
    }

    // Ensure required fields exist
    const validatedData = {
      version: importData.version || 2,
      lastModified: new Date().toISOString(),
      features: importData.features || {},
      bugs: importData.bugs || {},
      tasks: importData.tasks || {},
      categories: importData.categories || {},
      tags: importData.tags || {},
      globalFeatureOrder: importData.globalFeatureOrder || [],
      globalBugOrder: importData.globalBugOrder || [],
      settings: {
        activeView: 'features',
        activeFeatureId: null,
        theme: importData.settings?.theme || 'system'
      }
    };

    await saveData(validatedData, req);
    res.json({ imported: true, stats: {
      features: Object.keys(validatedData.features).length,
      bugs: Object.keys(validatedData.bugs).length,
      tasks: Object.keys(validatedData.tasks).length,
      tags: Object.keys(validatedData.tags).length
    }});
  } catch (error) {
    console.error('Error importing data:', error);
    res.status(500).json({ error: 'Failed to import data' });
  }
});

// POST /api/tasks/import/merge - Merge import with existing data
router.post('/import/merge', async (req, res) => {
  try {
    const importData = req.body;
    const existingData = await loadData(req);

    // Merge features
    if (importData.features) {
      Object.assign(existingData.features, importData.features);
      importData.globalFeatureOrder?.forEach(id => {
        if (!existingData.globalFeatureOrder.includes(id)) {
          existingData.globalFeatureOrder.push(id);
        }
      });
    }

    // Merge bugs
    if (importData.bugs) {
      Object.assign(existingData.bugs, importData.bugs);
      importData.globalBugOrder?.forEach(id => {
        if (!existingData.globalBugOrder.includes(id)) {
          existingData.globalBugOrder.push(id);
        }
      });
    }

    // Merge tasks
    if (importData.tasks) {
      Object.assign(existingData.tasks, importData.tasks);
    }

    // Merge categories
    if (importData.categories) {
      Object.assign(existingData.categories, importData.categories);
    }

    // Merge tags
    if (importData.tags) {
      if (!existingData.tags) existingData.tags = {};
      Object.assign(existingData.tags, importData.tags);
    }

    await saveData(existingData, req);
    res.json({ merged: true });
  } catch (error) {
    console.error('Error merging data:', error);
    res.status(500).json({ error: 'Failed to merge data' });
  }
});

// ========== ATTACHMENT ROUTES ==========

// POST /api/tasks/attachment - Upload attachment
router.post('/attachment', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { itemType, itemId } = req.body;
    if (!itemType || !itemId) {
      return res.status(400).json({ error: 'itemType and itemId are required' });
    }

    const data = await loadData(req);

    // Get the item
    let item;
    switch (itemType) {
      case 'task': item = data.tasks?.[itemId]; break;
      case 'feature': item = data.features?.[itemId]; break;
      case 'bug': item = data.bugs?.[itemId]; break;
      default:
        return res.status(400).json({ error: 'Invalid itemType' });
    }

    if (!item) {
      return res.status(404).json({ error: `${itemType} not found` });
    }

    // Create item-specific folder: attachments/{itemType}/{itemId}/
    const attachmentsDir = await getAttachmentsDir(req);
    const itemDir = path.join(attachmentsDir, itemType, itemId);
    await fs.mkdir(itemDir, { recursive: true });

    // Get unique filename (preserve original, add counter if conflict)
    const storedName = await getUniqueFilename(itemDir, req.file.originalname);
    const filePath = path.join(itemDir, storedName);

    // Write the file
    await fs.writeFile(filePath, req.file.buffer);

    // Create attachment metadata
    const attachment = {
      id: generateId('att'),
      filename: req.file.originalname,
      storedName: storedName,
      storedPath: `${itemType}/${itemId}/${storedName}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString()
    };

    // Add to item's attachments array
    if (!item.attachments) item.attachments = [];
    item.attachments.push(attachment);

    await saveData(data, req);
    res.json(attachment);
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ error: error.message || 'Failed to upload attachment' });
  }
});

// GET /api/tasks/attachment/:itemType/:itemId/:filename - Serve attachment file
router.get('/attachment/:itemType/:itemId/:filename', async (req, res) => {
  try {
    const { itemType, itemId, filename } = req.params;
    const attachmentsDir = await getAttachmentsDir(req);
    const filePath = path.join(attachmentsDir, itemType, itemId, filename);

    // Security check - prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(attachmentsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // Determine content type
    const ext = path.extname(filename).toLowerCase();
    const contentTypes = {
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml'
    };

    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).json({ error: 'Failed to serve attachment' });
  }
});

// GET /api/tasks/attachment-path/:itemType/:itemId/:filename - Get full filesystem path
router.get('/attachment-path/:itemType/:itemId/:filename', async (req, res) => {
  try {
    const { itemType, itemId, filename } = req.params;
    const attachmentsDir = await getAttachmentsDir(req);
    const filePath = path.join(attachmentsDir, itemType, itemId, filename);

    // Security check
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(attachmentsDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ path: normalizedPath });
  } catch (error) {
    console.error('Error getting attachment path:', error);
    res.status(500).json({ error: 'Failed to get attachment path' });
  }
});

// DELETE /api/tasks/attachment/:itemType/:itemId/:attachmentId - Delete attachment
router.delete('/attachment/:itemType/:itemId/:attachmentId', async (req, res) => {
  try {
    const { itemType, itemId, attachmentId } = req.params;
    const data = await loadData(req);

    // Get the item
    let item;
    switch (itemType) {
      case 'task': item = data.tasks?.[itemId]; break;
      case 'feature': item = data.features?.[itemId]; break;
      case 'bug': item = data.bugs?.[itemId]; break;
      default:
        return res.status(400).json({ error: 'Invalid itemType' });
    }

    if (!item) {
      return res.status(404).json({ error: `${itemType} not found` });
    }

    // Find the attachment
    const attachmentIndex = (item.attachments || []).findIndex(a => a.id === attachmentId);
    if (attachmentIndex === -1) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const attachment = item.attachments[attachmentIndex];

    // Delete the file - use storedPath if available, fallback to old structure
    const attachmentsDir = await getAttachmentsDir(req);
    const filePath = attachment.storedPath
      ? path.join(attachmentsDir, attachment.storedPath)
      : path.join(attachmentsDir, attachment.storedName);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.warn('Could not delete attachment file:', e.message);
    }

    // Remove from item
    item.attachments.splice(attachmentIndex, 1);
    await saveData(data, req);

    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// ========== SEARCH ENDPOINT ==========

// GET /api/tasks/search - Search items
router.get('/search', async (req, res) => {
  try {
    const { q, type = 'all', status } = req.query;
    const data = await loadData(req);
    const results = [];

    const matchesQuery = (item) => {
      if (!q) return true;
      const query = q.toLowerCase();
      return (
        item.title?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      );
    };

    const matchesStatus = (item) => {
      if (!status) return true;
      return item.status === status;
    };

    if (type === 'all' || type === 'feature') {
      Object.values(data.features)
        .filter(f => matchesQuery(f) && matchesStatus(f))
        .forEach(f => results.push({ type: 'feature', id: f.id, title: f.title, status: f.status }));
    }

    if (type === 'all' || type === 'bug') {
      Object.values(data.bugs)
        .filter(b => matchesQuery(b) && matchesStatus(b))
        .forEach(b => results.push({ type: 'bug', id: b.id, title: b.title, status: b.status || 'open' }));
    }

    if (type === 'all' || type === 'task') {
      Object.values(data.tasks)
        .filter(t => matchesQuery(t) && matchesStatus(t))
        .forEach(t => results.push({ type: 'task', id: t.id, title: t.title, status: t.status, parentType: t.parentType, parentId: t.parentId }));
    }

    res.json({ results, count: results.length });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// ========== PROMPT HISTORY ENDPOINTS ==========

// GET /api/tasks/:type/:id/prompt-history - Get prompt history
router.get('/:type/:id/prompt-history', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { limit } = req.query;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    let history = item.promptHistory || [];
    if (limit && parseInt(limit) > 0) {
      history = history.slice(-parseInt(limit));
    }

    res.json({ history, count: history.length, totalCount: item.promptHistory?.length || 0 });
  } catch (error) {
    console.error('Error getting prompt history:', error);
    res.status(500).json({ error: 'Failed to get prompt history' });
  }
});

// POST /api/tasks/:type/:id/prompt-history - Append to prompt history
router.post('/:type/:id/prompt-history', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { role, content } = req.body;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    if (!item.promptHistory) item.promptHistory = [];

    const entry = {
      id: generateId('ph'),
      timestamp: new Date().toISOString(),
      role: role || 'user',
      content: content || ''
    };

    item.promptHistory.push(entry);
    await saveData(data, req);

    res.json({ added: true, entry, totalCount: item.promptHistory.length });
  } catch (error) {
    console.error('Error appending prompt history:', error);
    res.status(500).json({ error: 'Failed to append prompt history' });
  }
});

// DELETE /api/tasks/:type/:id/prompt-history - Clear prompt history
router.delete('/:type/:id/prompt-history', async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    const previousCount = item.promptHistory?.length || 0;
    item.promptHistory = [];
    await saveData(data, req);

    res.json({ cleared: true, previousCount });
  } catch (error) {
    console.error('Error clearing prompt history:', error);
    res.status(500).json({ error: 'Failed to clear prompt history' });
  }
});

// ========== PLAN MANAGEMENT ENDPOINTS ==========

// GET /api/tasks/:type/:id/plan - Get plan
router.get('/:type/:id/plan', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { version } = req.query;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    const plans = (item.attachments || [])
      .filter(a => a.filename?.startsWith('PLAN-v'))
      .sort((a, b) => {
        const vA = parseInt(a.filename.match(/PLAN-v(\d+)/)?.[1] || 0);
        const vB = parseInt(b.filename.match(/PLAN-v(\d+)/)?.[1] || 0);
        return vB - vA; // Descending
      });

    if (plans.length === 0) {
      return res.json({ exists: false, message: 'No plan exists for this item' });
    }

    let targetPlan;
    if (version) {
      targetPlan = plans.find(p => p.filename === `PLAN-v${version}.md`);
      if (!targetPlan) {
        return res.status(404).json({ error: `Plan version ${version} not found` });
      }
    } else {
      targetPlan = plans[0]; // Latest
    }

    const attachmentsDir = await getAttachmentsDir(req);
    const filePath = path.join(attachmentsDir, targetPlan.storedPath);
    const content = await fs.readFile(filePath, 'utf-8');

    res.json({
      exists: true,
      version: parseInt(targetPlan.filename.match(/PLAN-v(\d+)/)?.[1]),
      filename: targetPlan.filename,
      content,
      totalVersions: plans.length
    });
  } catch (error) {
    console.error('Error getting plan:', error);
    res.status(500).json({ error: 'Failed to get plan' });
  }
});

// PUT /api/tasks/:type/:id/plan - Create/update plan
router.put('/:type/:id/plan', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { content } = req.body;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    // Check for existing plans
    const existingPlans = (item.attachments || []).filter(a => a.filename?.startsWith('PLAN-v'));
    const version = existingPlans.length + 1;
    const filename = `PLAN-v${version}.md`;

    // Create directory and file
    const attachmentsDir = await getAttachmentsDir(req);
    const itemDir = path.join(attachmentsDir, type, id);
    await fs.mkdir(itemDir, { recursive: true });
    await fs.writeFile(path.join(itemDir, filename), content, 'utf-8');

    // Create attachment metadata
    const attachment = {
      id: generateId('att'),
      filename,
      storedName: filename,
      storedPath: `${type}/${id}/${filename}`,
      mimeType: 'text/markdown',
      size: Buffer.byteLength(content, 'utf-8'),
      uploadedAt: new Date().toISOString()
    };

    if (!item.attachments) item.attachments = [];
    item.attachments.push(attachment);

    await saveData(data, req);
    res.json({ created: true, version, filename, attachmentId: attachment.id });
  } catch (error) {
    console.error('Error creating plan:', error);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

// GET /api/tasks/:type/:id/plan/versions - List plan versions
router.get('/:type/:id/plan/versions', async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
      default: return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    const plans = (item.attachments || [])
      .filter(a => a.filename?.startsWith('PLAN-v'))
      .map(a => ({
        version: parseInt(a.filename.match(/PLAN-v(\d+)/)?.[1]),
        filename: a.filename,
        attachmentId: a.id,
        uploadedAt: a.uploadedAt,
        size: a.size
      }))
      .sort((a, b) => b.version - a.version);

    res.json({ versions: plans, count: plans.length });
  } catch (error) {
    console.error('Error listing plan versions:', error);
    res.status(500).json({ error: 'Failed to list plan versions' });
  }
});

// IMPORTANT: Generic wildcard routes must be defined LAST to avoid catching specific routes
// PATCH /api/tasks/:type/:id - Update item (generic)
router.patch('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const updates = req.body;
    const data = await loadData(req);

    let collection;
    switch (type) {
      case 'feature': collection = data.features; break;
      case 'bug': collection = data.bugs; break;
      case 'task': collection = data.tasks; break;
      case 'category': collection = data.categories; break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (!collection[id]) {
      return res.status(404).json({ error: `${type} not found` });
    }

    collection[id] = { ...collection[id], ...updates };
    await saveData(data, req);
    res.json(collection[id]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/tasks/:type/:id - Delete item (generic)
router.delete('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await loadData(req);

    switch (type) {
      case 'feature':
        if (!data.features[id]) {
          return res.status(404).json({ error: 'Feature not found' });
        }
        // Delete associated tasks
        for (const taskId of data.features[id].taskOrder || []) {
          delete data.tasks[taskId];
        }
        // Delete associated categories and their tasks
        Object.values(data.categories)
          .filter(cat => cat.parentType === 'feature' && cat.parentId === id)
          .forEach(cat => {
            for (const taskId of cat.taskOrder || []) {
              delete data.tasks[taskId];
            }
            delete data.categories[cat.id];
          });
        delete data.features[id];
        data.globalFeatureOrder = data.globalFeatureOrder.filter(fid => fid !== id);
        break;

      case 'bug':
        if (!data.bugs[id]) {
          return res.status(404).json({ error: 'Bug not found' });
        }
        // Delete associated tasks
        for (const taskId of data.bugs[id].taskOrder || []) {
          delete data.tasks[taskId];
        }
        // Delete associated categories and their tasks
        Object.values(data.categories)
          .filter(cat => cat.parentType === 'bug' && cat.parentId === id)
          .forEach(cat => {
            for (const taskId of cat.taskOrder || []) {
              delete data.tasks[taskId];
            }
            delete data.categories[cat.id];
          });
        delete data.bugs[id];
        data.globalBugOrder = data.globalBugOrder.filter(bid => bid !== id);
        break;

      case 'task':
        if (!data.tasks[id]) {
          return res.status(404).json({ error: 'Task not found' });
        }
        const task = data.tasks[id];
        // Remove from category or parent
        if (task.categoryId && data.categories[task.categoryId]) {
          data.categories[task.categoryId].taskOrder =
            data.categories[task.categoryId].taskOrder.filter(tid => tid !== id);
        } else if (task.parentId) {
          if (task.parentType === 'feature' && data.features[task.parentId]) {
            data.features[task.parentId].taskOrder =
              data.features[task.parentId].taskOrder.filter(tid => tid !== id);
          } else if (task.parentType === 'bug' && data.bugs[task.parentId]) {
            data.bugs[task.parentId].taskOrder =
              data.bugs[task.parentId].taskOrder.filter(tid => tid !== id);
          }
        }
        delete data.tasks[id];
        break;

      case 'category':
        if (!data.categories[id]) {
          return res.status(404).json({ error: 'Category not found' });
        }
        // Move tasks back to parent
        const cat = data.categories[id];
        for (const taskId of cat.taskOrder || []) {
          if (data.tasks[taskId]) {
            data.tasks[taskId].categoryId = null;
            // Add to parent's task order
            if (cat.parentType === 'feature' && data.features[cat.parentId]) {
              data.features[cat.parentId].taskOrder.push(taskId);
            } else if (cat.parentType === 'bug' && data.bugs[cat.parentId]) {
              data.bugs[cat.parentId].taskOrder.push(taskId);
            }
          }
        }
        // Remove from parent's categoryOrder
        if (cat.parentId) {
          if (cat.parentType === 'feature' && data.features[cat.parentId]?.categoryOrder) {
            data.features[cat.parentId].categoryOrder =
              data.features[cat.parentId].categoryOrder.filter(cid => cid !== id);
          } else if (cat.parentType === 'bug' && data.bugs[cat.parentId]?.categoryOrder) {
            data.bugs[cat.parentId].categoryOrder =
              data.bugs[cat.parentId].categoryOrder.filter(cid => cid !== id);
          }
        }
        delete data.categories[id];
        break;

      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

module.exports = router;
