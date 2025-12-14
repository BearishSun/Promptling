/**
 * Configuration loader for Promptling
 *
 * Loads configuration from promptling.config.json in the app root directory.
 * This allows users to customize the location of data files.
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

// App root is parent of server directory
const APP_ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(APP_ROOT, 'promptling.config.json');

// Default configuration values
const DEFAULT_CONFIG = {
  // Directory where all data is stored (relative to config file or absolute)
  dataDir: '.promptflow'
};

// Cached config - loaded once at startup
let cachedConfig = null;

/**
 * Get the default configuration
 * @returns {object} Default configuration object
 */
function getDefaultConfig() {
  return { ...DEFAULT_CONFIG };
}

/**
 * Load configuration from file or return defaults
 * @returns {Promise<object>} Configuration object
 */
async function loadConfig() {
  // Return cached config if already loaded
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  try {
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const userConfig = JSON.parse(content);

    // Merge with defaults (user config takes precedence)
    cachedConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig
    };

    console.log(`Loaded config from ${CONFIG_FILE}`);
    return cachedConfig;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No config file - use defaults
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }

    // Config file exists but is invalid
    console.error(`Error reading config file ${CONFIG_FILE}:`, error.message);
    console.error('Using default configuration');
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Load configuration synchronously (for initial setup)
 * @returns {object} Configuration object
 */
function loadConfigSync() {
  // Return cached config if already loaded
  if (cachedConfig !== null) {
    return cachedConfig;
  }

  try {
    const content = fsSync.readFileSync(CONFIG_FILE, 'utf-8');
    const userConfig = JSON.parse(content);

    // Merge with defaults (user config takes precedence)
    cachedConfig = {
      ...DEFAULT_CONFIG,
      ...userConfig
    };

    console.log(`Loaded config from ${CONFIG_FILE}`);
    return cachedConfig;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No config file - use defaults
      cachedConfig = { ...DEFAULT_CONFIG };
      return cachedConfig;
    }

    // Config file exists but is invalid
    console.error(`Error reading config file ${CONFIG_FILE}:`, error.message);
    console.error('Using default configuration');
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }
}

/**
 * Resolve the data directory path
 * Handles both relative and absolute paths
 * @returns {string} Absolute path to data directory
 */
function getDataDir() {
  const config = loadConfigSync();
  const dataDir = config.dataDir;

  // If absolute path, use as-is
  if (path.isAbsolute(dataDir)) {
    return dataDir;
  }

  // Relative path is relative to the config file location (app root)
  return path.join(APP_ROOT, dataDir);
}

/**
 * Get paths derived from the data directory
 * @returns {object} Object containing all data-related paths
 */
function getDataPaths() {
  const dataDir = getDataDir();

  return {
    dataDir,
    projectsFile: path.join(dataDir, 'projects.json'),
    settingsFile: path.join(dataDir, 'settings.json'),
    projectsDir: path.join(dataDir, 'projects')
  };
}

/**
 * Clear the cached config (useful for testing or reloading)
 */
function clearConfigCache() {
  cachedConfig = null;
}

/**
 * Get the config file path
 * @returns {string} Path to the config file
 */
function getConfigFilePath() {
  return CONFIG_FILE;
}

/**
 * Get the app root directory
 * @returns {string} Path to the app root
 */
function getAppRoot() {
  return APP_ROOT;
}

module.exports = {
  loadConfig,
  loadConfigSync,
  getDataDir,
  getDataPaths,
  getDefaultConfig,
  clearConfigCache,
  getConfigFilePath,
  getAppRoot
};
