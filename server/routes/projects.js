const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const router = express.Router();

// Store data in the project root (parent of server directory)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, '.promptflow');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// Generate unique ID
function generateId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${id}`;
}

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

// Ensure projects directory exists
async function ensureProjectsDir() {
  try {
    await fs.access(PROJECTS_DIR);
  } catch {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
  }
}

// Default projects data
function getDefaultProjectsData() {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    projects: {},
    order: []
  };
}

// Default global settings
function getDefaultSettings() {
  return {
    activeProjectId: null,
    theme: 'system'
  };
}

// Load projects metadata
async function loadProjects() {
  await ensureDataDir();
  try {
    const content = await fs.readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const defaultData = getDefaultProjectsData();
      await saveProjects(defaultData);
      return defaultData;
    }
    throw error;
  }
}

// Save projects metadata
async function saveProjects(data) {
  data.lastModified = new Date().toISOString();
  await ensureDataDir();
  const tempFile = `${PROJECTS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  await fs.rename(tempFile, PROJECTS_FILE);
}

// Load global settings
async function loadSettings() {
  await ensureDataDir();
  try {
    const content = await fs.readFile(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      const defaultSettings = getDefaultSettings();
      await saveSettings(defaultSettings);
      return defaultSettings;
    }
    throw error;
  }
}

// Save global settings
async function saveSettings(settings) {
  await ensureDataDir();
  const tempFile = `${SETTINGS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(settings, null, 2));
  await fs.rename(tempFile, SETTINGS_FILE);
}

// Get project data file path
function getProjectDataPath(projectId) {
  return path.join(PROJECTS_DIR, projectId, 'data.json');
}

// Get project directory path
function getProjectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}

// Default data structure for a project (same as current data.json structure)
function getDefaultProjectData() {
  return {
    version: 3,
    lastModified: new Date().toISOString(),
    features: {},
    bugs: {},
    tasks: {},
    categories: {},
    tags: {},
    featureCategories: {},
    bugCategories: {},
    globalFeatureOrder: [],
    globalBugOrder: [],
    featureCategoryOrder: [],
    bugCategoryOrder: [],
    settings: {
      activeView: 'features',
      activeFeatureId: null,
      theme: 'system'
    }
  };
}

// Create project directory and initialize data
async function createProjectDirectory(projectId) {
  const projectDir = getProjectDir(projectId);
  await fs.mkdir(projectDir, { recursive: true });
  await fs.mkdir(path.join(projectDir, 'attachments'), { recursive: true });

  // Initialize with default data
  const dataPath = getProjectDataPath(projectId);
  const defaultData = getDefaultProjectData();
  await fs.writeFile(dataPath, JSON.stringify(defaultData, null, 2));

  return defaultData;
}

// Check if migration is needed (old data.json at root level)
async function checkMigrationNeeded() {
  const oldDataPath = path.join(DATA_DIR, 'data.json');
  try {
    await fs.access(oldDataPath);
    // Check if we already have projects
    const projectsData = await loadProjects();
    // Migration needed if no projects exist
    return projectsData.order.length === 0;
  } catch {
    return false;
  }
}

// Migrate old data to default project
async function migrateOldData() {
  const oldDataPath = path.join(DATA_DIR, 'data.json');
  const oldAttachmentsPath = path.join(DATA_DIR, 'attachments');

  try {
    // Read old data
    const oldDataContent = await fs.readFile(oldDataPath, 'utf-8');
    const oldData = JSON.parse(oldDataContent);

    // Create default project
    const projectId = generateId('proj');
    const projectDir = getProjectDir(projectId);
    await fs.mkdir(projectDir, { recursive: true });

    // Move data
    const newDataPath = getProjectDataPath(projectId);
    await fs.writeFile(newDataPath, JSON.stringify(oldData, null, 2));

    // Move attachments if they exist
    try {
      await fs.access(oldAttachmentsPath);
      const newAttachmentsPath = path.join(projectDir, 'attachments');
      // Copy directory recursively
      await copyDirectory(oldAttachmentsPath, newAttachmentsPath);
    } catch {
      // No attachments to move
      await fs.mkdir(path.join(projectDir, 'attachments'), { recursive: true });
    }

    // Update projects.json
    const projectsData = await loadProjects();
    projectsData.projects[projectId] = {
      id: projectId,
      name: 'Default',
      color: '#3b82f6',
      createdAt: new Date().toISOString()
    };
    projectsData.order.push(projectId);
    await saveProjects(projectsData);

    // Update settings to point to new project
    const settings = await loadSettings();
    settings.activeProjectId = projectId;
    await saveSettings(settings);

    // Rename old files (backup)
    await fs.rename(oldDataPath, `${oldDataPath}.backup`);
    try {
      await fs.rename(oldAttachmentsPath, `${oldAttachmentsPath}.backup`);
    } catch {
      // No attachments to rename
    }

    return { migrated: true, projectId };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Helper to copy directory recursively
async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

// GET /api/projects - List all projects
router.get('/', async (req, res) => {
  try {
    // Check if migration is needed
    const needsMigration = await checkMigrationNeeded();
    if (needsMigration) {
      await migrateOldData();
    }

    const projectsData = await loadProjects();
    const settings = await loadSettings();

    // Return ordered list of projects
    const projects = projectsData.order.map(id => projectsData.projects[id]).filter(Boolean);

    res.json({
      projects,
      activeProjectId: settings.activeProjectId,
      count: projects.length
    });
  } catch (error) {
    console.error('Error loading projects:', error);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

// POST /api/projects - Create a new project
router.post('/', async (req, res) => {
  try {
    const { name, color } = req.body;
    const projectsData = await loadProjects();

    const projectId = generateId('proj');
    const project = {
      id: projectId,
      name: name || 'New Project',
      color: color || '#3b82f6',
      createdAt: new Date().toISOString()
    };

    // Create project directory and initialize data
    await ensureProjectsDir();
    await createProjectDirectory(projectId);

    // Add to projects metadata
    projectsData.projects[projectId] = project;
    projectsData.order.push(projectId);
    await saveProjects(projectsData);

    res.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// GET /api/projects/:id - Get project metadata
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectsData = await loadProjects();

    const project = projectsData.projects[id];
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

// PATCH /api/projects/:id - Update project metadata
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const projectsData = await loadProjects();

    if (!projectsData.projects[id]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only allow updating name and color
    if (updates.name !== undefined) {
      projectsData.projects[id].name = updates.name;
    }
    if (updates.color !== undefined) {
      projectsData.projects[id].color = updates.color;
    }

    await saveProjects(projectsData);
    res.json(projectsData.projects[id]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - Delete a project
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projectsData = await loadProjects();

    if (!projectsData.projects[id]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Don't allow deleting the last project
    if (projectsData.order.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last project' });
    }

    // Delete project directory
    const projectDir = getProjectDir(id);
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Could not delete project directory:', e.message);
    }

    // Remove from metadata
    delete projectsData.projects[id];
    projectsData.order = projectsData.order.filter(pid => pid !== id);
    await saveProjects(projectsData);

    // If this was the active project, switch to first available
    const settings = await loadSettings();
    if (settings.activeProjectId === id) {
      settings.activeProjectId = projectsData.order[0];
      await saveSettings(settings);
    }

    res.json({ deleted: true, newActiveProjectId: settings.activeProjectId });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// PUT /api/projects/reorder - Reorder projects
router.put('/reorder', async (req, res) => {
  try {
    const { order } = req.body;
    const projectsData = await loadProjects();

    // Validate all IDs exist
    if (!order.every(id => projectsData.projects[id])) {
      return res.status(400).json({ error: 'Invalid project ID in order' });
    }

    projectsData.order = order;
    await saveProjects(projectsData);

    res.json({ updated: true });
  } catch (error) {
    console.error('Error reordering projects:', error);
    res.status(500).json({ error: 'Failed to reorder projects' });
  }
});

// GET /api/projects/:id/data - Get project data (features, bugs, tasks, etc.)
router.get('/:id/data', async (req, res) => {
  try {
    const { id } = req.params;
    const projectsData = await loadProjects();

    if (!projectsData.projects[id]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const dataPath = getProjectDataPath(id);
    try {
      const content = await fs.readFile(dataPath, 'utf-8');
      const data = JSON.parse(content);
      // Add project info to response
      data._projectId = id;
      data._project = projectsData.projects[id];
      res.json(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Create default data if missing
        const defaultData = await createProjectDirectory(id);
        defaultData._projectId = id;
        defaultData._project = projectsData.projects[id];
        res.json(defaultData);
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error loading project data:', error);
    res.status(500).json({ error: 'Failed to load project data' });
  }
});

// PUT /api/projects/:id/data - Save project data
router.put('/:id/data', async (req, res) => {
  try {
    const { id } = req.params;
    const projectsData = await loadProjects();

    if (!projectsData.projects[id]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = req.body;
    data.lastModified = new Date().toISOString();

    const dataPath = getProjectDataPath(id);
    await ensureProjectsDir();

    // Ensure project directory exists
    const projectDir = getProjectDir(id);
    try {
      await fs.access(projectDir);
    } catch {
      await fs.mkdir(projectDir, { recursive: true });
    }

    const tempFile = `${dataPath}.tmp`;
    await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
    await fs.rename(tempFile, dataPath);

    res.json({ saved: true });
  } catch (error) {
    console.error('Error saving project data:', error);
    res.status(500).json({ error: 'Failed to save project data' });
  }
});

// PUT /api/projects/active - Set active project
router.put('/active', async (req, res) => {
  try {
    const { projectId } = req.body;
    const projectsData = await loadProjects();

    if (!projectsData.projects[projectId]) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const settings = await loadSettings();
    settings.activeProjectId = projectId;
    await saveSettings(settings);

    res.json({ activeProjectId: projectId });
  } catch (error) {
    console.error('Error setting active project:', error);
    res.status(500).json({ error: 'Failed to set active project' });
  }
});

// GET /api/projects/settings - Get global settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await loadSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error loading settings:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// Export helper functions for use in tasks.js
module.exports = router;
module.exports.loadProjects = loadProjects;
module.exports.loadSettings = loadSettings;
module.exports.saveSettings = saveSettings;
module.exports.getProjectDataPath = getProjectDataPath;
module.exports.getProjectDir = getProjectDir;
module.exports.checkMigrationNeeded = checkMigrationNeeded;
module.exports.migrateOldData = migrateOldData;
