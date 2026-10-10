#!/usr/bin/env node
/**
 * BankNifty AlgoEdge Pro - Desktop Launcher
 * ========================================
 * Launches the terminal in standalone desktop application mode:
 *  1. Checks if Python server is active (starts if not).
 *  2. Checks if Node.js WebSocket Streamer is active (starts if not).
 *  3. Launches in Electron if installed, OR in native Chrome/Edge App Mode
 *     (frameless window with zero browser tabs/toolbars).
 */

const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');

const TERMINAL_URL = 'http://localhost:8080';

console.log('\n======================================================');
console.log(' 🚀 LAUNCHING BANKNIFTY ALGOEDGE PRO DESKTOP COCKPIT');
console.log('======================================================\n');

function checkServer(port, callback) {
  const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
    callback(res.statusCode === 200);
  });
  req.on('error', () => callback(false));
  req.setTimeout(1000, () => {
    req.destroy();
    callback(false);
  });
}

function checkStreamer(callback) {
  const req = http.get(`http://127.0.0.1:8082`, (res) => {
    callback(res.statusCode === 200);
  });
  req.on('error', () => callback(false));
  req.setTimeout(1000, () => {
    req.destroy();
    callback(false);
  });
}

function launchApp() {
  // Check if electron is available
  try {
    const electron = require('electron');
    if (electron) {
      console.log('⚡ Launching native Electron application window...');
      const child = spawn(electron, [path.join(__dirname, 'electron_main.js')], {
        stdio: 'inherit',
        detached: false
      });
      return;
    }
  } catch (e) {
    // Electron not installed locally; launch in OS Native Dedicated App Mode
  }

  console.log('🖥️  Launching Native Dedicated Desktop Window Mode...');
  if (process.platform === 'darwin') {
    // macOS: Try Google Chrome in --app mode, then Microsoft Edge, then default browser
    const chromeCmd = `/Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --app="${TERMINAL_URL}" --window-size=1440,900 --user-data-dir="/tmp/banknifty-algo-profile"`;
    exec(chromeCmd, (err) => {
      if (err) {
        // Fallback to open
        exec(`open "${TERMINAL_URL}"`);
      }
    });
  } else if (process.platform === 'win32') {
    exec(`start chrome --app="${TERMINAL_URL}" --window-size=1440,900`);
  } else {
    exec(`google-chrome --app="${TERMINAL_URL}" || xdg-open "${TERMINAL_URL}"`);
  }

  console.log(`✅ BankNifty Desktop Cockpit launched at: ${TERMINAL_URL}`);
}

// 1. Ensure Python backend is running
checkServer(8080, (isPythonOnline) => {
  if (isPythonOnline) {
    console.log('✓ Python Backend Server is active on port 8080');
  } else {
    console.log('⚙️ Starting Python Backend Server...');
    spawn('python3', ['server.py'], { detached: true, stdio: 'ignore' }).unref();
  }

  // 2. Ensure Node.js WebSocket Streamer is running
  checkStreamer((isStreamerOnline) => {
    if (isStreamerOnline) {
      console.log('✓ Node.js WebSocket Streamer is active on port 8081');
    } else {
      console.log('⚙️ Starting Node.js WebSocket Streamer...');
      spawn('node', ['streamer.js'], { detached: true, stdio: 'ignore' }).unref();
    }

    setTimeout(launchApp, 800);
  });
});
