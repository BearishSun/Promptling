const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const {
  loadSettings,
  loadProjects,
  saveProjects,
  getProjectDataPath,
  getProjectDir
} = require('./projects');

const router = express.Router();

// Data paths - same as tasks.js
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, '.promptflow');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');

// Legacy paths (for backward compatibility)
const LEGACY_DATA_FILE = path.join(DATA_DIR, 'data.json');
const LEGACY_ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');

// Valid statuses
const VALID_STATUSES = ['open', 'in-progress', 'done'];

// Get active project ID from explicit param, request header, or settings
async function getActiveProjectId(explicitProjectId, req) {
  if (explicitProjectId) return explicitProjectId;
  const headerProjectId = req?.headers?.['x-project-id'];
  if (headerProjectId) return headerProjectId;
  const settings = await loadSettings();
  return settings.activeProjectId;
}

// Get data file path for active project
async function getDataFilePath(explicitProjectId, req) {
  const projectId = await getActiveProjectId(explicitProjectId, req);
  if (!projectId) return LEGACY_DATA_FILE;
  return getProjectDataPath(projectId);
}

// Get attachments directory for active project
async function getAttachmentsDir(explicitProjectId, req) {
  const projectId = await getActiveProjectId(explicitProjectId, req);
  if (!projectId) return LEGACY_ATTACHMENTS_DIR;
  return path.join(getProjectDir(projectId), 'attachments');
}

// Load data helper - now project-aware (accepts explicit projectId or falls back to req/settings)
async function loadData(projectId, req) {
  const dataFile = await getDataFilePath(projectId, req);
  try {
    const content = await fs.readFile(dataFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return getDefaultData();
    }
    throw error;
  }
}

// Save data atomically - now project-aware
async function saveData(data, projectId, req) {
  data.lastModified = new Date().toISOString();
  const dataFile = await getDataFilePath(projectId, req);
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

// Common projectId property for tool schemas
const PROJECT_ID_PROP = { type: 'string', description: 'Target project ID (optional, defaults to active project)' };

// MCP Tool Definitions - 6 consolidated tools
const TOOLS = [
  {
    name: 'search',
    description: 'Search for features, bugs, or tasks by title/description.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        itemType: { type: 'string', enum: ['all', 'feature', 'bug', 'task'], description: 'Filter by type (default: all)' },
        status: { type: 'string', enum: ['open', 'in-progress', 'done'], description: 'Filter by status' },
        projectId: PROJECT_ID_PROP
      },
      required: ['query']
    }
  },
  {
    name: 'get',
    description: 'Get full details of a feature, bug, or task including sub-tasks, parent info, and attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        projectId: PROJECT_ID_PROP
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'create',
    description: 'Create a project, feature, bug, task, or category.',
    inputSchema: {
      type: 'object',
      properties: {
        itemType: { type: 'string', enum: ['project', 'feature', 'bug', 'task', 'feature-category', 'bug-category', 'task-category'], description: 'What to create' },
        title: { type: 'string', description: 'Title/name of the item' },
        description: { type: 'string', description: 'Markdown description' },
        color: { type: 'string', description: 'For project: hex color (e.g. #3b82f6)' },
        parentType: { type: 'string', enum: ['feature', 'bug'], description: 'For task/task-category: parent type' },
        parentId: { type: 'string', description: 'For task/task-category: parent ID' },
        categoryId: { type: 'string', description: 'Category to place item in' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority (features only)' },
        projectId: PROJECT_ID_PROP
      },
      required: ['itemType', 'title']
    }
  },
  {
    name: 'update',
    description: 'Update item properties, delete item, save plan, or append prompt history.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        updates: { type: 'object', description: 'Properties to update: {title, description, status, ...}' },
        action: { type: 'string', enum: ['delete', 'append_prompt', 'save_plan'], description: 'Special action' },
        promptEntry: { type: 'object', description: 'For append_prompt: {role, content}' },
        planContent: { type: 'string', description: 'For save_plan: markdown plan content' },
        projectId: PROJECT_ID_PROP
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'list',
    description: 'List projects, categories, or attachments.',
    inputSchema: {
      type: 'object',
      properties: {
        listType: { type: 'string', enum: ['projects', 'categories', 'attachments'], description: 'What to list' },
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Item type (for attachments) or category type (feature/bug for categories). Not needed for projects.' },
        id: { type: 'string', description: 'Item ID (required for attachments)' },
        projectId: PROJECT_ID_PROP
      },
      required: ['listType']
    }
  },
  {
    name: 'read',
    description: 'Read plan, attachment, image, or prompt history.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Item type' },
        id: { type: 'string', description: 'Item ID' },
        contentType: { type: 'string', enum: ['plan', 'attachment', 'image', 'prompt_history'], description: 'What to read' },
        attachmentId: { type: 'string', description: 'For attachment/image' },
        version: { type: 'number', description: 'For plan: specific version (default: latest)' },
        limit: { type: 'number', description: 'For prompt_history: max entries' },
        projectId: PROJECT_ID_PROP
      },
      required: ['type', 'id', 'contentType']
    }
  }
];

// Tool Handler Functions - 6 consolidated handlers
// Each handler now takes (args, req) to support project-scoped data
// projectId in args takes priority over req headers and settings
const toolHandlers = {
  // 1. SEARCH
  async search({ query, itemType = 'all', status, projectId }, req) {
    const data = await loadData(projectId, req);
    const results = [];
    const q = query.toLowerCase();

    const matches = (item) => {
      const titleMatch = item.title?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);
      const statusMatch = !status || item.status === status;
      return (titleMatch || descMatch) && statusMatch;
    };

    if (itemType === 'all' || itemType === 'feature') {
      Object.values(data.features).filter(matches).forEach(f =>
        results.push({ type: 'feature', id: f.id, title: f.title, status: f.status, description: f.description?.substring(0, 200) })
      );
    }
    if (itemType === 'all' || itemType === 'bug') {
      Object.values(data.bugs).filter(matches).forEach(b =>
        results.push({ type: 'bug', id: b.id, title: b.title, status: b.status || 'open', description: b.description?.substring(0, 200) })
      );
    }
    if (itemType === 'all' || itemType === 'task') {
      Object.values(data.tasks).filter(matches).forEach(t =>
        results.push({ type: 'task', id: t.id, title: t.title, status: t.status, parentType: t.parentType, parentId: t.parentId, description: t.description?.substring(0, 200) })
      );
    }
    return { results, count: results.length };
  },

  // 2. GET
  async get({ type, id, projectId }, req) {
    const data = await loadData(projectId, req);
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    const context = { ...item, type };

    if (type === 'feature' || type === 'bug') {
      const tasks = Object.values(data.tasks)
        .filter(t => t.parentType === type && t.parentId === id)
        .map(t => ({ id: t.id, title: t.title, status: t.status, description: t.description?.substring(0, 200) }));
      context.tasks = tasks;
      context.taskCount = tasks.length;
    }

    if (type === 'task' && item.parentId) {
      const parent = item.parentType === 'feature' ? data.features[item.parentId] : data.bugs[item.parentId];
      if (parent) {
        context.parent = { type: item.parentType, id: parent.id, title: parent.title };
      }
    }

    if (item.attachments?.length) {
      context.attachmentSummary = item.attachments.map(a => ({
        id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size,
        isImage: a.mimeType?.startsWith('image/'), isPlan: a.filename?.startsWith('PLAN-v')
      }));
    }
    return context;
  },

  // 3. CREATE
  async create({ itemType, title, description = '', color, parentType, parentId, categoryId, priority, projectId }, req) {
    // Project (doesn't need project-scoped data)
    if (itemType === 'project') {
      const projectsData = await loadProjects();
      const id = generateId('proj');
      const project = {
        id,
        name: title,
        color: color || '#3b82f6',
        createdAt: new Date().toISOString()
      };

      // Create project directory
      const projectDir = getProjectDir(id);
      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(path.join(projectDir, 'attachments'), { recursive: true });

      // Initialize with default data
      const defaultData = getDefaultData();
      await fs.writeFile(
        path.join(projectDir, 'data.json'),
        JSON.stringify(defaultData, null, 2)
      );

      // Add to projects metadata
      projectsData.projects[id] = project;
      projectsData.order.push(id);
      await saveProjects(projectsData);

      return project;
    }

    const data = await loadData(projectId, req);

    // Feature
    if (itemType === 'feature') {
      const id = generateId('feat');
      const feature = {
        id, title, description, status: 'open', priority: priority || 'medium',
        createdAt: new Date().toISOString(), finishedAt: null,
        taskOrder: [], categoryOrder: [], categoryId: categoryId || null
      };
      data.features[id] = feature;
      if (categoryId && data.featureCategories?.[categoryId]) {
        data.featureCategories[categoryId].featureOrder.push(id);
      } else {
        data.globalFeatureOrder.push(id);
      }
      await saveData(data, projectId, req);
      return feature;
    }

    // Bug
    if (itemType === 'bug') {
      const id = generateId('bug');
      const bug = {
        id, title, description, status: 'open',
        createdAt: new Date().toISOString(), finishedAt: null,
        taskOrder: [], categoryOrder: [], categoryId: categoryId || null
      };
      data.bugs[id] = bug;
      if (categoryId && data.bugCategories?.[categoryId]) {
        data.bugCategories[categoryId].bugOrder.push(id);
      } else {
        data.globalBugOrder.push(id);
      }
      await saveData(data, projectId, req);
      return bug;
    }

    // Task
    if (itemType === 'task') {
      if (!parentType || !parentId) throw new Error('parentType and parentId required for task');
      const parent = parentType === 'feature' ? data.features[parentId] : data.bugs[parentId];
      if (!parent) throw new Error(`Parent ${parentType} with ID ${parentId} not found`);

      const id = generateId('task');
      const task = {
        id, parentType, parentId, categoryId: categoryId || null,
        title, description, status: 'open', tagIds: [],
        createdAt: new Date().toISOString(), finishedAt: null
      };
      data.tasks[id] = task;
      if (categoryId && data.categories[categoryId]) {
        data.categories[categoryId].taskOrder.push(id);
      } else {
        parent.taskOrder.push(id);
      }
      await saveData(data, projectId, req);
      return task;
    }

    // Categories
    if (itemType === 'feature-category') {
      if (!data.featureCategories) data.featureCategories = {};
      if (!data.featureCategoryOrder) data.featureCategoryOrder = [];
      const id = generateId('fcat');
      const category = { id, name: title, featureOrder: [] };
      data.featureCategories[id] = category;
      data.featureCategoryOrder.push(id);
      await saveData(data, projectId, req);
      return category;
    }

    if (itemType === 'bug-category') {
      if (!data.bugCategories) data.bugCategories = {};
      if (!data.bugCategoryOrder) data.bugCategoryOrder = [];
      const id = generateId('bcat');
      const category = { id, name: title, bugOrder: [] };
      data.bugCategories[id] = category;
      data.bugCategoryOrder.push(id);
      await saveData(data, projectId, req);
      return category;
    }

    if (itemType === 'task-category') {
      if (!parentType || !parentId) throw new Error('parentType and parentId required for task-category');
      const parent = parentType === 'feature' ? data.features[parentId] : data.bugs[parentId];
      if (!parent) throw new Error(`Parent ${parentType} with ID ${parentId} not found`);

      const id = generateId('cat');
      const category = { id, parentType, parentId, name: title, taskOrder: [] };
      data.categories[id] = category;
      if (!parent.categoryOrder) parent.categoryOrder = [];
      parent.categoryOrder.push(id);
      await saveData(data, projectId, req);
      return category;
    }

    throw new Error(`Invalid itemType: ${itemType}`);
  },

  // 4. UPDATE (includes delete, append_prompt, save_plan)
  async update({ type, id, updates, action, promptEntry, planContent, projectId }, req) {
    const data = await loadData(projectId, req);

    // Delete action
    if (action === 'delete') {
      if (type === 'feature') {
        if (!data.features[id]) throw new Error(`Feature ${id} not found`);
        const feature = data.features[id];
        for (const taskId of feature.taskOrder || []) delete data.tasks[taskId];
        delete data.features[id];
        data.globalFeatureOrder = data.globalFeatureOrder.filter(fid => fid !== id);
        Object.values(data.featureCategories || {}).forEach(cat => {
          cat.featureOrder = (cat.featureOrder || []).filter(fid => fid !== id);
        });
      } else if (type === 'bug') {
        if (!data.bugs[id]) throw new Error(`Bug ${id} not found`);
        const bug = data.bugs[id];
        for (const taskId of bug.taskOrder || []) delete data.tasks[taskId];
        delete data.bugs[id];
        data.globalBugOrder = data.globalBugOrder.filter(bid => bid !== id);
        Object.values(data.bugCategories || {}).forEach(cat => {
          cat.bugOrder = (cat.bugOrder || []).filter(bid => bid !== id);
        });
      } else if (type === 'task') {
        if (!data.tasks[id]) throw new Error(`Task ${id} not found`);
        const task = data.tasks[id];
        if (task.categoryId && data.categories[task.categoryId]) {
          data.categories[task.categoryId].taskOrder = data.categories[task.categoryId].taskOrder.filter(tid => tid !== id);
        } else if (task.parentId) {
          const parent = task.parentType === 'feature' ? data.features[task.parentId] : data.bugs[task.parentId];
          if (parent) parent.taskOrder = parent.taskOrder.filter(tid => tid !== id);
        }
        delete data.tasks[id];
      }
      await saveData(data, projectId, req);
      return { deleted: true, type, id };
    }

    // Append prompt action
    if (action === 'append_prompt') {
      let item;
      switch (type) {
        case 'feature': item = data.features[id]; break;
        case 'bug': item = data.bugs[id]; break;
        case 'task': item = data.tasks[id]; break;
      }
      if (!item) throw new Error(`${type} with ID ${id} not found`);
      if (!promptEntry?.role || !promptEntry?.content) {
        throw new Error('promptEntry with role and content required');
      }
      if (!item.promptHistory) item.promptHistory = [];
      const entry = { id: generateId('ph'), timestamp: new Date().toISOString(), role: promptEntry.role, content: promptEntry.content };
      item.promptHistory.push(entry);
      await saveData(data, projectId, req);
      return { added: true, entryId: entry.id, totalCount: item.promptHistory.length };
    }

    // Save plan action
    if (action === 'save_plan') {
      let item;
      switch (type) {
        case 'feature': item = data.features[id]; break;
        case 'bug': item = data.bugs[id]; break;
        case 'task': item = data.tasks[id]; break;
      }
      if (!item) throw new Error(`${type} with ID ${id} not found`);
      if (!planContent) throw new Error('planContent required for save_plan action');

      const existingPlans = (item.attachments || []).filter(a => a.filename?.startsWith('PLAN-v'));
      const version = existingPlans.length + 1;
      const filename = `PLAN-v${version}.md`;

      const attachmentsDir = await getAttachmentsDir(projectId, req);
      const itemDir = path.join(attachmentsDir, type, id);
      await fs.mkdir(itemDir, { recursive: true });
      await fs.writeFile(path.join(itemDir, filename), planContent, 'utf-8');

      const storedPath = `${type}/${id}/${filename}`;
      const fullPath = path.join(itemDir, filename);
      const attachment = {
        id: generateId('att'), filename, storedName: filename,
        storedPath, mimeType: 'text/markdown',
        size: Buffer.byteLength(planContent, 'utf-8'), uploadedAt: new Date().toISOString()
      };
      if (!item.attachments) item.attachments = [];
      item.attachments.push(attachment);
      await saveData(data, projectId, req);
      return { saved: true, version, filename, attachmentId: attachment.id, totalVersions: version, path: fullPath };
    }

    // Regular update
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    if (updates?.status) {
      if (!VALID_STATUSES.includes(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
      }
      if (updates.status === 'done' && !item.finishedAt) {
        updates.finishedAt = new Date().toISOString();
      } else if (updates.status !== 'done') {
        updates.finishedAt = null;
      }
    }
    Object.assign(item, updates);
    await saveData(data, projectId, req);
    return item;
  },

  // 5. LIST (categories, attachments, or projects)
  async list({ listType, type, id, projectId }, req) {
    // Projects don't need project-scoped data
    if (listType === 'projects') {
      const projectsData = await loadProjects();
      const settings = await loadSettings();
      return {
        projects: projectsData.order.map(id => projectsData.projects[id]).filter(Boolean),
        activeProjectId: settings.activeProjectId,
        count: projectsData.order.length
      };
    }

    const data = await loadData(projectId, req);

    if (listType === 'categories') {
      if (type === 'feature') {
        return { categories: Object.values(data.featureCategories || {}).map(c => ({ id: c.id, name: c.name, itemCount: c.featureOrder?.length || 0 })) };
      } else if (type === 'bug') {
        return { categories: Object.values(data.bugCategories || {}).map(c => ({ id: c.id, name: c.name, itemCount: c.bugOrder?.length || 0 })) };
      }
      throw new Error('type must be feature or bug for categories');
    }

    if (listType === 'attachments') {
      if (!id) throw new Error('id required for attachments');
      let item;
      switch (type) {
        case 'feature': item = data.features[id]; break;
        case 'bug': item = data.bugs[id]; break;
        case 'task': item = data.tasks[id]; break;
      }
      if (!item) throw new Error(`${type} with ID ${id} not found`);
      return {
        attachments: (item.attachments || []).map(a => ({
          id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size,
          uploadedAt: a.uploadedAt, isImage: a.mimeType?.startsWith('image/'), isPlan: a.filename?.startsWith('PLAN-v')
        })),
        count: item.attachments?.length || 0
      };
    }

    throw new Error(`Invalid listType: ${listType}`);
  },

  // 6. READ (plan, attachment, image, prompt_history)
  async read({ type, id, contentType, attachmentId, version, limit, projectId }, req) {
    const data = await loadData(projectId, req);
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    // Plan
    if (contentType === 'plan') {
      const plans = (item.attachments || [])
        .filter(a => a.filename?.startsWith('PLAN-v'))
        .sort((a, b) => {
          const vA = parseInt(a.filename.match(/PLAN-v(\d+)/)?.[1] || 0);
          const vB = parseInt(b.filename.match(/PLAN-v(\d+)/)?.[1] || 0);
          return vB - vA;
        });

      const versions = plans.map(a => ({
        version: parseInt(a.filename.match(/PLAN-v(\d+)/)?.[1]),
        filename: a.filename, attachmentId: a.id, uploadedAt: a.uploadedAt
      }));

      if (plans.length === 0) {
        return { exists: false, versions: [], message: 'No plan exists' };
      }

      let targetPlan;
      if (version) {
        targetPlan = plans.find(p => p.filename === `PLAN-v${version}.md`);
        if (!targetPlan) throw new Error(`Plan version ${version} not found`);
      } else {
        targetPlan = plans[0];
      }

      const attachmentsDir = await getAttachmentsDir(projectId, req);
      const filePath = path.join(attachmentsDir, targetPlan.storedPath);
      const content = await fs.readFile(filePath, 'utf-8');
      return { exists: true, version: parseInt(targetPlan.filename.match(/PLAN-v(\d+)/)?.[1]), filename: targetPlan.filename, content, versions };
    }

    // Prompt history
    if (contentType === 'prompt_history') {
      let history = item.promptHistory || [];
      if (limit && limit > 0) history = history.slice(-limit);
      return { history, count: history.length, totalCount: item.promptHistory?.length || 0 };
    }

    // Attachment or image
    if (!attachmentId) throw new Error('attachmentId required for attachment/image');
    const attachment = (item.attachments || []).find(a => a.id === attachmentId);
    if (!attachment) throw new Error(`Attachment ${attachmentId} not found`);

    const attachmentsDir = await getAttachmentsDir(projectId, req);
    const filePath = path.join(attachmentsDir, attachment.storedPath);

    if (contentType === 'image') {
      if (!attachment.mimeType?.startsWith('image/')) throw new Error('Attachment is not an image');
      const buffer = await fs.readFile(filePath);
      return { filename: attachment.filename, mimeType: attachment.mimeType, size: attachment.size, data: buffer.toString('base64') };
    }

    // Text attachment
    if (attachment.mimeType?.startsWith('image/')) throw new Error('Use contentType="image" for image attachments');
    const content = await fs.readFile(filePath, 'utf-8');
    return { filename: attachment.filename, mimeType: attachment.mimeType, content };
  }
};

// MCP JSON-RPC Handler
router.post('/', async (req, res) => {
  const { jsonrpc, id, method, params } = req.body;

  // Validate JSON-RPC format
  if (jsonrpc !== '2.0') {
    return res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request - must use JSON-RPC 2.0' }
    });
  }

  try {
    let result;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'promptflow-mcp',
            version: '1.0.0'
          }
        };
        break;

      case 'tools/list':
        result = { tools: TOOLS };
        break;

      case 'tools/call':
        const { name, arguments: args } = params;
        const handler = toolHandlers[name];
        if (!handler) {
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown tool: ${name}` }
          });
        }

        try {
          // Pass req as second argument to handlers for project-scoped data
          const toolResult = await handler(args || {}, req);
          result = {
            content: [
              {
                type: 'text',
                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
              }
            ]
          };
        } catch (toolError) {
          result = {
            isError: true,
            content: [
              {
                type: 'text',
                text: `Error: ${toolError.message}`
              }
            ]
          };
        }
        break;

      case 'notifications/initialized':
        // Client is ready - just acknowledge
        return res.json({ jsonrpc: '2.0', id, result: {} });

      default:
        return res.json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
    }

    res.json({ jsonrpc: '2.0', id, result });

  } catch (error) {
    console.error('MCP error:', error);
    res.json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: error.message }
    });
  }
});

// Health check for MCP endpoint
router.get('/', (req, res) => {
  res.json({
    name: 'promptflow-mcp',
    version: '1.0.0',
    status: 'ok',
    toolCount: TOOLS.length,
    endpoint: 'POST /api/mcp'
  });
});

module.exports = router;
