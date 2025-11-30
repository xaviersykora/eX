/**
 * X-Plorer build script
 * Builds backend (Nuitka), frontend (electron-vite), and packages the app
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${command} ${args.join(' ')}`);
    console.log(`${'='.repeat(60)}\n`);

    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      cwd: options.cwd || ROOT_DIR,
      ...options
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

async function buildBackend() {
  console.log('\n=== Building Python backend with Nuitka ===\n');
  await runCommand('python', [path.join(__dirname, 'build-backend.py')], {
    cwd: BACKEND_DIR
  });
}

async function buildFrontend() {
  console.log('\n=== Building Electron frontend ===\n');
  await runCommand('npx', ['electron-vite', 'build']);
}

function cleanReleaseDir() {
  console.log('\n=== Cleaning release directory ===\n');
  if (fs.existsSync(RELEASE_DIR)) {
    try {
      fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
      console.log('Cleaned release directory');
    } catch (err) {
      console.warn(`Warning: Could not fully clean release directory: ${err.message}`);
      console.warn('Some files may be in use. Close any running X-Plorer instances and try again.');
    }
  }
}

async function packageApp() {
  console.log('\n=== Packaging application ===\n');
  cleanReleaseDir();
  await runCommand('npx', ['electron-builder', '--win']);
}

async function main() {
  const args = process.argv.slice(2);
  const skipBackend = args.includes('--skip-backend');
  const skipFrontend = args.includes('--skip-frontend');
  const skipPackage = args.includes('--skip-package');

  try {
    // Build backend
    if (!skipBackend) {
      await buildBackend();
    }

    // Build frontend
    if (!skipFrontend) {
      await buildFrontend();
    }

    // Package with electron-builder
    if (!skipPackage) {
      await packageApp();
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('BUILD SUCCESSFUL');
    console.log(`${'='.repeat(60)}\n`);

  } catch (error) {
    console.error(`\n${'='.repeat(60)}`);
    console.error('BUILD FAILED');
    console.error(error.message);
    console.error(`${'='.repeat(60)}\n`);
    process.exit(1);
  }
}

main();
