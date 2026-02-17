const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pty = require('node-pty');

const MAX_TERMINALS_PER_CONNECTION = 10;
const MAX_INPUT_LENGTH = 65536;
const TITLE_POLL_INTERVAL = 2000;
const RESIZE_DEBOUNCE_MS = 50;


function setupTerminalWebSocket(wss) {
  wss.on('connection', (ws) => {
    const terminals = new Map(); // terminalId -> { pty, titleInterval, resizeTimer }

    const send = (msg) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.type) {
        case 'spawn': {
          // Enforce terminal limit
          if (terminals.size >= MAX_TERMINALS_PER_CONNECTION) {
            send({ type: 'error', message: 'Maximum terminal limit reached' });
            break;
          }

          const terminalId = crypto.randomInt(0, 2 ** 31);

          // Validate cwd
          const cwd = msg.cwd || os.homedir();
          try {
            const resolvedCwd = path.resolve(cwd);
            // Block UNC paths on Windows (credential leak risk)
            if (resolvedCwd.startsWith('\\\\')) {
              send({ type: 'error', message: 'UNC paths are not allowed' });
              break;
            }
            if (!fs.existsSync(resolvedCwd) || !fs.statSync(resolvedCwd).isDirectory()) {
              send({ type: 'error', message: `Invalid working directory: ${cwd}` });
              break;
            }
          } catch {
            send({ type: 'error', message: `Cannot access working directory: ${cwd}` });
            break;
          }

          // Validate cols/rows
          const cols = Math.min(500, Math.max(1, parseInt(msg.cols, 10) || 80));
          const rows = Math.min(200, Math.max(1, parseInt(msg.rows, 10) || 24));

          // Always spawn an interactive shell, then write the claude command
          // to stdin if claudeArgs is provided. This avoids ConPTY "File not found"
          // errors when the server runs under pm2 (no parent console).
          const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || 'bash');
          let claudeCmd = null;
          if (typeof msg.claudeArgs === 'string' && msg.claudeArgs.length > 0 && msg.claudeArgs.length <= 10000) {
            // Build the claude command to write to stdin after shell starts.
            // claudeArgs is passed as a single quoted argument so the shell
            // delivers the full string (e.g. "/plan task-id") as one prompt to claude.
            const claudeExe = process.platform === 'win32' ? 'claude.exe' : 'claude';
            const escaped = msg.claudeArgs.replace(/"/g, '\\"');
            claudeCmd = `${claudeExe} "${escaped}"`;
          }

          // Build env with guaranteed paths (pm2 may have a stale PATH snapshot)
          const spawnEnv = { ...process.env };
          const userLocalBin = path.join(os.homedir(), '.local', 'bin');
          if (spawnEnv.PATH && !spawnEnv.PATH.split(path.delimiter).includes(userLocalBin)) {
            spawnEnv.PATH = spawnEnv.PATH + path.delimiter + userLocalBin;
          }

          let ptyProcess;
          try {
            ptyProcess = pty.spawn(shell, [], {
              name: 'xterm-256color',
              cols,
              rows,
              cwd: path.resolve(cwd),
              env: spawnEnv,
            });
          } catch (err) {
            console.error('[terminal] Failed to spawn PTY:', err.message);
            const errorMsg = { type: 'error', message: `Failed to spawn terminal: ${err.message}` };
            if (msg.correlationId) errorMsg.correlationId = msg.correlationId;
            send(errorMsg);
            break;
          }

          // If we have a claude command, write it to stdin after the shell prompt is ready
          if (claudeCmd) {
            let sent = false;
            const onReady = () => {
              if (!sent) {
                sent = true;
                ptyProcess.write(claudeCmd + '\r');
              }
            };
            // Wait for first output (shell prompt), then send
            const dataDisposable = ptyProcess.onData(() => {
              dataDisposable.dispose();
              // Small delay to let the prompt fully render
              setTimeout(onReady, 100);
            });
            // Fallback in case onData doesn't fire quickly
            setTimeout(onReady, 1000);
          }

          // Custom title from client, or default to shell name
          const customTitle = typeof msg.title === 'string' && msg.title.length > 0 ? msg.title : null;
          const displayTitle = customTitle || (process.platform === 'win32' ? 'PowerShell' : path.basename(shell));

          // On Windows, ptyProcess.process always returns the name option ('xterm-256color')
          // rather than the actual running process. Initialize lastTitle to match so the
          // title poll doesn't overwrite our display title.
          let lastTitle = ptyProcess.process || shell;

          ptyProcess.onData((data) => {
            send({ type: 'output', terminalId, data });
          });

          ptyProcess.onExit(({ exitCode }) => {
            send({ type: 'exit', terminalId, exitCode });
            const entry = terminals.get(terminalId);
            if (entry) {
              if (entry.titleInterval) clearInterval(entry.titleInterval);
              terminals.delete(terminalId);
            }
          });

          // Only poll for title changes if no custom title was set
          let titleInterval = null;
          if (!customTitle) {
            titleInterval = setInterval(() => {
              try {
                const currentTitle = ptyProcess.process;
                if (currentTitle && currentTitle !== lastTitle) {
                  lastTitle = currentTitle;
                  send({ type: 'title', terminalId, title: currentTitle });
                }
              } catch {
                // PTY may have been killed
              }
            }, TITLE_POLL_INTERVAL);
          }

          terminals.set(terminalId, { pty: ptyProcess, titleInterval });

          // Echo back correlation ID if provided (for client-side metadata matching)
          const spawnedMsg = { type: 'spawned', terminalId, title: displayTitle };
          if (msg.correlationId) spawnedMsg.correlationId = msg.correlationId;
          send(spawnedMsg);

          break;
        }

        case 'input': {
          if (typeof msg.terminalId !== 'number') break;
          if (typeof msg.data !== 'string' || msg.data.length > MAX_INPUT_LENGTH) break;
          const entry = terminals.get(msg.terminalId);
          if (entry) {
            entry.pty.write(msg.data);
          }
          break;
        }

        case 'resize': {
          if (typeof msg.terminalId !== 'number') break;
          const cols = parseInt(msg.cols, 10);
          const rows = parseInt(msg.rows, 10);
          if (!cols || !rows || cols < 1 || rows < 1 || cols > 500 || rows > 200) break;
          const entry = terminals.get(msg.terminalId);
          if (entry) {
            // Debounce resize to prevent spam from rapid window resizing
            if (entry.resizeTimer) clearTimeout(entry.resizeTimer);
            entry.resizeTimer = setTimeout(() => {
              entry.resizeTimer = null;
              try {
                entry.pty.resize(cols, rows);
              } catch {
                // Ignore resize errors on dead PTY
              }
            }, RESIZE_DEBOUNCE_MS);
          }
          break;
        }

        case 'kill': {
          if (typeof msg.terminalId !== 'number') break;
          const entry = terminals.get(msg.terminalId);
          if (entry) {
            clearInterval(entry.titleInterval);
            if (entry.resizeTimer) clearTimeout(entry.resizeTimer);
            entry.pty.kill();
            terminals.delete(msg.terminalId);
          }
          break;
        }
      }
    });

    ws.on('close', () => {
      // Cleanup all PTYs for this connection
      for (const [, entry] of terminals) {
        clearInterval(entry.titleInterval);
        if (entry.resizeTimer) clearTimeout(entry.resizeTimer);
        try {
          entry.pty.kill();
        } catch {
          // Already dead
        }
      }
      terminals.clear();
    });
  });
}

module.exports = { setupTerminalWebSocket };
