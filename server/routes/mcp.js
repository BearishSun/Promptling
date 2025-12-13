const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const router = express.Router();

// Data paths - same as tasks.js
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, '.promptflow');
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const ATTACHMENTS_DIR = path.join(DATA_DIR, 'attachments');

// Valid statuses
const VALID_STATUSES = ['open', 'in-progress', 'done'];

// Load data helper
async function loadData() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return getDefaultData();
    }
    throw error;
  }
}

// Save data atomically
async function saveData(data) {
  data.lastModified = new Date().toISOString();
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(data, null, 2));
  await fs.rename(tempFile, DATA_FILE);
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

// MCP Tool Definitions
const TOOLS = [
  // Search & Query Tools
  {
    name: 'search_items',
    description: 'Search for features, bugs, or tasks by title or description. Returns matching items with their IDs, titles, and statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query to match against titles and descriptions' },
        type: { type: 'string', enum: ['all', 'feature', 'bug', 'task'], description: 'Type of items to search (default: all)' },
        status: { type: 'string', enum: ['open', 'in-progress', 'done'], description: 'Filter by status' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_item',
    description: 'Get full details of a specific feature, bug, or task by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' }
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'get_item_context',
    description: 'Get full context for an item including its description, all attachments metadata, sub-tasks (for features/bugs), and prompt history. Use this before implementing a task.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' }
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'list_categories',
    description: 'List all categories for features or bugs.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug'], description: 'Type of categories to list' }
      },
      required: ['type']
    }
  },

  // CRUD Tools
  {
    name: 'create_feature',
    description: 'Create a new feature. Returns the created feature object.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the feature' },
        description: { type: 'string', description: 'Markdown description of the feature' },
        categoryId: { type: 'string', description: 'ID of the feature category to place it in (optional)' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority level' }
      },
      required: ['title']
    }
  },
  {
    name: 'create_bug',
    description: 'Create a new bug. Returns the created bug object.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the bug' },
        description: { type: 'string', description: 'Markdown description of the bug' },
        categoryId: { type: 'string', description: 'ID of the bug category to place it in (optional)' }
      },
      required: ['title']
    }
  },
  {
    name: 'create_task',
    description: 'Create a new task under a feature or bug. Returns the created task object.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the task' },
        parentType: { type: 'string', enum: ['feature', 'bug'], description: 'Type of parent (feature or bug)' },
        parentId: { type: 'string', description: 'ID of the parent feature or bug' },
        description: { type: 'string', description: 'Markdown description of the task' },
        categoryId: { type: 'string', description: 'ID of task category within the parent (optional)' }
      },
      required: ['title', 'parentType', 'parentId']
    }
  },
  {
    name: 'create_category',
    description: 'Create a new category for features, bugs, or tasks within a feature/bug.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the category' },
        type: { type: 'string', enum: ['feature-category', 'bug-category', 'task-category'], description: 'Type of category' },
        parentType: { type: 'string', enum: ['feature', 'bug'], description: 'For task-category: parent type' },
        parentId: { type: 'string', description: 'For task-category: parent ID' }
      },
      required: ['name', 'type']
    }
  },
  {
    name: 'update_item',
    description: 'Update properties of a feature, bug, or task.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        updates: {
          type: 'object',
          description: 'Object with properties to update (e.g., {title: "New title", description: "New desc"})'
        }
      },
      required: ['type', 'id', 'updates']
    }
  },
  {
    name: 'delete_item',
    description: 'Delete a feature, bug, or task. Warning: Deleting a feature/bug also deletes all its tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item to delete' }
      },
      required: ['type', 'id']
    }
  },

  // Status Tools
  {
    name: 'set_status',
    description: 'Set the status of a feature, bug, or task.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        status: { type: 'string', enum: ['open', 'in-progress', 'done'], description: 'New status' }
      },
      required: ['type', 'id', 'status']
    }
  },
  {
    name: 'mark_in_progress',
    description: 'Mark a feature, bug, or task as in-progress. Shortcut for set_status with status="in-progress".',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' }
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'mark_done',
    description: 'Mark a feature, bug, or task as done. Shortcut for set_status with status="done". Also sets finishedAt timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' }
      },
      required: ['type', 'id']
    }
  },

  // Plan Management Tools
  {
    name: 'create_plan',
    description: 'Create an implementation plan for a feature, bug, or task. Stores as a markdown attachment named PLAN-v1.md.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        content: { type: 'string', description: 'Markdown content of the plan' }
      },
      required: ['type', 'id', 'content']
    }
  },
  {
    name: 'get_plan',
    description: 'Get the current implementation plan for an item. Returns the plan content if it exists.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        version: { type: 'number', description: 'Specific version number (default: latest)' }
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'update_plan',
    description: 'Update/iterate on an existing plan. Creates a new version (PLAN-v2.md, etc.) preserving history.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        content: { type: 'string', description: 'New plan content' },
        changeDescription: { type: 'string', description: 'Brief description of what changed' }
      },
      required: ['type', 'id', 'content']
    }
  },
  {
    name: 'list_plan_versions',
    description: 'List all plan versions for an item.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' }
      },
      required: ['type', 'id']
    }
  },

  // Attachment Tools
  {
    name: 'list_attachments',
    description: 'List all attachments for a feature, bug, or task.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' }
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'read_attachment',
    description: 'Read the content of a text or markdown attachment.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        attachmentId: { type: 'string', description: 'ID of the attachment' }
      },
      required: ['type', 'id', 'attachmentId']
    }
  },
  {
    name: 'read_image',
    description: 'Read an image attachment. Returns base64-encoded image data suitable for vision analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        attachmentId: { type: 'string', description: 'ID of the attachment' }
      },
      required: ['type', 'id', 'attachmentId']
    }
  },

  // Prompt History Tools
  {
    name: 'get_prompt_history',
    description: 'Get the conversation/prompt history for an item.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        limit: { type: 'number', description: 'Maximum number of entries to return (default: all)' }
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'append_prompt_history',
    description: 'Add an entry to the prompt history for an item.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['feature', 'bug', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        role: { type: 'string', enum: ['user', 'assistant'], description: 'Role of the message' },
        content: { type: 'string', description: 'Message content' }
      },
      required: ['type', 'id', 'role', 'content']
    }
  }
];

// Tool Handler Functions
const toolHandlers = {
  // Search & Query
  async search_items({ query, type = 'all', status }) {
    const data = await loadData();
    const results = [];
    const q = query.toLowerCase();

    const matches = (item) => {
      const titleMatch = item.title?.toLowerCase().includes(q);
      const descMatch = item.description?.toLowerCase().includes(q);
      const statusMatch = !status || item.status === status;
      return (titleMatch || descMatch) && statusMatch;
    };

    if (type === 'all' || type === 'feature') {
      Object.values(data.features).filter(matches).forEach(f =>
        results.push({ type: 'feature', id: f.id, title: f.title, status: f.status, description: f.description?.substring(0, 200) })
      );
    }
    if (type === 'all' || type === 'bug') {
      Object.values(data.bugs).filter(matches).forEach(b =>
        results.push({ type: 'bug', id: b.id, title: b.title, status: b.status || 'open', description: b.description?.substring(0, 200) })
      );
    }
    if (type === 'all' || type === 'task') {
      Object.values(data.tasks).filter(matches).forEach(t =>
        results.push({ type: 'task', id: t.id, title: t.title, status: t.status, parentType: t.parentType, parentId: t.parentId, description: t.description?.substring(0, 200) })
      );
    }

    return { results, count: results.length };
  },

  async get_item({ type, id }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);
    return { ...item, type };
  },

  async get_item_context({ type, id }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    const context = { ...item, type };

    // Add sub-tasks for features/bugs
    if (type === 'feature' || type === 'bug') {
      const tasks = Object.values(data.tasks)
        .filter(t => t.parentType === type && t.parentId === id)
        .map(t => ({ id: t.id, title: t.title, status: t.status, description: t.description?.substring(0, 200) }));
      context.tasks = tasks;
      context.taskCount = tasks.length;
    }

    // Add parent info for tasks
    if (type === 'task' && item.parentId) {
      const parent = item.parentType === 'feature' ? data.features[item.parentId] : data.bugs[item.parentId];
      if (parent) {
        context.parent = { type: item.parentType, id: parent.id, title: parent.title };
      }
    }

    // Summarize attachments
    if (item.attachments?.length) {
      context.attachmentSummary = item.attachments.map(a => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        isImage: a.mimeType?.startsWith('image/'),
        isPlan: a.filename?.startsWith('PLAN-v')
      }));
    }

    return context;
  },

  async list_categories({ type }) {
    const data = await loadData();
    if (type === 'feature') {
      return Object.values(data.featureCategories || {}).map(c => ({
        id: c.id, name: c.name, featureCount: c.featureOrder?.length || 0
      }));
    } else {
      return Object.values(data.bugCategories || {}).map(c => ({
        id: c.id, name: c.name, bugCount: c.bugOrder?.length || 0
      }));
    }
  },

  // CRUD
  async create_feature({ title, description = '', categoryId, priority }) {
    const data = await loadData();
    const id = generateId('feat');
    const feature = {
      id,
      title,
      description,
      status: 'open',
      priority: priority || 'medium',
      createdAt: new Date().toISOString(),
      finishedAt: null,
      taskOrder: [],
      categoryOrder: [],
      categoryId: categoryId || null
    };
    data.features[id] = feature;

    if (categoryId && data.featureCategories?.[categoryId]) {
      data.featureCategories[categoryId].featureOrder.push(id);
    } else {
      data.globalFeatureOrder.push(id);
    }

    await saveData(data);
    return feature;
  },

  async create_bug({ title, description = '', categoryId }) {
    const data = await loadData();
    const id = generateId('bug');
    const bug = {
      id,
      title,
      description,
      status: 'open', // Now bugs have status too
      createdAt: new Date().toISOString(),
      finishedAt: null,
      taskOrder: [],
      categoryOrder: [],
      categoryId: categoryId || null
    };
    data.bugs[id] = bug;

    if (categoryId && data.bugCategories?.[categoryId]) {
      data.bugCategories[categoryId].bugOrder.push(id);
    } else {
      data.globalBugOrder.push(id);
    }

    await saveData(data);
    return bug;
  },

  async create_task({ title, parentType, parentId, description = '', categoryId }) {
    const data = await loadData();
    const parent = parentType === 'feature' ? data.features[parentId] : data.bugs[parentId];
    if (!parent) throw new Error(`Parent ${parentType} with ID ${parentId} not found`);

    const id = generateId('task');
    const task = {
      id,
      parentType,
      parentId,
      categoryId: categoryId || null,
      title,
      description,
      status: 'open',
      tagIds: [],
      createdAt: new Date().toISOString(),
      finishedAt: null
    };
    data.tasks[id] = task;

    if (categoryId && data.categories[categoryId]) {
      data.categories[categoryId].taskOrder.push(id);
    } else {
      parent.taskOrder.push(id);
    }

    await saveData(data);
    return task;
  },

  async create_category({ name, type, parentType, parentId }) {
    const data = await loadData();

    if (type === 'feature-category') {
      if (!data.featureCategories) data.featureCategories = {};
      if (!data.featureCategoryOrder) data.featureCategoryOrder = [];
      const id = generateId('fcat');
      const category = { id, name, featureOrder: [] };
      data.featureCategories[id] = category;
      data.featureCategoryOrder.push(id);
      await saveData(data);
      return category;
    } else if (type === 'bug-category') {
      if (!data.bugCategories) data.bugCategories = {};
      if (!data.bugCategoryOrder) data.bugCategoryOrder = [];
      const id = generateId('bcat');
      const category = { id, name, bugOrder: [] };
      data.bugCategories[id] = category;
      data.bugCategoryOrder.push(id);
      await saveData(data);
      return category;
    } else if (type === 'task-category') {
      if (!parentType || !parentId) throw new Error('parentType and parentId required for task-category');
      const parent = parentType === 'feature' ? data.features[parentId] : data.bugs[parentId];
      if (!parent) throw new Error(`Parent ${parentType} with ID ${parentId} not found`);

      const id = generateId('cat');
      const category = { id, parentType, parentId, name, taskOrder: [] };
      data.categories[id] = category;
      if (!parent.categoryOrder) parent.categoryOrder = [];
      parent.categoryOrder.push(id);
      await saveData(data);
      return category;
    }
    throw new Error(`Invalid category type: ${type}`);
  },

  async update_item({ type, id, updates }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    Object.assign(item, updates);
    await saveData(data);
    return item;
  },

  async delete_item({ type, id }) {
    const data = await loadData();

    if (type === 'feature') {
      if (!data.features[id]) throw new Error(`Feature ${id} not found`);
      // Delete associated tasks
      const feature = data.features[id];
      for (const taskId of feature.taskOrder || []) {
        delete data.tasks[taskId];
      }
      delete data.features[id];
      data.globalFeatureOrder = data.globalFeatureOrder.filter(fid => fid !== id);
    } else if (type === 'bug') {
      if (!data.bugs[id]) throw new Error(`Bug ${id} not found`);
      const bug = data.bugs[id];
      for (const taskId of bug.taskOrder || []) {
        delete data.tasks[taskId];
      }
      delete data.bugs[id];
      data.globalBugOrder = data.globalBugOrder.filter(bid => bid !== id);
    } else if (type === 'task') {
      if (!data.tasks[id]) throw new Error(`Task ${id} not found`);
      const task = data.tasks[id];
      // Remove from parent
      if (task.categoryId && data.categories[task.categoryId]) {
        data.categories[task.categoryId].taskOrder =
          data.categories[task.categoryId].taskOrder.filter(tid => tid !== id);
      } else if (task.parentId) {
        const parent = task.parentType === 'feature' ? data.features[task.parentId] : data.bugs[task.parentId];
        if (parent) {
          parent.taskOrder = parent.taskOrder.filter(tid => tid !== id);
        }
      }
      delete data.tasks[id];
    }

    await saveData(data);
    return { deleted: true, type, id };
  },

  // Status
  async set_status({ type, id, status }) {
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    item.status = status;
    if (status === 'done' && !item.finishedAt) {
      item.finishedAt = new Date().toISOString();
    } else if (status !== 'done') {
      item.finishedAt = null;
    }

    await saveData(data);
    return { id, type, status: item.status, finishedAt: item.finishedAt };
  },

  async mark_in_progress({ type, id }) {
    return toolHandlers.set_status({ type, id, status: 'in-progress' });
  },

  async mark_done({ type, id }) {
    return toolHandlers.set_status({ type, id, status: 'done' });
  },

  // Plan Management
  async create_plan({ type, id, content }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    // Check for existing plans
    const existingPlans = (item.attachments || []).filter(a => a.filename?.startsWith('PLAN-v'));
    const version = existingPlans.length + 1;
    const filename = `PLAN-v${version}.md`;

    // Create directory and file
    const itemDir = path.join(ATTACHMENTS_DIR, type, id);
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

    await saveData(data);
    return { created: true, version, filename, attachmentId: attachment.id };
  },

  async get_plan({ type, id, version }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    const plans = (item.attachments || [])
      .filter(a => a.filename?.startsWith('PLAN-v'))
      .sort((a, b) => {
        const vA = parseInt(a.filename.match(/PLAN-v(\d+)/)?.[1] || 0);
        const vB = parseInt(b.filename.match(/PLAN-v(\d+)/)?.[1] || 0);
        return vB - vA; // Descending
      });

    if (plans.length === 0) {
      return { exists: false, message: 'No plan exists for this item' };
    }

    let targetPlan;
    if (version) {
      targetPlan = plans.find(p => p.filename === `PLAN-v${version}.md`);
      if (!targetPlan) throw new Error(`Plan version ${version} not found`);
    } else {
      targetPlan = plans[0]; // Latest
    }

    const filePath = path.join(ATTACHMENTS_DIR, targetPlan.storedPath);
    const content = await fs.readFile(filePath, 'utf-8');

    return {
      exists: true,
      version: parseInt(targetPlan.filename.match(/PLAN-v(\d+)/)?.[1]),
      filename: targetPlan.filename,
      content,
      totalVersions: plans.length
    };
  },

  async update_plan({ type, id, content, changeDescription }) {
    // Create new version
    const result = await toolHandlers.create_plan({ type, id, content });
    return { ...result, changeDescription };
  },

  async list_plan_versions({ type, id }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

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

    return { versions: plans, count: plans.length };
  },

  // Attachments
  async list_attachments({ type, id }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    return {
      attachments: (item.attachments || []).map(a => ({
        id: a.id,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        uploadedAt: a.uploadedAt,
        isImage: a.mimeType?.startsWith('image/'),
        isPlan: a.filename?.startsWith('PLAN-v')
      })),
      count: item.attachments?.length || 0
    };
  },

  async read_attachment({ type, id, attachmentId }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    const attachment = (item.attachments || []).find(a => a.id === attachmentId);
    if (!attachment) throw new Error(`Attachment ${attachmentId} not found`);

    if (attachment.mimeType?.startsWith('image/')) {
      throw new Error('Use read_image for image attachments');
    }

    const filePath = path.join(ATTACHMENTS_DIR, attachment.storedPath);
    const content = await fs.readFile(filePath, 'utf-8');

    return { filename: attachment.filename, mimeType: attachment.mimeType, content };
  },

  async read_image({ type, id, attachmentId }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    const attachment = (item.attachments || []).find(a => a.id === attachmentId);
    if (!attachment) throw new Error(`Attachment ${attachmentId} not found`);

    if (!attachment.mimeType?.startsWith('image/')) {
      throw new Error('Attachment is not an image. Use read_attachment for text files.');
    }

    const filePath = path.join(ATTACHMENTS_DIR, attachment.storedPath);
    const buffer = await fs.readFile(filePath);
    const base64 = buffer.toString('base64');

    return {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
      data: base64
    };
  },

  // Prompt History
  async get_prompt_history({ type, id, limit }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    let history = item.promptHistory || [];
    if (limit && limit > 0) {
      history = history.slice(-limit);
    }

    return { history, count: history.length, totalCount: item.promptHistory?.length || 0 };
  },

  async append_prompt_history({ type, id, role, content }) {
    const data = await loadData();
    let item;
    switch (type) {
      case 'feature': item = data.features[id]; break;
      case 'bug': item = data.bugs[id]; break;
      case 'task': item = data.tasks[id]; break;
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    if (!item.promptHistory) item.promptHistory = [];

    const entry = {
      id: generateId('ph'),
      timestamp: new Date().toISOString(),
      role,
      content
    };

    item.promptHistory.push(entry);
    await saveData(data);

    return { added: true, entryId: entry.id, totalCount: item.promptHistory.length };
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
            name: 'tasklist-mcp',
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
          const toolResult = await handler(args || {});
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
    name: 'tasklist-mcp',
    version: '1.0.0',
    status: 'ok',
    toolCount: TOOLS.length,
    endpoint: 'POST /api/mcp'
  });
});

module.exports = router;
