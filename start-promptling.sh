#!/bin/bash

# Promptling Launcher for macOS/Linux

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo ""
    echo "  ERROR: Node.js is not installed!"
    echo ""
    echo "  Please install Node.js from: https://nodejs.org/"
    echo "  Or use your package manager:"
    echo "    macOS:  brew install node"
    echo "    Ubuntu: sudo apt install nodejs npm"
    echo ""
    echo "  After installing, restart this application."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "$SCRIPT_DIR/server/node_modules" ]; then
    echo ""
    echo "  Installing dependencies for first-time setup..."
    echo ""
    cd "$SCRIPT_DIR"
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "  ERROR: Failed to install dependencies."
        echo ""
        read -p "Press Enter to exit..."
        exit 1
    fi
fi

# Check if client is built
if [ ! -f "$SCRIPT_DIR/client/dist/index.html" ]; then
    echo ""
    echo "  Building client for first-time setup..."
    echo ""
    cd "$SCRIPT_DIR/client"
    npm run build
    if [ $? -ne 0 ]; then
        echo ""
        echo "  ERROR: Failed to build client."
        echo ""
        read -p "Press Enter to exit..."
        exit 1
    fi
else
    # Check if source files are newer than build
    if [ -n "$(find "$SCRIPT_DIR/client/src" -newer "$SCRIPT_DIR/client/dist/index.html" -type f 2>/dev/null)" ]; then
        echo ""
        echo "  Source files changed, rebuilding client..."
        echo ""
        cd "$SCRIPT_DIR/client"
        npm run build
        if [ $? -ne 0 ]; then
            echo ""
            echo "  ERROR: Failed to build client."
            echo ""
            read -p "Press Enter to exit..."
            exit 1
        fi
    fi
fi

# Start the server
cd "$SCRIPT_DIR/server"
echo ""
echo "  Starting Promptling..."
echo "  Opening http://localhost:3001 in your browser..."
echo ""
echo "  Keep this window open while using Promptling."
echo "  Press Ctrl+C to stop the server."
echo ""

# Open browser after a short delay (in background)
(sleep 2 && open http://localhost:3001 2>/dev/null || xdg-open http://localhost:3001 2>/dev/null || echo "  Please open http://localhost:3001 in your browser") &

# Run the server (this blocks until Ctrl+C)
node index.js
