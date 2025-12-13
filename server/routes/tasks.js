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

// Available section icons
const SECTION_ICONS = ['layers', 'bug', 'flag', 'star', 'rocket', 'target', 'calendar', 'folder', 'bookmark', 'lightning', 'check-circle', 'archive'];

// System section IDs (cannot be deleted)
const SYSTEM_SECTIONS = {
  FEATURES: 'sect-features',
  BUGS: 'sect-bugs'
};

// Default data structure - version 4 with unified sections
function getDefaultData() {
  const now = new Date().toISOString();
  return {
    version: 4,
    lastModified: now,
    // Unified sections (replaces features/bugs separation)
    sections: {
      [SYSTEM_SECTIONS.FEATURES]: {
        id: SYSTEM_SECTIONS.FEATURES,
        name: 'Features',
        icon: 'layers',
        color: '#3b82f6',
        isSystem: true,
        itemOrder: [],
        categoryOrder: [],
        createdAt: now
      },
      [SYSTEM_SECTIONS.BUGS]: {
        id: SYSTEM_SECTIONS.BUGS,
        name: 'Bugs',
        icon: 'bug',
        color: '#ef4444',
        isSystem: true,
        itemOrder: [],
        categoryOrder: [],
        createdAt: now
      }
    },
    sectionOrder: [SYSTEM_SECTIONS.FEATURES, SYSTEM_SECTIONS.BUGS],
    // Unified items (replaces features and bugs)
    items: {},
    // Categories for grouping items within sections
    itemCategories: {},
    // Tasks (sub-tasks of items)
    tasks: {},
    // Categories for grouping tasks within items
    taskCategories: {},
    // Tags
    tags: {},
    settings: {
      activeView: 'section',
      activeSectionId: SYSTEM_SECTIONS.FEATURES,
      activeItemId: null,
      theme: 'system'
    }
  };
}

// Migration function: Convert v3 data to v4 unified sections format
function migrateToV4(data) {
  if (data.version >= 4) return data; // Already migrated

  const now = new Date().toISOString();
  const migrated = {
    version: 4,
    lastModified: now,
    sections: {
      [SYSTEM_SECTIONS.FEATURES]: {
        id: SYSTEM_SECTIONS.FEATURES,
        name: 'Features',
        icon: 'layers',
        color: '#3b82f6',
        isSystem: true,
        itemOrder: [...(data.globalFeatureOrder || [])],
        categoryOrder: [...(data.featureCategoryOrder || [])],
        createdAt: now
      },
      [SYSTEM_SECTIONS.BUGS]: {
        id: SYSTEM_SECTIONS.BUGS,
        name: 'Bugs',
        icon: 'bug',
        color: '#ef4444',
        isSystem: true,
        itemOrder: [...(data.globalBugOrder || [])],
        categoryOrder: [...(data.bugCategoryOrder || [])],
        createdAt: now
      }
    },
    sectionOrder: [SYSTEM_SECTIONS.FEATURES, SYSTEM_SECTIONS.BUGS],
    items: {},
    itemCategories: {},
    tasks: {},
    taskCategories: {},
    tags: { ...(data.tags || {}) },
    settings: {
      activeView: 'section',
      activeSectionId: data.settings?.activeView === 'bugs' ? SYSTEM_SECTIONS.BUGS : SYSTEM_SECTIONS.FEATURES,
      activeItemId: data.settings?.activeFeatureId || null,
      theme: data.settings?.theme || 'system'
    }
  };

  // Migrate features to items
  Object.values(data.features || {}).forEach(feature => {
    migrated.items[feature.id] = {
      id: feature.id,
      sectionId: SYSTEM_SECTIONS.FEATURES,
      title: feature.title,
      description: feature.description || '',
      status: feature.status || 'open',
      priority: feature.priority || 'medium',
      complexity: feature.complexity || null,
      categoryId: feature.categoryId || null,
      taskOrder: [...(feature.taskOrder || [])],
      categoryOrder: [...(feature.categoryOrder || [])],
      attachments: [...(feature.attachments || [])],
      promptHistory: [...(feature.promptHistory || [])],
      tagIds: [...(feature.tagIds || [])],
      createdAt: feature.createdAt || now,
      finishedAt: feature.finishedAt || null
    };
  });

  // Migrate bugs to items
  Object.values(data.bugs || {}).forEach(bug => {
    migrated.items[bug.id] = {
      id: bug.id,
      sectionId: SYSTEM_SECTIONS.BUGS,
      title: bug.title,
      description: bug.description || '',
      status: bug.status || 'open',
      priority: bug.priority || 'medium',
      complexity: bug.complexity || null,
      categoryId: bug.categoryId || null,
      taskOrder: [...(bug.taskOrder || [])],
      categoryOrder: [...(bug.categoryOrder || [])],
      attachments: [...(bug.attachments || [])],
      promptHistory: [...(bug.promptHistory || [])],
      tagIds: [...(bug.tagIds || [])],
      createdAt: bug.createdAt || now,
      finishedAt: bug.finishedAt || null
    };
  });

  // Migrate feature categories to item categories
  Object.values(data.featureCategories || {}).forEach(cat => {
    migrated.itemCategories[cat.id] = {
      id: cat.id,
      sectionId: SYSTEM_SECTIONS.FEATURES,
      name: cat.name,
      itemOrder: [...(cat.featureOrder || [])]
    };
  });

  // Migrate bug categories to item categories
  Object.values(data.bugCategories || {}).forEach(cat => {
    migrated.itemCategories[cat.id] = {
      id: cat.id,
      sectionId: SYSTEM_SECTIONS.BUGS,
      name: cat.name,
      itemOrder: [...(cat.bugOrder || [])]
    };
  });

  // Migrate tasks - update parentType to use itemId
  Object.values(data.tasks || {}).forEach(task => {
    migrated.tasks[task.id] = {
      id: task.id,
      itemId: task.parentId, // parentId becomes itemId
      categoryId: task.categoryId || null,
      title: task.title,
      description: task.description || '',
      status: task.status || 'open',
      tagIds: [...(task.tagIds || [])],
      attachments: [...(task.attachments || [])],
      promptHistory: [...(task.promptHistory || [])],
      createdAt: task.createdAt || now,
      finishedAt: task.finishedAt || null
    };
  });

  // Migrate task categories (categories within features/bugs)
  Object.values(data.categories || {}).forEach(cat => {
    migrated.taskCategories[cat.id] = {
      id: cat.id,
      itemId: cat.parentId, // parentId becomes itemId
      name: cat.name,
      taskOrder: [...(cat.taskOrder || [])]
    };
  });

  console.log(`Migrated data from v${data.version || 3} to v4 (unified sections)`);
  return migrated;
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
// Automatically migrates old data formats to v4
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
    let data = JSON.parse(content);

    // Check if migration is needed
    if (!data.version || data.version < 4) {
      data = migrateToV4(data);
      // Save migrated data
      await saveData(data, req);
    }

    return data;
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

// GET /api/tasks - Get all data (v4 unified format)
router.get('/', async (req, res) => {
  try {
    const data = await loadData(req);
    // Return v4 data structure
    res.json({
      version: data.version,
      lastModified: data.lastModified,
      sections: data.sections,
      sectionOrder: data.sectionOrder,
      items: data.items,
      itemCategories: data.itemCategories,
      tasks: data.tasks,
      taskCategories: data.taskCategories,
      tags: data.tags,
      settings: data.settings
    });
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

// POST /api/tasks/task - Create task (v4: creates task under item)
router.post('/task', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('task');
    const now = new Date().toISOString();
    const { parentType, parentId, categoryId, title, description, status, tagIds } = req.body;

    // In v4, parentId is the itemId
    const itemId = parentId;
    const item = data.items[itemId];

    if (!item) {
      return res.status(404).json({ error: 'Parent item not found' });
    }

    // Create task in v4 structure
    const task = {
      id,
      itemId,
      categoryId: categoryId || null,
      title: title || 'New Task',
      description: description || '',
      status: TASK_STATUSES.includes(status) ? status : 'open',
      tagIds: Array.isArray(tagIds) ? tagIds : [],
      attachments: [],
      promptHistory: [],
      createdAt: now,
      finishedAt: null
    };

    data.tasks[id] = task;

    // Add to category's or item's task order
    if (categoryId && data.taskCategories[categoryId]) {
      data.taskCategories[categoryId].taskOrder.push(id);
    } else {
      item.taskOrder.push(id);
    }

    await saveData(data, req);

    // Return backward-compatible response
    res.json({
      ...task,
      parentType: item.sectionId === SYSTEM_SECTIONS.FEATURES ? 'feature' : 'bug',
      parentId: itemId
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// POST /api/tasks/category - Create task category (v4: creates taskCategory under item)
router.post('/category', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('cat');
    const { parentType, parentId, name } = req.body;

    // In v4, parentId is the itemId
    const itemId = parentId;
    const item = data.items[itemId];

    if (!item) {
      return res.status(404).json({ error: 'Parent item not found' });
    }

    // Create taskCategory in v4 structure
    const category = {
      id,
      itemId,
      name: name || 'New Category',
      taskOrder: []
    };

    data.taskCategories[id] = category;

    // Add to item's categoryOrder
    if (!item.categoryOrder) item.categoryOrder = [];
    item.categoryOrder.push(id);

    await saveData(data, req);

    // Return backward-compatible response
    res.json({
      ...category,
      parentType: item.sectionId === SYSTEM_SECTIONS.FEATURES ? 'feature' : 'bug',
      parentId: itemId
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});
// PUT /api/tasks/reorder - Reorder items (v4: works with sections/items)
router.put('/reorder', async (req, res) => {
  try {
    const { type, parentId, order } = req.body;
    const data = await loadData(req);

    switch (type) {
      case 'sections':
        // v4: reorder sections
        data.sectionOrder = order;
        break;
      case 'tasks':
        if (parentId) {
          // Check if it's a taskCategory or item
          if (data.taskCategories[parentId]) {
            data.taskCategories[parentId].taskOrder = order;
          } else if (data.items[parentId]) {
            data.items[parentId].taskOrder = order;
          }
        }
        break;
      case 'items-in-category':
        // v4: reorder items in an item category
        if (parentId && data.itemCategories[parentId]) {
          data.itemCategories[parentId].itemOrder = order;
        }
        break;
      case 'section-items':
        // v4: reorder items in a section (by sectionId)
        if (parentId && data.sections[parentId]) {
          data.sections[parentId].itemOrder = order;
        }
        break;
      case 'section-categories':
        // v4: reorder item categories in a section (by sectionId)
        if (parentId && data.sections[parentId]) {
          data.sections[parentId].categoryOrder = order;
        }
        break;
      case 'categories':
        // Reorder task categories within an item
        if (parentId && data.items[parentId]) {
          if (!data.items[parentId].categoryOrder) data.items[parentId].categoryOrder = [];
          data.items[parentId].categoryOrder = order;
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

// PUT /api/tasks/settings - Update settings (v4: translates legacy settings)
router.put('/settings', async (req, res) => {
  try {
    const data = await loadData(req);
    const { activeView, activeFeatureId, theme } = req.body;

    // Translate legacy settings to v4
    if (activeView !== undefined) {
      data.settings.activeSectionId = activeView === 'bugs' ? SYSTEM_SECTIONS.BUGS : SYSTEM_SECTIONS.FEATURES;
    }
    if (activeFeatureId !== undefined) {
      data.settings.activeItemId = activeFeatureId;
    }
    if (theme !== undefined) {
      data.settings.theme = theme;
    }

    await saveData(data, req);

    // Return backward-compatible response
    res.json({
      activeView: data.settings.activeSectionId === SYSTEM_SECTIONS.BUGS ? 'bugs' : 'features',
      activeFeatureId: data.settings.activeItemId,
      theme: data.settings.theme
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// PUT /api/tasks/move-task - Move task between categories/items (v4)
router.put('/move-task', async (req, res) => {
  try {
    const { taskId, newCategoryId, newParentType, newParentId } = req.body;
    const data = await loadData(req);

    const task = data.tasks[taskId];
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Remove from old location (v4: uses taskCategories and items)
    if (task.categoryId && data.taskCategories[task.categoryId]) {
      data.taskCategories[task.categoryId].taskOrder =
        data.taskCategories[task.categoryId].taskOrder.filter(id => id !== taskId);
    } else if (task.itemId && data.items[task.itemId]) {
      data.items[task.itemId].taskOrder =
        data.items[task.itemId].taskOrder.filter(id => id !== taskId);
    }

    // Update task (v4: uses itemId instead of parentId)
    const newItemId = newParentId || task.itemId;
    task.categoryId = newCategoryId || null;
    task.itemId = newItemId;

    // Add to new location
    if (newCategoryId && data.taskCategories[newCategoryId]) {
      data.taskCategories[newCategoryId].taskOrder.push(taskId);
    } else if (newItemId && data.items[newItemId]) {
      data.items[newItemId].taskOrder.push(taskId);
    }

    await saveData(data, req);

    // Return backward-compatible response
    const item = data.items[task.itemId];
    res.json({
      ...task,
      parentType: item?.sectionId === SYSTEM_SECTIONS.FEATURES ? 'feature' : 'bug',
      parentId: task.itemId
    });
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

// POST /api/tasks/attachment - Upload attachment (v4)
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

    // Get the item (v4: feature/bug/item are all in data.items)
    let item;
    let storageType = itemType;
    switch (itemType) {
      case 'task':
        item = data.tasks?.[itemId];
        break;
      case 'feature':
      case 'bug':
      case 'item':
        item = data.items?.[itemId];
        storageType = 'item';
        break;
      default:
        return res.status(400).json({ error: 'Invalid itemType' });
    }

    if (!item) {
      return res.status(404).json({ error: `${itemType} not found` });
    }

    // Create item-specific folder: attachments/{storageType}/{itemId}/
    const attachmentsDir = await getAttachmentsDir(req);
    const itemDir = path.join(attachmentsDir, storageType, itemId);
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
      storedPath: `${storageType}/${itemId}/${storedName}`,
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

// DELETE /api/tasks/attachment/:itemType/:itemId/:attachmentId - Delete attachment (v4)
router.delete('/attachment/:itemType/:itemId/:attachmentId', async (req, res) => {
  try {
    const { itemType, itemId, attachmentId } = req.params;
    const data = await loadData(req);

    // Get the item (v4: feature/bug/item are all in data.items)
    let item;
    switch (itemType) {
      case 'task':
        item = data.tasks?.[itemId];
        break;
      case 'feature':
      case 'bug':
      case 'item':
        item = data.items?.[itemId];
        break;
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

// GET /api/tasks/search - Search items (v4)
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

    // v4: Search items, categorize by sectionId
    if (type === 'all' || type === 'feature' || type === 'item') {
      Object.values(data.items || {})
        .filter(item => item.sectionId === SYSTEM_SECTIONS.FEATURES && matchesQuery(item) && matchesStatus(item))
        .forEach(f => results.push({ type: 'feature', id: f.id, title: f.title, status: f.status }));
    }

    if (type === 'all' || type === 'bug' || type === 'item') {
      Object.values(data.items || {})
        .filter(item => item.sectionId === SYSTEM_SECTIONS.BUGS && matchesQuery(item) && matchesStatus(item))
        .forEach(b => results.push({ type: 'bug', id: b.id, title: b.title, status: b.status || 'open' }));
    }

    if (type === 'all' || type === 'task') {
      Object.values(data.tasks || {})
        .filter(t => matchesQuery(t) && matchesStatus(t))
        .forEach(t => {
          const parentItem = data.items?.[t.itemId];
          const parentType = parentItem?.sectionId === SYSTEM_SECTIONS.FEATURES ? 'feature' : 'bug';
          results.push({ type: 'task', id: t.id, title: t.title, status: t.status, parentType, parentId: t.itemId });
        });
    }

    res.json({ results, count: results.length });
  } catch (error) {
    console.error('Error searching:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

// ========== PROMPT HISTORY ENDPOINTS ==========

// Helper to get item by type and id (v4)
function getItemByType(data, type, id) {
  switch (type) {
    case 'feature':
    case 'bug':
    case 'item':
      return data.items?.[id];
    case 'task':
      return data.tasks?.[id];
    default:
      return null;
  }
}

// GET /api/tasks/:type/:id/prompt-history - Get prompt history (v4)
router.get('/:type/:id/prompt-history', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { limit } = req.query;
    const data = await loadData(req);

    const item = getItemByType(data, type, id);
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

// POST /api/tasks/:type/:id/prompt-history - Append to prompt history (v4)
router.post('/:type/:id/prompt-history', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { role, content } = req.body;
    const data = await loadData(req);

    const item = getItemByType(data, type, id);
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

// DELETE /api/tasks/:type/:id/prompt-history - Clear prompt history (v4)
router.delete('/:type/:id/prompt-history', async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await loadData(req);

    const item = getItemByType(data, type, id);
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

// GET /api/tasks/:type/:id/plan - Get plan (v4)
router.get('/:type/:id/plan', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { version } = req.query;
    const data = await loadData(req);

    const item = getItemByType(data, type, id);
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

// PUT /api/tasks/:type/:id/plan - Create/update plan (v4)
router.put('/:type/:id/plan', async (req, res) => {
  try {
    const { type, id } = req.params;
    const { content } = req.body;
    const data = await loadData(req);

    const item = getItemByType(data, type, id);
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

    // Determine storage type (use item for feature/bug, task for task)
    const storageType = type === 'task' ? 'task' : 'item';

    // Create directory and file
    const attachmentsDir = await getAttachmentsDir(req);
    const itemDir = path.join(attachmentsDir, storageType, id);
    await fs.mkdir(itemDir, { recursive: true });
    await fs.writeFile(path.join(itemDir, filename), content, 'utf-8');

    // Create attachment metadata
    const attachment = {
      id: generateId('att'),
      filename,
      storedName: filename,
      storedPath: `${storageType}/${id}/${filename}`,
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

// GET /api/tasks/:type/:id/plan/versions - List plan versions (v4)
router.get('/:type/:id/plan/versions', async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await loadData(req);

    const item = getItemByType(data, type, id);
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
// PATCH /api/tasks/:type/:id - Update item (generic, v4)
router.patch('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const updates = req.body;
    const data = await loadData(req);

    let item;
    switch (type) {
      case 'feature':
      case 'bug':
      case 'item':
        // v4: features, bugs, and items are all stored in data.items
        item = data.items[id];
        break;
      case 'task':
        item = data.tasks[id];
        break;
      case 'category':
        // v4: categories are now taskCategories
        item = data.taskCategories[id];
        break;
      case 'section':
        // v4: sections
        item = data.sections[id];
        if (item) {
          // Prevent changing isSystem or id
          delete updates.isSystem;
          delete updates.id;
        }
        break;
      case 'item-category':
        item = data.itemCategories[id];
        break;
      default:
        return res.status(400).json({ error: 'Invalid type' });
    }

    if (!item) {
      return res.status(404).json({ error: `${type} not found` });
    }

    // Apply updates
    Object.assign(item, updates);
    await saveData(data, req);

    // Return backward-compatible response
    if (type === 'feature' || type === 'bug') {
      res.json({ ...item, parentType: type });
    } else if (type === 'task') {
      const parentItem = data.items[item.itemId];
      res.json({
        ...item,
        parentType: parentItem?.sectionId === SYSTEM_SECTIONS.FEATURES ? 'feature' : 'bug',
        parentId: item.itemId
      });
    } else if (type === 'category') {
      const parentItem = data.items[item.itemId];
      res.json({
        ...item,
        parentType: parentItem?.sectionId === SYSTEM_SECTIONS.FEATURES ? 'feature' : 'bug',
        parentId: item.itemId
      });
    } else {
      res.json(item);
    }
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/tasks/:type/:id - Delete item (generic, v4)
router.delete('/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;
    const data = await loadData(req);

    switch (type) {
      case 'feature':
      case 'bug':
      case 'item': {
        // v4: features, bugs, and items are all stored in data.items
        const item = data.items[id];
        if (!item) {
          return res.status(404).json({ error: `${type} not found` });
        }

        const sectionId = item.sectionId;

        // Delete associated tasks
        for (const taskId of item.taskOrder || []) {
          delete data.tasks[taskId];
        }

        // Delete associated taskCategories and their tasks
        Object.values(data.taskCategories)
          .filter(cat => cat.itemId === id)
          .forEach(cat => {
            for (const taskId of cat.taskOrder || []) {
              delete data.tasks[taskId];
            }
            delete data.taskCategories[cat.id];
          });

        // Remove from section's itemOrder
        if (data.sections[sectionId]) {
          data.sections[sectionId].itemOrder =
            data.sections[sectionId].itemOrder.filter(iid => iid !== id);
        }

        // Remove from itemCategory if categorized
        if (item.categoryId && data.itemCategories[item.categoryId]) {
          data.itemCategories[item.categoryId].itemOrder =
            data.itemCategories[item.categoryId].itemOrder.filter(iid => iid !== id);
        }

        delete data.items[id];
        break;
      }

      case 'task': {
        const task = data.tasks[id];
        if (!task) {
          return res.status(404).json({ error: 'Task not found' });
        }

        // Remove from taskCategory or item
        if (task.categoryId && data.taskCategories[task.categoryId]) {
          data.taskCategories[task.categoryId].taskOrder =
            data.taskCategories[task.categoryId].taskOrder.filter(tid => tid !== id);
        } else if (task.itemId && data.items[task.itemId]) {
          data.items[task.itemId].taskOrder =
            data.items[task.itemId].taskOrder.filter(tid => tid !== id);
        }

        delete data.tasks[id];
        break;
      }

      case 'category': {
        // v4: task categories
        const cat = data.taskCategories[id];
        if (!cat) {
          return res.status(404).json({ error: 'Category not found' });
        }

        // Move tasks back to parent item
        const parentItem = data.items[cat.itemId];
        for (const taskId of cat.taskOrder || []) {
          if (data.tasks[taskId]) {
            data.tasks[taskId].categoryId = null;
            if (parentItem) {
              parentItem.taskOrder.push(taskId);
            }
          }
        }

        // Remove from parent item's categoryOrder
        if (parentItem?.categoryOrder) {
          parentItem.categoryOrder = parentItem.categoryOrder.filter(cid => cid !== id);
        }

        delete data.taskCategories[id];
        break;
      }

      case 'section': {
        const section = data.sections[id];
        if (!section) {
          return res.status(404).json({ error: 'Section not found' });
        }

        if (section.isSystem) {
          return res.status(400).json({ error: 'Cannot delete system section' });
        }

        // Delete all items in this section and their tasks/categories
        const itemsToDelete = Object.values(data.items).filter(item => item.sectionId === id);
        for (const item of itemsToDelete) {
          // Delete tasks
          for (const taskId of item.taskOrder || []) {
            delete data.tasks[taskId];
          }
          // Delete taskCategories
          Object.values(data.taskCategories || {})
            .filter(cat => cat.itemId === item.id)
            .forEach(cat => {
              for (const taskId of cat.taskOrder || []) {
                delete data.tasks[taskId];
              }
              delete data.taskCategories[cat.id];
            });
          // Delete itemCategories
          Object.values(data.itemCategories || {})
            .filter(cat => cat.sectionId === id)
            .forEach(cat => {
              delete data.itemCategories[cat.id];
            });
          delete data.items[item.id];
        }

        // Remove from sectionOrder
        data.sectionOrder = data.sectionOrder.filter(sid => sid !== id);

        delete data.sections[id];
        break;
      }

      case 'item-category': {
        const cat = data.itemCategories[id];
        if (!cat) {
          return res.status(404).json({ error: 'Item category not found' });
        }

        // Move items back to section (uncategorized)
        for (const itemId of cat.itemOrder || []) {
          if (data.items[itemId]) {
            data.items[itemId].categoryId = null;
          }
        }

        // Remove from section's categoryOrder
        const section = data.sections[cat.sectionId];
        if (section?.categoryOrder) {
          section.categoryOrder = section.categoryOrder.filter(cid => cid !== id);
        }

        delete data.itemCategories[id];
        break;
      }

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

// ========== NEW SECTION API ROUTES (v4) ==========

// POST /api/tasks/section - Create custom section
router.post('/section', async (req, res) => {
  try {
    const data = await loadData(req);
    const id = generateId('sect');
    const { name, icon, color } = req.body;

    const section = {
      id,
      name: name || 'New Section',
      icon: icon || 'folder',
      color: color || '#6366f1',
      isSystem: false,
      itemOrder: [],
      categoryOrder: [],
      createdAt: new Date().toISOString()
    };

    data.sections[id] = section;
    data.sectionOrder.push(id);

    await saveData(data, req);
    res.json(section);
  } catch (error) {
    console.error('Error creating section:', error);
    res.status(500).json({ error: 'Failed to create section' });
  }
});

// PATCH /api/tasks/section/:id - Update section
router.patch('/section/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const data = await loadData(req);

    if (!data.sections[id]) {
      return res.status(404).json({ error: 'Section not found' });
    }

    // Prevent changing isSystem
    delete updates.isSystem;
    delete updates.id;

    data.sections[id] = { ...data.sections[id], ...updates };
    await saveData(data, req);
    res.json(data.sections[id]);
  } catch (error) {
    console.error('Error updating section:', error);
    res.status(500).json({ error: 'Failed to update section' });
  }
});

// DELETE /api/tasks/section/:id - Delete section
router.delete('/section/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await loadData(req);

    const section = data.sections[id];
    if (!section) {
      return res.status(404).json({ error: 'Section not found' });
    }

    if (section.isSystem) {
      return res.status(400).json({ error: 'Cannot delete system section' });
    }

    // Delete all items in this section and their tasks/categories
    const itemsToDelete = Object.values(data.items).filter(item => item.sectionId === id);
    for (const item of itemsToDelete) {
      // Delete tasks
      for (const taskId of item.taskOrder || []) {
        delete data.tasks[taskId];
      }
      // Delete taskCategories
      Object.values(data.taskCategories)
        .filter(cat => cat.itemId === item.id)
        .forEach(cat => {
          for (const taskId of cat.taskOrder || []) {
            delete data.tasks[taskId];
          }
          delete data.taskCategories[cat.id];
        });
      delete data.items[item.id];
    }

    // Delete itemCategories in this section
    Object.values(data.itemCategories)
      .filter(cat => cat.sectionId === id)
      .forEach(cat => delete data.itemCategories[cat.id]);

    // Remove section
    delete data.sections[id];
    data.sectionOrder = data.sectionOrder.filter(sid => sid !== id);

    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting section:', error);
    res.status(500).json({ error: 'Failed to delete section' });
  }
});

// POST /api/tasks/item - Create item in section
router.post('/item', async (req, res) => {
  try {
    const data = await loadData(req);
    const { sectionId, title, description, categoryId, priority } = req.body;

    if (!sectionId || !data.sections[sectionId]) {
      return res.status(400).json({ error: 'Valid sectionId required' });
    }

    const id = generateId('item');
    const now = new Date().toISOString();

    const item = {
      id,
      sectionId,
      title: title || 'New Item',
      description: description || '',
      status: 'open',
      priority: priority || 'medium',
      complexity: null,
      categoryId: categoryId || null,
      taskOrder: [],
      categoryOrder: [],
      attachments: [],
      promptHistory: [],
      tagIds: [],
      createdAt: now,
      finishedAt: null
    };

    data.items[id] = item;

    // Add to section's itemOrder or category's itemOrder
    if (categoryId && data.itemCategories[categoryId]) {
      data.itemCategories[categoryId].itemOrder.push(id);
    } else {
      data.sections[sectionId].itemOrder.push(id);
    }

    await saveData(data, req);
    res.json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PATCH /api/tasks/item/:id - Update item
router.patch('/item/:id', async (req, res) => {
  try {
    const data = await loadData(req);
    const { id } = req.params;

    if (!data.items[id]) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const updates = req.body;
    const allowedFields = ['title', 'description', 'status', 'priority', 'complexity', 'categoryId', 'tagIds'];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        data.items[id][field] = updates[field];
      }
    }

    if (updates.status === 'done' && !data.items[id].finishedAt) {
      data.items[id].finishedAt = new Date().toISOString();
    } else if (updates.status && updates.status !== 'done') {
      data.items[id].finishedAt = null;
    }

    await saveData(data, req);
    res.json(data.items[id]);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/tasks/item/:id - Delete item
router.delete('/item/:id', async (req, res) => {
  try {
    const data = await loadData(req);
    const { id } = req.params;

    if (!data.items[id]) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = data.items[id];
    const sectionId = item.sectionId;

    // Remove from section's itemOrder
    if (data.sections[sectionId]) {
      data.sections[sectionId].itemOrder = data.sections[sectionId].itemOrder.filter(iid => iid !== id);
    }

    // Remove from category if in one
    if (item.categoryId && data.itemCategories[item.categoryId]) {
      data.itemCategories[item.categoryId].itemOrder =
        data.itemCategories[item.categoryId].itemOrder.filter(iid => iid !== id);
    }

    // Delete associated tasks and taskCategories
    for (const taskId of item.taskOrder || []) {
      delete data.tasks[taskId];
    }
    for (const catId of item.categoryOrder || []) {
      delete data.taskCategories[catId];
    }

    delete data.items[id];
    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// PUT /api/tasks/move-item - Move item between sections or categories
router.put('/move-item', async (req, res) => {
  try {
    const data = await loadData(req);
    const { itemId, targetSectionId, targetCategoryId } = req.body;

    if (!data.items[itemId]) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const item = data.items[itemId];
    const oldSectionId = item.sectionId;
    const oldCategoryId = item.categoryId;

    // Remove from old location
    if (oldCategoryId && data.itemCategories[oldCategoryId]) {
      data.itemCategories[oldCategoryId].itemOrder =
        data.itemCategories[oldCategoryId].itemOrder.filter(id => id !== itemId);
    } else if (data.sections[oldSectionId]) {
      data.sections[oldSectionId].itemOrder =
        data.sections[oldSectionId].itemOrder.filter(id => id !== itemId);
    }

    // Update item's section and category
    if (targetSectionId && data.sections[targetSectionId]) {
      item.sectionId = targetSectionId;
    }
    item.categoryId = targetCategoryId || null;

    // Add to new location
    if (targetCategoryId && data.itemCategories[targetCategoryId]) {
      data.itemCategories[targetCategoryId].itemOrder.push(itemId);
    } else if (data.sections[item.sectionId]) {
      data.sections[item.sectionId].itemOrder.push(itemId);
    }

    await saveData(data, req);
    res.json(item);
  } catch (error) {
    console.error('Error moving item:', error);
    res.status(500).json({ error: 'Failed to move item' });
  }
});

// POST /api/tasks/item-category - Create item category
router.post('/item-category', async (req, res) => {
  try {
    const data = await loadData(req);
    const { sectionId, name } = req.body;

    if (!sectionId || !data.sections[sectionId]) {
      return res.status(400).json({ error: 'Valid sectionId required' });
    }

    const id = generateId('icat');
    const now = new Date().toISOString();

    const category = {
      id,
      sectionId,
      name: name || 'New Category',
      itemOrder: [],
      createdAt: now
    };

    data.itemCategories[id] = category;
    data.sections[sectionId].categoryOrder.push(id);

    await saveData(data, req);
    res.json(category);
  } catch (error) {
    console.error('Error creating item category:', error);
    res.status(500).json({ error: 'Failed to create item category' });
  }
});

// PATCH /api/tasks/item-category/:id - Update item category
router.patch('/item-category/:id', async (req, res) => {
  try {
    const data = await loadData(req);
    const { id } = req.params;

    if (!data.itemCategories[id]) {
      return res.status(404).json({ error: 'Item category not found' });
    }

    const updates = req.body;
    if (updates.name !== undefined) {
      data.itemCategories[id].name = updates.name;
    }

    await saveData(data, req);
    res.json(data.itemCategories[id]);
  } catch (error) {
    console.error('Error updating item category:', error);
    res.status(500).json({ error: 'Failed to update item category' });
  }
});

// DELETE /api/tasks/item-category/:id - Delete item category
router.delete('/item-category/:id', async (req, res) => {
  try {
    const data = await loadData(req);
    const { id } = req.params;

    if (!data.itemCategories[id]) {
      return res.status(404).json({ error: 'Item category not found' });
    }

    const category = data.itemCategories[id];
    const sectionId = category.sectionId;

    // Move items out of category to uncategorized
    for (const itemId of category.itemOrder) {
      if (data.items[itemId]) {
        data.items[itemId].categoryId = null;
        data.sections[sectionId].itemOrder.push(itemId);
      }
    }

    // Remove from section's categoryOrder
    if (data.sections[sectionId]) {
      data.sections[sectionId].categoryOrder =
        data.sections[sectionId].categoryOrder.filter(cid => cid !== id);
    }

    delete data.itemCategories[id];
    await saveData(data, req);
    res.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting item category:', error);
    res.status(500).json({ error: 'Failed to delete item category' });
  }
});

module.exports = router;
