# TaskList

A task management application for tracking software features, bugs, and tasks with drag-and-drop organization, markdown support, and file attachments.

## Quick Start (Fresh Windows Installation)

Complete guide to get TaskList running on a fresh Windows install.

### Step 1: Install Node.js

1. Download Node.js LTS from https://nodejs.org/
2. Run the installer (use default settings)
3. Restart your terminal/command prompt
4. Verify installation:
   ```bash
   node --version   # Should show v18+ or v20+
   npm --version    # Should show 9+ or 10+
   ```

### Step 2: Get the Project

Either clone from git or copy the project folder to your desired location (e.g., `D:\Projects\TaskList`).

### Step 3: Install Dependencies

```bash
cd D:\Projects\TaskList
npm install
```

This installs dependencies for the root, client, and server.

### Step 4: Build the Client

```bash
cd D:\Projects\TaskList\client
npm run build
```

### Step 5: Start the Server

**Option A: Simple start (stops when terminal closes)**
```bash
cd D:\Projects\TaskList\server
node index.js
```

**Option B: Persistent service with PM2 (recommended)**
```bash
# Install PM2 globally
npm install -g pm2

# Start the server
cd D:\Projects\TaskList\server
pm2 start index.js --name "tasklist"

# Save process list so PM2 remembers it
pm2 save

# (Optional) Install PM2 Windows service for auto-start on boot
npm install -g pm2-windows-startup
pm2-startup install
```

### Step 6: Access the App

Open http://localhost:3001 in your browser.

---

## Tech Stack

- **Frontend:** React 19 + Vite
- **Backend:** Express 5 + Node.js
- **Drag & Drop:** @dnd-kit
- **Markdown:** react-markdown

## Project Structure

```
TaskList/
├── client/           # React frontend
│   ├── src/
│   └── dist/         # Built files (after npm run build)
├── server/           # Express backend
│   ├── index.js
│   └── routes/
├── .tasklist/        # Data storage (created automatically)
│   ├── data.json
│   └── attachments/
└── package.json      # Root workspace
```

## Development Mode

For active development with hot reload:

```bash
cd D:\Projects\TaskList
npm run dev
```

This starts both the client (port 5173) and server (port 3001) with hot reload.

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

## Production Deployment

### Build the Client

```bash
cd D:\Projects\TaskList\client
npm run build
```

This creates optimized static files in `client/dist/`.

### Start the Server

The server serves both the API and the built React frontend.

```bash
cd D:\Projects\TaskList\server
node index.js
```

Access the app at: http://localhost:3001

## Running as a Persistent Service (Windows)

### Using PM2 (Recommended)

```bash
# Install PM2 globally
npm install -g pm2

# Start the server
cd D:\Projects\TaskList\server
pm2 start index.js --name "tasklist"
pm2 save

# Install as Windows service (run as Administrator)
npm install -g pm2-windows-startup
pm2-startup install
```

### PM2 Commands

| Command | Description |
|---------|-------------|
| `pm2 list` | Show running processes |
| `pm2 logs tasklist` | View logs |
| `pm2 restart tasklist` | Restart server |
| `pm2 stop tasklist` | Stop server |
| `pm2 delete tasklist` | Remove from PM2 |

### Alternative: Windows Task Scheduler

1. Press `Win+R`, type `taskschd.msc`
2. Create Basic Task → Name: "TaskList Server"
3. Trigger: "When the computer starts"
4. Action: "Start a program"
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `index.js`
   - Start in: `D:\Projects\TaskList\server`
5. Enable "Run whether user is logged on or not"

## Updating After Code Changes

```bash
# Rebuild client
cd D:\Projects\TaskList\client
npm run build

# Restart server
pm2 restart tasklist
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | Load all data |
| GET | `/api/health` | Health check |
| POST | `/api/tasks/feature` | Create feature |
| POST | `/api/tasks/bug` | Create bug |
| POST | `/api/tasks/task` | Create task |
| PATCH | `/api/tasks/:type/:id` | Update item |
| DELETE | `/api/tasks/:type/:id` | Delete item |
| PUT | `/api/tasks/reorder` | Reorder items |
| POST | `/api/tasks/attachment` | Upload attachment |

## Data Storage

All data is stored in `.tasklist/data.json` in the project root. Attachments are stored in `.tasklist/attachments/`.

## Configuration

The server port can be changed via environment variable:

```bash
set PORT=8080 && node index.js
```

## Troubleshooting

### Port already in use

```bash
# Find what's using the port
netstat -ano | findstr ":3001"

# Kill the process
taskkill /PID <pid> /F
```

### Check if server is running

Open http://localhost:3001/api/health in browser or run:

```bash
curl http://localhost:3001/api/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### PM2 not recognized after install

Close and reopen your terminal, or run:
```bash
refreshenv
```

### Dependencies missing after git clone

Make sure to run `npm install` in the project root:
```bash
cd D:\Projects\TaskList
npm install
```
