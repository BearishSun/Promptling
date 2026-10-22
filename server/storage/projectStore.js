/**
 * Project storage abstraction.
 *
 * Owns the on-disk layout for a single project and presents a v4-shaped
 * (`{sections, items, tasks, ...}`) view to the rest of the server, even though
 * each item and task is now stored in its own folder:
 *
 *   projects/{projectId}/
 *   ├── data.json                      central index (v5)
 *   ├── data.json.v4-backup            written once during migration
 *   ├── items/{itemId}/
 *   │   ├── data.json                  full item record
 *   │   └── attachments/               item's files
 *   └── tasks/{taskId}/
 *       ├── data.json
 *       └── attachments/
 *
 * Old projects with version <5 auto-migrate on first load.
 */

const fs = require('fs').promises;
const path = require('path');
const { getDataPaths } = require('../config');

const DATA_VERSION = 5;
const PROJECTS_DIR = getDataPaths().projectsDir;

const SYSTEM_SECTIONS = {
  FEATURES: 'sect-features',
  BUGS: 'sect-bugs'
};

// Per-project locks so migration / save serialize cleanly within one process.
const projectLocks = new Map();
function withProjectLock(projectId, fn) {
  const prev = projectLocks.get(projectId) || Promise.resolve();
  const next = prev.then(() => fn(), () => fn()); // run regardless of prior failure
  projectLocks.set(projectId, next.catch(() => {}));
  return next;
}

// ---- Path helpers ---------------------------------------------------------

function getProjectDir(projectId) {
  return path.join(PROJECTS_DIR, projectId);
}
function getCentralIndexPath(projectId) {
  return path.join(getProjectDir(projectId), 'data.json');
}
function getItemDir(projectId, itemId) {
  return path.join(getProjectDir(projectId), 'items', itemId);
}
function getTaskDir(projectId, taskId) {
  return path.join(getProjectDir(projectId), 'tasks', taskId);
}
function getItemAttachmentsDir(projectId, itemId) {
  return path.join(getItemDir(projectId, itemId), 'attachments');
}
function getTaskAttachmentsDir(projectId, taskId) {
  return path.join(getTaskDir(projectId, taskId), 'attachments');
}

/**
 * Resolve an attachment's logical storedPath (e.g. "item/<id>/<file>") to the
 * v5 physical filesystem path. Falls back to deriving the path from
 * (ownerType, ownerId, storedName) when storedPath is missing.
 */
function resolveAttachmentPath(projectId, ownerType, ownerId, attachment) {
  const storedName = attachment?.storedName || attachment?.filename;
  if (!storedName) {
    throw new Error('attachment must have storedName or filename');
  }
  const dir = ownerType === 'task'
    ? getTaskAttachmentsDir(projectId, ownerId)
    : getItemAttachmentsDir(projectId, ownerId);
  return path.join(dir, path.basename(storedName));
}

// ---- Atomic write ---------------------------------------------------------

async function writeAtomic(filepath, contents) {
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  const tmp = `${filepath}.tmp`;
  await fs.writeFile(tmp, contents);
  await fs.rename(tmp, filepath);
}

async function readJson(filepath) {
  const text = await fs.readFile(filepath, 'utf-8');
  return JSON.parse(text);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// ---- Default data ---------------------------------------------------------

function getDefaultData() {
  const now = new Date().toISOString();
  return {
    version: DATA_VERSION,
    lastModified: now,
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
    items: {},
    itemCategories: {},
    tasks: {},
    taskCategories: {},
    settings: {
      activeView: 'section',
      activeSectionId: SYSTEM_SECTIONS.FEATURES,
      activeItemId: null,
      theme: 'system'
    }
  };
}

// ---- v3 → v4 migration (in-memory; same logic as the previous tasks.js) ---

function migrateV3ToV4(data) {
  if (data.version >= 4) return data;
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
    settings: {
      activeView: 'section',
      activeSectionId: data.settings?.activeView === 'bugs' ? SYSTEM_SECTIONS.BUGS : SYSTEM_SECTIONS.FEATURES,
      activeItemId: data.settings?.activeFeatureId || null,
      theme: data.settings?.theme || 'system'
    }
  };

  Object.values(data.features || {}).forEach(f => {
    migrated.items[f.id] = {
      id: f.id,
      sectionId: SYSTEM_SECTIONS.FEATURES,
      title: f.title,
      description: f.description || '',
      status: f.status || 'open',
      priority: f.priority || 'medium',
      complexity: f.complexity || null,
      categoryId: f.categoryId || null,
      taskOrder: [...(f.taskOrder || [])],
      categoryOrder: [...(f.categoryOrder || [])],
      attachments: [...(f.attachments || [])],
      promptHistory: [...(f.promptHistory || [])],
      tagIds: [...(f.tagIds || [])],
      createdAt: f.createdAt || now,
      finishedAt: f.finishedAt || null
    };
  });
  Object.values(data.bugs || {}).forEach(b => {
    migrated.items[b.id] = {
      id: b.id,
      sectionId: SYSTEM_SECTIONS.BUGS,
      title: b.title,
      description: b.description || '',
      status: b.status || 'open',
      priority: b.priority || 'medium',
      complexity: b.complexity || null,
      categoryId: b.categoryId || null,
      taskOrder: [...(b.taskOrder || [])],
      categoryOrder: [...(b.categoryOrder || [])],
      attachments: [...(b.attachments || [])],
      promptHistory: [...(b.promptHistory || [])],
      tagIds: [...(b.tagIds || [])],
      createdAt: b.createdAt || now,
      finishedAt: b.finishedAt || null
    };
  });
  Object.values(data.featureCategories || {}).forEach(cat => {
    migrated.itemCategories[cat.id] = {
      id: cat.id,
      sectionId: SYSTEM_SECTIONS.FEATURES,
      name: cat.name,
      itemOrder: [...(cat.featureOrder || [])]
    };
  });
  Object.values(data.bugCategories || {}).forEach(cat => {
    migrated.itemCategories[cat.id] = {
      id: cat.id,
      sectionId: SYSTEM_SECTIONS.BUGS,
      name: cat.name,
      itemOrder: [...(cat.bugOrder || [])]
    };
  });
  Object.values(data.tasks || {}).forEach(t => {
    migrated.tasks[t.id] = {
      id: t.id,
      itemId: t.parentId,
      categoryId: t.categoryId || null,
      title: t.title,
      description: t.description || '',
      status: t.status || 'open',
      tagIds: [...(t.tagIds || [])],
      attachments: [...(t.attachments || [])],
      promptHistory: [...(t.promptHistory || [])],
      createdAt: t.createdAt || now,
      finishedAt: t.finishedAt || null
    };
  });
  Object.values(data.categories || {}).forEach(cat => {
    migrated.taskCategories[cat.id] = {
      id: cat.id,
      itemId: cat.parentId,
      name: cat.name,
      taskOrder: [...(cat.taskOrder || [])]
    };
  });

  console.log(`projectStore: migrated v${data.version || 3} → v4 (in-memory)`);
  return migrated;
}

// ---- v4 → v5 migration (splits files on disk) ----------------------------

/**
 * Where might an existing attachment file actually live in the legacy layout?
 * Returns a list of fs paths to try, in order. The first existing one wins.
 */
function legacyAttachmentCandidates(projectDir, ownerType, ownerId, attachment) {
  const legacyAttachRoot = path.join(projectDir, 'attachments');
  const storedName = attachment.storedName || attachment.filename;
  const candidates = [];
  if (attachment.storedPath) {
    candidates.push(path.join(legacyAttachRoot, attachment.storedPath));
  }
  if (storedName) {
    if (ownerType === 'task') {
      candidates.push(path.join(legacyAttachRoot, 'task', ownerId, storedName));
    } else {
      candidates.push(path.join(legacyAttachRoot, 'item', ownerId, storedName));
      candidates.push(path.join(legacyAttachRoot, 'feature', ownerId, storedName));
      candidates.push(path.join(legacyAttachRoot, 'bug', ownerId, storedName));
    }
    candidates.push(path.join(legacyAttachRoot, storedName));
  }
  return candidates;
}

async function moveAttachmentFile(srcCandidates, destPath) {
  for (const src of srcCandidates) {
    if (!(await exists(src))) continue;
    if (src === destPath) return { moved: true, from: src };
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.rename(src, destPath);
      return { moved: true, from: src };
    } catch (err) {
      if (err.code === 'EXDEV') {
        // Cross-device — fall back to copy+unlink.
        await fs.copyFile(src, destPath);
        await fs.unlink(src).catch(() => {});
        return { moved: true, from: src };
      }
      // Windows file-lock or other failure: log and keep the legacy path.
      console.warn(`projectStore: attachment move failed (${err.code || err.message}) ${src} → ${destPath}`);
      return { moved: false, from: src, error: err };
    }
  }
  return { moved: false };
}

async function tryRmdir(p) {
  try {
    await fs.rmdir(p);
  } catch {
    // not empty or doesn't exist — fine
  }
}

/**
 * Drains the legacy attachments tree for one item or task into the new
 * per-owner attachments folder. Returns the number of attachments moved.
 */
async function migrateAttachmentsForOwner(projectDir, ownerType, ownerId, ownerRecord) {
  if (!Array.isArray(ownerRecord.attachments) || ownerRecord.attachments.length === 0) {
    return 0;
  }
  const destDir = ownerType === 'task'
    ? path.join(projectDir, 'tasks', ownerId, 'attachments')
    : path.join(projectDir, 'items', ownerId, 'attachments');
  await fs.mkdir(destDir, { recursive: true });

  let moved = 0;
  for (const att of ownerRecord.attachments) {
    const storedName = att.storedName || att.filename;
    if (!storedName) continue;
    const destPath = path.join(destDir, path.basename(storedName));
    const srcCandidates = legacyAttachmentCandidates(projectDir, ownerType, ownerId, att);
    const result = await moveAttachmentFile(srcCandidates, destPath);
    if (result.moved) moved++;
    // Always rewrite storedPath to canonical logical form so reads find it.
    att.storedPath = `${ownerType}/${ownerId}/${path.basename(storedName)}`;
    att.storedName = path.basename(storedName);
  }
  return moved;
}

async function migrateV4ToV5(projectId, oldData) {
  const projectDir = getProjectDir(projectId);
  const centralPath = getCentralIndexPath(projectId);
  const backupPath = `${centralPath}.v4-backup`;

  // Backup once (don't overwrite an existing backup — first migration wins).
  if (!(await exists(backupPath)) && (await exists(centralPath))) {
    await fs.copyFile(centralPath, backupPath);
  }

  await fs.mkdir(path.join(projectDir, 'items'), { recursive: true });
  await fs.mkdir(path.join(projectDir, 'tasks'), { recursive: true });

  let nItems = 0, nTasks = 0, nAttachments = 0;

  for (const [itemId, item] of Object.entries(oldData.items || {})) {
    nAttachments += await migrateAttachmentsForOwner(projectDir, 'item', itemId, item);
    const itemDir = path.join(projectDir, 'items', itemId);
    await fs.mkdir(path.join(itemDir, 'attachments'), { recursive: true });
    await writeAtomic(path.join(itemDir, 'data.json'), JSON.stringify(item, null, 2));
    nItems++;
  }
  for (const [taskId, task] of Object.entries(oldData.tasks || {})) {
    nAttachments += await migrateAttachmentsForOwner(projectDir, 'task', taskId, task);
    const taskDir = path.join(projectDir, 'tasks', taskId);
    await fs.mkdir(path.join(taskDir, 'attachments'), { recursive: true });
    await writeAtomic(path.join(taskDir, 'data.json'), JSON.stringify(task, null, 2));
    nTasks++;
  }

  // Build v5 central index — everything except the heavy items/tasks blobs.
  const central = buildCentralIndex(oldData);
  await writeAtomic(centralPath, JSON.stringify(central, null, 2));

  // Best-effort cleanup of now-empty legacy attachment subtrees.
  for (const sub of ['item', 'feature', 'bug', 'task']) {
    const dir = path.join(projectDir, 'attachments', sub);
    if (!(await exists(dir))) continue;
    const entries = await fs.readdir(dir).catch(() => []);
    for (const ownerFolder of entries) {
      const ownerPath = path.join(dir, ownerFolder);
      const stat = await fs.stat(ownerPath).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const inner = await fs.readdir(ownerPath).catch(() => []);
      if (inner.length === 0) {
        await tryRmdir(ownerPath);
      } else {
        console.warn(`projectStore: leftover legacy attachments at ${ownerPath} (${inner.length} files)`);
      }
    }
    await tryRmdir(dir); // only succeeds if now empty
  }
  await tryRmdir(path.join(projectDir, 'attachments'));

  console.log(`projectStore: migrated project ${projectId} v${oldData.version || '?'} → v5 (${nItems} items, ${nTasks} tasks, ${nAttachments} attachments)`);
}

// ---- Central-index assembly ----------------------------------------------

function buildCentralIndex(data) {
  const itemIndex = {};
  for (const [id, item] of Object.entries(data.items || {})) {
    itemIndex[id] = {
      sectionId: item.sectionId || null,
      categoryId: item.categoryId || null
    };
  }
  const taskIndex = {};
  for (const [id, task] of Object.entries(data.tasks || {})) {
    taskIndex[id] = {
      itemId: task.itemId || null,
      categoryId: task.categoryId || null
    };
  }
  return {
    version: DATA_VERSION,
    lastModified: new Date().toISOString(),
    sections: data.sections || {},
    sectionOrder: data.sectionOrder || [],
    itemCategories: data.itemCategories || {},
    taskCategories: data.taskCategories || {},
    settings: data.settings || {},
    itemIndex,
    taskIndex
  };
}

// ---- Concurrency-limited Promise.all -------------------------------------

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ---- Public load / save --------------------------------------------------

/**
 * Load and reassemble the v4-shaped blob for a project. Auto-migrates if
 * the on-disk version is below DATA_VERSION.
 */
async function loadProjectData(projectId) {
  if (!projectId) {
    throw new Error('projectStore.loadProjectData: projectId is required');
  }
  return withProjectLock(projectId, async () => {
    const projectDir = getProjectDir(projectId);
    const centralPath = getCentralIndexPath(projectId);
    await fs.mkdir(projectDir, { recursive: true });

    let raw;
    try {
      raw = await readJson(centralPath);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Brand new project — initialize as v5 directly.
        const fresh = getDefaultData();
        const central = buildCentralIndex(fresh);
        await writeAtomic(centralPath, JSON.stringify(central, null, 2));
        return fresh;
      }
      throw err;
    }

    // v3 → v4 (in-memory) when needed.
    if (!raw.version || raw.version < 4) {
      raw = migrateV3ToV4(raw);
    }

    // v4 → v5 (file split) when needed.
    if (raw.version < DATA_VERSION) {
      await migrateV4ToV5(projectId, raw);
      raw = await readJson(centralPath);
    }

    // Reassemble items + tasks into the v4-shaped runtime blob.
    const itemIds = Object.keys(raw.itemIndex || {});
    const taskIds = Object.keys(raw.taskIndex || {});
    const items = {};
    const tasks = {};

    await Promise.all([
      mapWithConcurrency(itemIds, 16, async (id) => {
        const filePath = path.join(getItemDir(projectId, id), 'data.json');
        try {
          items[id] = await readJson(filePath);
        } catch (err) {
          if (err.code === 'ENOENT') {
            console.warn(`projectStore: indexed item missing on disk: ${id}`);
            return;
          }
          throw err;
        }
      }),
      mapWithConcurrency(taskIds, 16, async (id) => {
        const filePath = path.join(getTaskDir(projectId, id), 'data.json');
        try {
          tasks[id] = await readJson(filePath);
        } catch (err) {
          if (err.code === 'ENOENT') {
            console.warn(`projectStore: indexed task missing on disk: ${id}`);
            return;
          }
          throw err;
        }
      })
    ]);

    return {
      version: DATA_VERSION,
      lastModified: raw.lastModified,
      sections: raw.sections || {},
      sectionOrder: raw.sectionOrder || [],
      itemCategories: raw.itemCategories || {},
      taskCategories: raw.taskCategories || {},
      settings: raw.settings || {},
      items,
      tasks
    };
  });
}

/**
 * Save a v4-shaped blob, splitting it into per-item / per-task files. Only
 * files whose JSON differs from the on-disk copy are rewritten; folders for
 * removed items/tasks are deleted after the central index lands.
 */
async function saveProjectData(projectId, data) {
  if (!projectId) {
    throw new Error('projectStore.saveProjectData: projectId is required');
  }
  return withProjectLock(projectId, async () => {
    const projectDir = getProjectDir(projectId);
    const centralPath = getCentralIndexPath(projectId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'items'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'tasks'), { recursive: true });

    // Read existing central index to know which items/tasks already exist.
    let oldCentral = null;
    try {
      oldCentral = await readJson(centralPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    // If the central index is older than v5, we shouldn't be saving over it
    // without migration. Migrate first by loading (which migrates), then
    // overwrite. saveProjectData is generally called after loadProjectData
    // in a request, so this should be rare — guard anyway.
    if (oldCentral && oldCentral.version && oldCentral.version < DATA_VERSION) {
      // Migrate using oldCentral if it has items/tasks inline (v4), else assume it's already v5.
      if (oldCentral.items || oldCentral.tasks) {
        await migrateV4ToV5(projectId, oldCentral);
        oldCentral = await readJson(centralPath);
      }
    }

    const oldItemIds = new Set(Object.keys(oldCentral?.itemIndex || {}));
    const oldTaskIds = new Set(Object.keys(oldCentral?.taskIndex || {}));
    const newItemIds = new Set(Object.keys(data.items || {}));
    const newTaskIds = new Set(Object.keys(data.tasks || {}));

    const itemsToDelete = [...oldItemIds].filter(id => !newItemIds.has(id));
    const tasksToDelete = [...oldTaskIds].filter(id => !newTaskIds.has(id));

    // Write item files. Diff against current on-disk content; skip writes
    // whose serialized form is unchanged.
    await mapWithConcurrency([...newItemIds], 16, async (id) => {
      const item = data.items[id];
      if (!item) return;
      const itemDir = getItemDir(projectId, id);
      await fs.mkdir(path.join(itemDir, 'attachments'), { recursive: true });
      const filePath = path.join(itemDir, 'data.json');
      const next = JSON.stringify(item, null, 2);
      let prev = null;
      try {
        prev = await fs.readFile(filePath, 'utf-8');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      if (prev !== next) {
        await writeAtomic(filePath, next);
      }
    });

    await mapWithConcurrency([...newTaskIds], 16, async (id) => {
      const task = data.tasks[id];
      if (!task) return;
      const taskDir = getTaskDir(projectId, id);
      await fs.mkdir(path.join(taskDir, 'attachments'), { recursive: true });
      const filePath = path.join(taskDir, 'data.json');
      const next = JSON.stringify(task, null, 2);
      let prev = null;
      try {
        prev = await fs.readFile(filePath, 'utf-8');
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      if (prev !== next) {
        await writeAtomic(filePath, next);
      }
    });

    // Write central index last so a crash mid-write leaves the index
    // pointing at the previous (consistent) state.
    const central = buildCentralIndex(data);
    await writeAtomic(centralPath, JSON.stringify(central, null, 2));

    // Now safe to drop folders for removed items/tasks.
    for (const id of itemsToDelete) {
      await fs.rm(getItemDir(projectId, id), { recursive: true, force: true }).catch(err => {
        console.warn(`projectStore: failed to remove items/${id}:`, err.message);
      });
    }
    for (const id of tasksToDelete) {
      await fs.rm(getTaskDir(projectId, id), { recursive: true, force: true }).catch(err => {
        console.warn(`projectStore: failed to remove tasks/${id}:`, err.message);
      });
    }
  });
}

// ---- Single-record helpers (handy for routes that only touch one item) ---

async function loadItem(projectId, itemId) {
  try {
    return await readJson(path.join(getItemDir(projectId, itemId), 'data.json'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
async function saveItem(projectId, itemId, item) {
  return withProjectLock(projectId, async () => {
    const itemDir = getItemDir(projectId, itemId);
    await fs.mkdir(path.join(itemDir, 'attachments'), { recursive: true });
    await writeAtomic(path.join(itemDir, 'data.json'), JSON.stringify(item, null, 2));
  });
}
async function deleteItem(projectId, itemId) {
  return withProjectLock(projectId, async () => {
    await fs.rm(getItemDir(projectId, itemId), { recursive: true, force: true });
  });
}
async function loadTask(projectId, taskId) {
  try {
    return await readJson(path.join(getTaskDir(projectId, taskId), 'data.json'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
async function saveTask(projectId, taskId, task) {
  return withProjectLock(projectId, async () => {
    const taskDir = getTaskDir(projectId, taskId);
    await fs.mkdir(path.join(taskDir, 'attachments'), { recursive: true });
    await writeAtomic(path.join(taskDir, 'data.json'), JSON.stringify(task, null, 2));
  });
}
async function deleteTask(projectId, taskId) {
  return withProjectLock(projectId, async () => {
    await fs.rm(getTaskDir(projectId, taskId), { recursive: true, force: true });
  });
}

module.exports = {
  DATA_VERSION,
  SYSTEM_SECTIONS,
  loadProjectData,
  saveProjectData,
  loadItem, saveItem, deleteItem,
  loadTask, saveTask, deleteTask,
  getDefaultData,
  getProjectDir,
  getCentralIndexPath,
  getItemDir,
  getTaskDir,
  getItemAttachmentsDir,
  getTaskAttachmentsDir,
  resolveAttachmentPath,
  writeAtomic
};
