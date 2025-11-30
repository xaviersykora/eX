/**
 * Waits for the backend to be ready, then starts the frontend dev server.
 */
const { spawn } = require('child_process');
const net = require('net');

const BACKEND_PORT = 5555;
const MAX_RETRIES = 30;
const RETRY_INTERVAL = 1000;

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(500);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, '127.0.0.1');
  });
}

async function waitForBackend() {
  console.log('[frontend] Waiting for backend to start...');

  for (let i = 0; i < MAX_RETRIES; i++) {
    const isReady = await checkPort(BACKEND_PORT);
    if (isReady) {
      console.log('[frontend] Backend is ready!');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
  }

  console.error('[frontend] Backend did not start in time');
  return false;
}

async function main() {
  const backendReady = await waitForBackend();

  if (!backendReady) {
    process.exit(1);
  }

  // Start electron-vite dev
  const child = spawn('npx', ['electron-vite', 'dev'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

main();
