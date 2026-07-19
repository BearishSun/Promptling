const express = require('express');
const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest
} = require('@modelcontextprotocol/sdk/types.js');
const {
  loadSettings,
  loadProjects,
  saveProjects
} = require('./projects');
const projectStore = require('../storage/projectStore');

const router = express.Router();

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

async function requireActiveProjectId(explicitProjectId, req) {
  const id = await getActiveProjectId(explicitProjectId, req);
  if (!id) {
    throw new Error('No active project (pass projectId, set X-Project-ID header, or configure activeProjectId)');
  }
  return id;
}

// Load and save go through the project store, which owns split-file storage
// and v3/v4 → v5 migration. Both helpers continue to take (projectId, req).
async function loadData(projectId, req) {
  const id = await requireActiveProjectId(projectId, req);
  return projectStore.loadProjectData(id);
}
async function saveData(data, projectId, req) {
  const id = await requireActiveProjectId(projectId, req);
  return projectStore.saveProjectData(id, data);
}

const getDefaultData = projectStore.getDefaultData;

// Generate unique ID
function generateId(prefix) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}-${id}`;
}

// System section IDs (re-exported from projectStore so both modules agree)
const SYSTEM_SECTIONS = projectStore.SYSTEM_SECTIONS;

// Common projectId property for tool schemas
const PROJECT_ID_PROP = { type: 'string', description: 'Target project ID (optional, defaults to active project)' };

// MCP Tool Definitions - 6 consolidated tools (v4 unified types only)
const TOOLS = [
  {
    name: 'search',
    description: 'Search for features, bugs, or tasks by title/description.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        itemType: { type: 'string', enum: ['all', 'item', 'task'], description: 'Filter by type (default: all)' },
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
        type: { type: 'string', enum: ['item', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        projectId: PROJECT_ID_PROP
      },
      required: ['type', 'id']
    }
  },
  {
    name: 'create',
    description: 'Create a project, item, task, or category.',
    inputSchema: {
      type: 'object',
      properties: {
        itemType: { type: 'string', enum: ['project', 'item', 'task', 'item-category', 'task-category'], description: 'What to create (item/item-category require sectionId)' },
        title: { type: 'string', description: 'Title/name of the item' },
        description: { type: 'string', description: 'Markdown description' },
        color: { type: 'string', description: 'For project: hex color (e.g. #3b82f6)' },
        sectionId: { type: 'string', description: 'For item/item-category: target section ID (sect-features or sect-bugs)' },
        parentId: { type: 'string', description: 'For task/task-category: parent item ID' },
        categoryId: { type: 'string', description: 'Category to place item in' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Priority (items only)' },
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
        type: { type: 'string', enum: ['item', 'task'], description: 'Type of item' },
        id: { type: 'string', description: 'ID of the item' },
        updates: { type: 'object', description: 'Properties to update: {title, description, status, ...}' },
        action: { type: 'string', enum: ['delete', 'append_prompt', 'save_plan'], description: 'Special action' },
        promptEntry: { type: 'object', description: 'For append_prompt: {role, title, description} - title is short summary, description is verbose details' },
        planContent: { type: 'string', description: 'For save_plan: markdown plan content' },
        planPath: { type: 'string', description: 'For save_plan: local file path or URL to plan content (alternative to planContent)' },
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
        type: { type: 'string', enum: ['item', 'task'], description: 'Item type (for attachments). Not needed for projects or categories.' },
        id: { type: 'string', description: 'Item ID (required for attachments)' },
        sectionId: { type: 'string', description: 'For categories: section ID (sect-features or sect-bugs)' },
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
        type: { type: 'string', enum: ['item', 'task'], description: 'Item type' },
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
// Uses v4 unified data structure (items + tasks)
const toolHandlers = {
  // 1. SEARCH (v4: searches items and tasks)
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

    // Search items
    if (itemType === 'all' || itemType === 'item') {
      Object.values(data.items)
        .filter(matches)
        .forEach(item => results.push({
          type: 'item', id: item.id, title: item.title, status: item.status,
          sectionId: item.sectionId,
          description: item.description?.substring(0, 200)
        }));
    }
    // Search tasks
    if (itemType === 'all' || itemType === 'task') {
      Object.values(data.tasks).filter(matches).forEach(t => {
        results.push({
          type: 'task', id: t.id, title: t.title, status: t.status,
          parentId: t.itemId, description: t.description?.substring(0, 200)
        });
      });
    }
    return { results, count: results.length };
  },

  // 2. GET (v4: uses items and tasks)
  async get({ type, id, projectId }, req) {
    const data = await loadData(projectId, req);
    let item;

    if (type === 'item') {
      item = data.items[id];
    } else if (type === 'task') {
      item = data.tasks[id];
    }
    if (!item) throw new Error(`${type} with ID ${id} not found`);

    const context = { ...item, type };

    // Add tasks for items
    if (type === 'item') {
      const tasks = Object.values(data.tasks)
        .filter(t => t.itemId === id)
        .map(t => ({ id: t.id, title: t.title, status: t.status, description: t.description?.substring(0, 200) }));
      context.tasks = tasks;
      context.taskCount = tasks.length;
    }

    // Add parent info for tasks
    if (type === 'task' && item.itemId) {
      const parentItem = data.items[item.itemId];
      if (parentItem) {
        context.parent = { type: 'item', id: parentItem.id, title: parentItem.title, sectionId: parentItem.sectionId };
        context.parentId = item.itemId;
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

  // 3. CREATE (v4: creates items in sections)
  async create({ itemType, title, description = '', color, sectionId, parentId, categoryId, priority, projectId }, req) {
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

      // Initialize an empty v5 project via the project store.
      await projectStore.saveProjectData(id, projectStore.getDefaultData());

      // Add to projects metadata
      projectsData.projects[id] = project;
      projectsData.order.push(id);
      await saveProjects(projectsData);

      return project;
    }

    const data = await loadData(projectId, req);
    const now = new Date().toISOString();

    // Item (requires sectionId)
    if (itemType === 'item') {
      if (!sectionId) throw new Error('sectionId required for item (use sect-features or sect-bugs)');
      if (!data.sections[sectionId]) throw new Error(`Section ${sectionId} not found`);

      const prefix = sectionId === SYSTEM_SECTIONS.FEATURES ? 'feat' : 'bug';
      const id = generateId(prefix);
      const item = {
        id,
        sectionId,
        title, description,
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

      if (categoryId && data.itemCategories?.[categoryId]) {
        data.itemCategories[categoryId].itemOrder.push(id);
      } else {
        data.sections[sectionId].itemOrder.push(id);
      }
      await saveData(data, projectId, req);
      return item;
    }

    // Task (requires parentId)
    if (itemType === 'task') {
      if (!parentId) throw new Error('parentId required for task');
      const parentItem = data.items[parentId];
      if (!parentItem) throw new Error(`Parent item with ID ${parentId} not found`);

      const id = generateId('task');
      const task = {
        id,
        itemId: parentId,
        categoryId: categoryId || null,
        title, description,
        status: 'open',
        tagIds: [],
        attachments: [],
        promptHistory: [],
        createdAt: now,
        finishedAt: null
      };
      data.tasks[id] = task;

      if (categoryId && data.taskCategories[categoryId]) {
        data.taskCategories[categoryId].taskOrder.push(id);
      } else {
        parentItem.taskOrder.push(id);
      }
      await saveData(data, projectId, req);
      return { ...task, parentId };
    }

    // Item Category (requires sectionId)
    if (itemType === 'item-category') {
      if (!sectionId) throw new Error('sectionId required for item-category (use sect-features or sect-bugs)');
      if (!data.sections[sectionId]) throw new Error(`Section ${sectionId} not found`);

      const prefix = sectionId === SYSTEM_SECTIONS.FEATURES ? 'fcat' : 'bcat';
      const id = generateId(prefix);
      const category = {
        id,
        sectionId,
        name: title,
        itemOrder: []
      };
      data.itemCategories[id] = category;
      data.sections[sectionId].categoryOrder.push(id);
      await saveData(data, projectId, req);
      return category;
    }

    // Task Category (requires parentId)
    if (itemType === 'task-category') {
      if (!parentId) throw new Error('parentId required for task-category');
      const parentItem = data.items[parentId];
      if (!parentItem) throw new Error(`Parent item with ID ${parentId} not found`);

      const id = generateId('cat');
      const category = {
        id,
        itemId: parentId,
        name: title,
        taskOrder: []
      };
      data.taskCategories[id] = category;
      if (!parentItem.categoryOrder) parentItem.categoryOrder = [];
      parentItem.categoryOrder.push(id);
      await saveData(data, projectId, req);
      return { ...category, parentId };
    }

    throw new Error(`Invalid itemType: ${itemType}`);
  },

  // 4. UPDATE (v4: includes delete, append_prompt, save_plan)
  async update({ type, id, updates, action, promptEntry, planContent, planPath, projectId }, req) {
    const data = await loadData(projectId, req);

    // Helper to get item from v4 data
    const getItem = () => {
      if (type === 'item') {
        return data.items[id];
      } else if (type === 'task') {
        return data.tasks[id];
      }
      return null;
    };

    // Delete action
    if (action === 'delete') {
      if (type === 'item') {
        const item = data.items[id];
        if (!item) throw new Error(`${type} ${id} not found`);

        // Delete tasks
        for (const taskId of item.taskOrder || []) {
          delete data.tasks[taskId];
        }
        // Delete task categories
        Object.values(data.taskCategories)
          .filter(cat => cat.itemId === id)
          .forEach(cat => {
            for (const taskId of cat.taskOrder || []) {
              delete data.tasks[taskId];
            }
            delete data.taskCategories[cat.id];
          });

        // Remove from section's itemOrder
        const sectionId = item.sectionId;
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
      } else if (type === 'task') {
        const task = data.tasks[id];
        if (!task) throw new Error(`Task ${id} not found`);

        if (task.categoryId && data.taskCategories[task.categoryId]) {
          data.taskCategories[task.categoryId].taskOrder =
            data.taskCategories[task.categoryId].taskOrder.filter(tid => tid !== id);
        } else if (task.itemId && data.items[task.itemId]) {
          data.items[task.itemId].taskOrder =
            data.items[task.itemId].taskOrder.filter(tid => tid !== id);
        }
        delete data.tasks[id];
      }
      await saveData(data, projectId, req);
      return { deleted: true, type, id };
    }

    // Append prompt action
    if (action === 'append_prompt') {
      const item = getItem();
      if (!item) throw new Error(`${type} with ID ${id} not found`);
      if (!promptEntry?.role) {
        throw new Error('promptEntry with role required');
      }
      // Support new format (title + description) or legacy format (content)
      const hasNewFormat = promptEntry.title && promptEntry.description;
      const hasLegacyFormat = promptEntry.content;
      if (!hasNewFormat && !hasLegacyFormat) {
        throw new Error('promptEntry requires either {title, description} or {content}');
      }
      if (!item.promptHistory) item.promptHistory = [];
      const entry = {
        id: generateId('ph'),
        timestamp: new Date().toISOString(),
        entryType: 'prompt',
        role: promptEntry.role,
        title: promptEntry.title || (promptEntry.content?.substring(0, 80) + (promptEntry.content?.length > 80 ? '...' : '')),
        description: promptEntry.description || promptEntry.content
      };
      item.promptHistory.push(entry);
      await saveData(data, projectId, req);
      return { added: true, entryId: entry.id, totalCount: item.promptHistory.length };
    }

    // Save plan action
    if (action === 'save_plan') {
      const item = getItem();
      if (!item) throw new Error(`${type} with ID ${id} not found`);

      // Read content from path or use provided content
      let content;
      if (planPath) {
        if (planPath.startsWith('http://') || planPath.startsWith('https://')) {
          // Fetch from URL
          const response = await fetch(planPath);
          if (!response.ok) throw new Error(`Failed to fetch plan from URL: ${response.status} ${response.statusText}`);
          content = await response.text();
        } else {
          // Read from local file
          content = await fs.readFile(planPath, 'utf-8');
        }
      } else if (planContent) {
        content = planContent;
      } else {
        throw new Error('Either planPath or planContent required for save_plan action');
      }

      const existingPlans = (item.attachments || []).filter(a => a.filename?.startsWith('PLAN-v'));
      const version = existingPlans.length + 1;
      const filename = `PLAN-v${version}.md`;

      // Use 'item' storage type for feature/bug/item types
      const storageType = type === 'task' ? 'task' : 'item';
      const resolvedProjectId = await requireActiveProjectId(projectId, req);
      const ownerDir = storageType === 'task'
        ? projectStore.getTaskAttachmentsDir(resolvedProjectId, id)
        : projectStore.getItemAttachmentsDir(resolvedProjectId, id);
      await fs.mkdir(ownerDir, { recursive: true });
      await fs.writeFile(path.join(ownerDir, filename), content, 'utf-8');

      const storedPath = `${storageType}/${id}/${filename}`;
      const fullPath = path.join(ownerDir, filename);
      const attachment = {
        id: generateId('att'), filename, storedName: filename,
        storedPath, mimeType: 'text/markdown',
        size: Buffer.byteLength(content, 'utf-8'), uploadedAt: new Date().toISOString()
      };
      if (!item.attachments) item.attachments = [];
      item.attachments.push(attachment);
      await saveData(data, projectId, req);
      return { saved: true, version, filename, attachmentId: attachment.id, totalVersions: version, path: fullPath };
    }

    // Regular update
    const item = getItem();
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

  // 5. LIST (v4: categories, attachments, or projects)
  async list({ listType, type, id, sectionId, projectId }, req) {
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
      // List item categories in a section
      if (!sectionId) throw new Error('sectionId required for categories (use sect-features or sect-bugs)');
      const cats = Object.values(data.itemCategories || {})
        .filter(c => c.sectionId === sectionId)
        .map(c => ({ id: c.id, name: c.name, sectionId: c.sectionId, itemCount: c.itemOrder?.length || 0 }));
      return { categories: cats, count: cats.length };
    }

    if (listType === 'attachments') {
      if (!id) throw new Error('id required for attachments');
      let item;
      if (type === 'item') {
        item = data.items[id];
      } else if (type === 'task') {
        item = data.tasks[id];
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

  // 6. READ (v4: plan, attachment, image, prompt_history)
  async read({ type, id, contentType, attachmentId, version, limit, projectId }, req) {
    const data = await loadData(projectId, req);
    let item;
    if (type === 'item') {
      item = data.items[id];
    } else if (type === 'task') {
      item = data.tasks[id];
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

      const resolvedProjectId = await requireActiveProjectId(projectId, req);
      const ownerType = type === 'task' ? 'task' : 'item';
      const filePath = projectStore.resolveAttachmentPath(resolvedProjectId, ownerType, id, targetPlan);
      const content = await fs.readFile(filePath, 'utf-8');
      return { exists: true, version: parseInt(targetPlan.filename.match(/PLAN-v(\d+)/)?.[1]), filename: targetPlan.filename, content, versions };
    }

    // Prompt history
    if (contentType === 'prompt_history') {
      // Normalize legacy entries that have content instead of title/description
      let history = (item.promptHistory || []).map(entry => {
        if (!entry.title && entry.content) {
          return {
            ...entry,
            entryType: entry.entryType || 'prompt',
            title: entry.content.substring(0, 80) + (entry.content.length > 80 ? '...' : ''),
            description: entry.content
          };
        }
        return { ...entry, entryType: entry.entryType || 'prompt' };
      });
      if (limit && limit > 0) history = history.slice(-limit);
      return { history, count: history.length, totalCount: item.promptHistory?.length || 0 };
    }

    // Attachment or image
    if (!attachmentId) throw new Error('attachmentId required for attachment/image');
    const attachment = (item.attachments || []).find(a => a.id === attachmentId);
    if (!attachment) throw new Error(`Attachment ${attachmentId} not found`);

    const resolvedProjectId = await requireActiveProjectId(projectId, req);
    const ownerType = type === 'task' ? 'task' : 'item';
    const filePath = projectStore.resolveAttachmentPath(resolvedProjectId, ownerType, id, attachment);

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

function toolResponseToTextContent(toolResult) {
  return {
    content: [
      {
        type: 'text',
        text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
      }
    ]
  };
}

function toolErrorToTextContent(error) {
  const message = error?.message || String(error);
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Error: ${message}`
      }
    ]
  };
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    if (rawValue === undefined) continue;
    const key = rawKey.toLowerCase();
    normalized[key] = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  }
  return normalized;
}

function getSessionIdFromReq(req) {
  const header = req.headers['mcp-session-id'];
  return Array.isArray(header) ? header[0] : header;
}

async function callTool(name, args, reqLike) {
  const handler = toolHandlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(args || {}, reqLike);
}

function createStreamableMcpServer() {
  const server = new Server(
    {
      name: 'promptling-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const reqLike = { headers: normalizeHeaders(extra?.requestInfo?.headers || {}) };

    try {
      const toolResult = await callTool(name, args, reqLike);
      return toolResponseToTextContent(toolResult);
    } catch (error) {
      return toolErrorToTextContent(error);
    }
  });

  return server;
}

const streamableSessions = new Map();

function shouldUseStreamableTransport(req) {
  const sessionId = getSessionIdFromReq(req);

  if (req.method === 'GET') {
    return !!sessionId;
  }
  if (req.method === 'DELETE') {
    return true;
  }
  if (req.method === 'POST') {
    if (sessionId) return true;
    // Streamable HTTP clients may still request older protocol versions at initialize.
    // Route all initialize calls through Streamable transport to avoid handshake split-brain.
    return !!req.body && isInitializeRequest(req.body);
  }

  return false;
}

async function handleLegacyJsonRpc(req, res) {
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
            name: 'promptling-mcp',
            version: '1.0.0'
          }
        };
        break;

      case 'tools/list':
        result = { tools: TOOLS };
        break;

      case 'tools/call':
        const { name, arguments: args } = params;
        if (!toolHandlers[name]) {
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Unknown tool: ${name}` }
          });
        }

        try {
          // Pass req as second argument to handlers for project-scoped data
          const toolResult = await callTool(name, args, req);
          result = toolResponseToTextContent(toolResult);
        } catch (toolError) {
          result = toolErrorToTextContent(toolError);
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
}

async function handleStreamableHttp(req, res) {
  const sessionId = getSessionIdFromReq(req);
  const existingSession = sessionId ? streamableSessions.get(sessionId) : undefined;
  let transport = existingSession?.transport;

  if (!transport) {
    const isInitialize = req.method === 'POST' && isInitializeRequest(req.body);

    if (!isInitialize) {
      // Session expired or server restarted — return 404 so the client re-initializes.
      return res.status(404).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Session not found. The session may have expired or the server may have restarted. Please reconnect.'
        },
        id: null
      });
    }

    const server = createStreamableMcpServer();

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: newSessionId => {
        streamableSessions.set(newSessionId, { transport, server });
      }
    });

    transport.onclose = async () => {
      const closedSessionId = transport.sessionId;
      if (closedSessionId && streamableSessions.has(closedSessionId)) {
        streamableSessions.delete(closedSessionId);
      }

      try {
        await server.close();
      } catch (error) {
        console.error('Error closing MCP server session:', error);
      }
    };

    await server.connect(transport);
  }

  // Some older HTTP clients omit Accept; Streamable HTTP requires either
  // application/json or text/event-stream to be accepted.
  if (!req.headers.accept) {
    req.headers.accept = 'application/json, text/event-stream';
  }

  if (req.method === 'POST') {
    await transport.handleRequest(req, res, req.body);
    return;
  }

  await transport.handleRequest(req, res);
}

router.get('/', (req, res, next) => {
  // GET with a session ID is used by Streamable HTTP for SSE streams.
  if (getSessionIdFromReq(req)) {
    return next();
  }

  res.json({
    name: 'promptling-mcp',
    version: '1.0.0',
    status: 'ok',
    toolCount: TOOLS.length,
    endpoint: '/api/mcp',
    protocols: [
      'MCP Streamable HTTP (stateful, SDK transport)',
      'Legacy JSON-RPC POST compatibility'
    ]
  });
});

router.all('/', async (req, res) => {
  try {
    if (shouldUseStreamableTransport(req)) {
      await handleStreamableHttp(req, res);
      return;
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request - legacy JSON-RPC accepts POST only' }
      });
    }

    await handleLegacyJsonRpc(req, res);
  } catch (error) {
    console.error('MCP transport error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: error.message }
      });
    }
  }
});

module.exports = router;
