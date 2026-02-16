const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const tasksRouter = require('./routes/tasks');
const mcpRouter = require('./routes/mcp');
const projectsRouter = require('./routes/projects');
const { getDataPaths } = require('./config');
const { setupTerminalWebSocket } = require('./terminal');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Ensure data directory exists on startup
const { dataDir, projectsDir } = getDataPaths();
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`Created data directory: ${dataDir}`);
}
if (!fs.existsSync(projectsDir)) {
  fs.mkdirSync(projectsDir, { recursive: true });
}

// Middleware - explicit CORS config for MCP compatibility
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Project-Id', 'mcp-session-id'],
  exposedHeaders: ['mcp-session-id']
}));
app.use(express.json());

// Routes
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/mcp', mcpRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files from the React app build (only if dist exists)
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
const clientBuildExists = fs.existsSync(clientBuildPath);

if (clientBuildExists) {
  app.use(express.static(clientBuildPath));

  // Handle React routing - serve index.html for all non-API routes
  // Express 5 requires named parameter for wildcards
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// WebSocket server for terminal - with origin validation
const wss = new WebSocketServer({
  server,
  path: '/ws/terminal',
  verifyClient: (info) => {
    // Verify connection is from loopback
    const remoteAddr = info.req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddr)) {
      return false;
    }
    const origin = info.origin || info.req.headers.origin;
    if (!origin) return true; // Allow non-browser local clients
    try {
      const url = new URL(origin);
      return ['localhost', '127.0.0.1'].includes(url.hostname);
    } catch {
      return false;
    }
  }
});
setupTerminalWebSocket(wss);

// Start server - bind to localhost only for security (terminal WebSocket gives shell access)
// Set HOST=0.0.0.0 to allow LAN access if needed
const HOST = process.env.HOST || '127.0.0.1';
server.listen(PORT, HOST, () => {
  console.log(`Promptling server running on http://localhost:${PORT}`);
  console.log(`  - API: http://localhost:${PORT}/api`);
  console.log(`  - MCP: http://localhost:${PORT}/api/mcp`);
  console.log('  - MCP protocol support: Streamable HTTP (preferred) + legacy JSON-RPC POST fallback');
  console.log(`  - Terminal WebSocket: ws://localhost:${PORT}/ws/terminal`);
  console.log(`  - UI:  ${clientBuildExists ? 'http://localhost:' + PORT : 'Not built (run: cd client && npm run build)'}`);
  if (!process.env.HOST) {
    console.log('  NOTE: Server bound to localhost only (terminal security). Set HOST=0.0.0.0 for LAN access.');
  }
});
