const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_URL = process.env.ANEXTPOST_BACKEND_URL || 'http://localhost:3000';
const TARGET_URL = process.env.ANEXTPOST_UI_URL || 'http://localhost:4200';
const ELECTRON_BIN = path.resolve(
  ROOT_DIR,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron'
);
const MAIN_PATH = path.resolve(__dirname, 'main.js');

let backendProc = null;
let frontendProc = null;
let electronProc = null;

function checkUrl(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https://') ? https : http;
    const req = client.get(url, (res) => {
      res.resume();
      // Any HTTP response < 500 (including 401/404 from API root) proves the server is up.
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function isPortInUse(urlStr) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(urlStr);
      const port = Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
      const host = parsed.hostname || '127.0.0.1';
      const sock = net.createConnection({ port, host });
      sock.setTimeout(1000);
      sock.once('connect', () => {
        sock.destroy();
        resolve(true);
      });
      sock.once('timeout', () => {
        sock.destroy();
        resolve(true);
      });
      sock.once('error', () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

async function waitForUrl(url, timeoutMs = 90000, proc = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc && (proc.exitCode !== null || proc.signalCode !== null)) {
      console.error(
        `[ANEXTPOST Desktop] Process exited early (code=${proc.exitCode}, signal=${proc.signalCode}) before ${url} became ready.`
      );
      return false;
    }
    if (await checkUrl(url)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function validatePaths() {
  if (!fs.existsSync(MAIN_PATH)) {
    throw new Error(`Missing Electron main entry at ${MAIN_PATH}`);
  }
  if (!fs.existsSync(ELECTRON_BIN)) {
    throw new Error(
      `Missing Electron binary at ${ELECTRON_BIN}. Run "pnpm install" in ${ROOT_DIR} and retry.`
    );
  }
}

function cleanup() {
  for (const proc of [electronProc, frontendProc, backendProc]) {
    if (proc && proc.exitCode === null && !proc.killed) {
      proc.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

async function main() {
  validatePaths();

  const backendRunning = await checkUrl(BACKEND_URL);
  if (!backendRunning) {
    if (await isPortInUse(BACKEND_URL)) {
      console.error(`[ANEXTPOST Desktop] Port for ${BACKEND_URL} is already in use by an unresponsive process. Free the port and retry.`);
      process.exit(1);
    }
    console.log('[ANEXTPOST Desktop] Ensuring local Postgres & Redis containers are running...');
    const compose = spawnSync(
      'docker',
      ['compose', '-f', 'docker-compose.local.yaml', 'up', '-d', '--wait'],
      { cwd: ROOT_DIR, stdio: 'inherit' }
    );
    if (compose.error || compose.status !== 0) {
      const detail = compose.error ? compose.error.message : `exit code ${compose.status}`;
      console.error(`[ANEXTPOST Desktop] Failed to start docker-compose.local.yaml services (${detail}).`);
      process.exit(1);
    }

    console.log(`[ANEXTPOST Desktop] Starting backend server for ${BACKEND_URL}...`);
    backendProc = spawn('pnpm', ['run', 'dev:backend'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env,
    });
    backendProc.on('error', (err) => {
      console.error('[ANEXTPOST Desktop] Backend process error:', err.message);
    });
    const backendReady = await waitForUrl(BACKEND_URL, 180000, backendProc);
    if (!backendReady) {
      console.error(`[ANEXTPOST Desktop] Timed out or exited waiting for backend at ${BACKEND_URL}`);
      cleanup();
      process.exit(1);
    }
  } else {
    console.log(`[ANEXTPOST Desktop] Reusing running backend at ${BACKEND_URL}`);
  }

  const alreadyRunning = await checkUrl(TARGET_URL);
  if (!alreadyRunning) {
    if (await isPortInUse(TARGET_URL)) {
      console.error(`[ANEXTPOST Desktop] Port for ${TARGET_URL} is already in use by an unresponsive process. Free the port and retry.`);
      cleanup();
      process.exit(1);
    }
    console.log(`[ANEXTPOST Desktop] Starting frontend server for ${TARGET_URL}...`);
    frontendProc = spawn('pnpm', ['run', 'dev:frontend'], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env,
    });
    frontendProc.on('error', (err) => {
      console.error('[ANEXTPOST Desktop] Frontend process error:', err.message);
    });
    const ready = await waitForUrl(TARGET_URL, 60000, frontendProc);
    if (!ready) {
      console.error(`[ANEXTPOST Desktop] Timed out or exited waiting for ${TARGET_URL}`);
      cleanup();
      process.exit(1);
    }
  } else {
    console.log(`[ANEXTPOST Desktop] Reusing running UI at ${TARGET_URL}`);
  }

  console.log(`[ANEXTPOST Desktop] Launching Electron from ${MAIN_PATH}`);
  const electronEnv = {
    ...process.env,
    ANEXTPOST_UI_URL: TARGET_URL,
  };
  delete electronEnv.ELECTRON_RUN_AS_NODE;

  electronProc = spawn(ELECTRON_BIN, [MAIN_PATH], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: electronEnv,
  });

  electronProc.on('error', (err) => {
    console.error('[ANEXTPOST Desktop] Failed to launch Electron:', err.message);
    cleanup();
    process.exit(1);
  });

  electronProc.on('exit', (code, signal) => {
    cleanup();
    if (signal) {
      console.error(`[ANEXTPOST Desktop] Electron exited with signal ${signal}`);
      process.exit(1);
    }
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('[ANEXTPOST Desktop] Launcher error:', err);
  cleanup();
  process.exit(1);
});
