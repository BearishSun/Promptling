# TaskList

A task management application for tracking software features, bugs, and tasks with drag-and-drop organization, markdown support, and file attachments.

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

## Development Setup

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
cd D:\Projects\TaskList
npm install
```

### Running in Development Mode

```bash
npm run dev
```

This starts both the client (port 5173) and server (port 3001) with hot reload.

- Frontend: http://localhost:5173
- API: http://localhost:3001/api

## Production Deployment

### 1. Build the Client

```bash
cd D:\Projects\TaskList\client
npm run build
```

This creates optimized static files in `client/dist/`.

### 2. Start the Server

The server serves both the API and the built React frontend.

```bash
cd D:\Projects\TaskList\server
node index.js
```

Access the app at: http://localhost:3001

## Running as a Persistent Service (Windows)

To keep the server running after PC restart, use PM2:

### Install PM2

```bash
npm install -g pm2
npm install -g pm2-windows-startup
```

### Start the Server with PM2

```bash
# Kill any existing instance first
netstat -ano | findstr ":3001"
taskkill /PID <pid> /F

# Start with PM2
cd D:\Projects\TaskList\server
pm2 start index.js --name "tasklist"
pm2 save

# Install as Windows service (run as Administrator)
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

## Updating the Application

After making code changes:

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
PORT=8080 node index.js
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

```bash
curl http://localhost:3001/api/health
```

Should return: `{"status":"ok","timestamp":"..."}`
