#!/usr/bin/env python3
"""
X-Plorer backend build script.
Compiles the Python backend using Nuitka (or PyInstaller as fallback).
"""

import os
import sys
import subprocess
import shutil
import argparse
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
ROOT_DIR = SCRIPT_DIR.parent
BACKEND_DIR = ROOT_DIR / "backend"


def run_command(cmd: list[str], cwd: Path | None = None) -> int:
    """Run a command and return the exit code."""
    print(f"\n{'=' * 60}")
    print(f"Running: {' '.join(cmd)}")
    print(f"{'=' * 60}\n")

    result = subprocess.run(cmd, cwd=cwd, shell=(sys.platform == "win32"))
    return result.returncode


def build_cython():
    """Build Cython extensions (optional optimization)."""
    print("\n=== Building Cython extensions ===")

    result = run_command(
        [sys.executable, "setup.py", "build_ext", "--inplace"],
        cwd=BACKEND_DIR
    )

    if result != 0:
        print("WARNING: Cython build failed, continuing with pure Python")
        return False
    return True


def build_with_nuitka():
    """Build with Nuitka."""
    print("Checking Nuitka version...")
    try:
        import nuitka.Version
        version = nuitka.Version.getNuitkaVersion()
        print(f"Nuitka version: {version}")
    except Exception as e:
        print(f"Could not check Nuitka version: {e}")

    dist_dir = BACKEND_DIR / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True)

    # Build with Nuitka
    # Note: PIL and ZMQ have Cython components that don't compile well with Nuitka
    # We exclude them and copy manually after the build
    # Using main.py as entry point to handle package imports correctly
    result = run_command([
        sys.executable, "-m", "nuitka",
        "--standalone",
        "--assume-yes-for-downloads",
        # Our packages - compile these
        "--include-package=xplorer",
        "--include-package=msgpack",
        "--include-package=win32com",
        # Packages with Cython extensions - exclude and copy manually
        "--nofollow-import-to=PIL",
        "--nofollow-import-to=zmq",
        # Exclude test packages and build tools
        "--nofollow-import-to=Cython",
        "--nofollow-import-to=cython",
        "--nofollow-import-to=setuptools",
        "--nofollow-import-to=distutils",
        "--nofollow-import-to=win32com.test",
        "--nofollow-import-to=numpy",
        "--nofollow-import-to=scipy",
        "--nofollow-import-to=pandas",
        "--nofollow-import-to=pytest",
        "--nofollow-import-to=unittest",
        # Output settings
        "--output-dir=dist",
        "--output-filename=xplorer-server",
        "--remove-output",
        "main.py"
    ], cwd=BACKEND_DIR)

    # If Nuitka succeeded, copy packages that we excluded from compilation
    if result == 0:
        print("\nCopying excluded packages to dist folder...")
        server_dist = dist_dir / "main.dist"

        # Copy PIL
        try:
            import PIL
            pil_src = Path(PIL.__file__).parent
            pil_dst = server_dist / "PIL"
            if pil_dst.exists():
                shutil.rmtree(pil_dst)
            shutil.copytree(pil_src, pil_dst)
            print(f"  Copied PIL from {pil_src}")
        except Exception as e:
            print(f"WARNING: Failed to copy PIL: {e}")

        # Copy ZMQ (has Cython .pyd files that need to be included)
        try:
            import zmq
            zmq_src = Path(zmq.__file__).parent
            zmq_dst = server_dist / "zmq"
            if zmq_dst.exists():
                shutil.rmtree(zmq_dst)
            shutil.copytree(zmq_src, zmq_dst)
            print(f"  Copied zmq from {zmq_src}")
        except Exception as e:
            print(f"WARNING: Failed to copy zmq: {e}")

    return result == 0


def build_with_pyinstaller():
    """Build with PyInstaller (fallback)."""
    dist_dir = BACKEND_DIR / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    dist_dir.mkdir(parents=True)

    result = run_command([
        sys.executable, "-m", "PyInstaller",
        "--onedir",
        "--name=xplorer-server",
        "--distpath=dist",
        "--workpath=build",
        "--specpath=build",
        "--noconfirm",
        "--clean",
        "--hidden-import=xplorer",
        "--hidden-import=xplorer.core",
        "--hidden-import=xplorer.services",
        "--hidden-import=xplorer.services.file_service",
        "--hidden-import=xplorer.services.watch_service",
        "--hidden-import=xplorer.services.shell_service",
        "--hidden-import=xplorer.services.clipboard_service",
        "--hidden-import=xplorer.services.theme_service",
        "--hidden-import=zmq",
        "--hidden-import=msgpack",
        "--hidden-import=PIL",
        "--hidden-import=PIL.Image",
        "--hidden-import=win32com",
        "--hidden-import=win32com.client",
        "--hidden-import=win32gui",
        "--hidden-import=win32ui",
        "--hidden-import=win32con",
        "--hidden-import=pythoncom",
        "--collect-all=zmq",
        "--collect-all=msgpack",
        "xplorer/server.py"
    ], cwd=BACKEND_DIR)

    return result == 0


def main():
    parser = argparse.ArgumentParser(description="X-Plorer backend build script")
    parser.add_argument("--pyinstaller", action="store_true",
                        help="Use PyInstaller instead of Nuitka")
    parser.add_argument("--no-cython", action="store_true",
                        help="Skip Cython extension build")
    args = parser.parse_args()

    # Build Cython extensions (optional)
    if not args.no_cython:
        build_cython()

    # Build with Nuitka or PyInstaller
    if args.pyinstaller:
        success = build_with_pyinstaller()
    else:
        success = build_with_nuitka()

    if success:
        print(f"\n{'=' * 60}")
        print("BACKEND BUILD SUCCESSFUL")
        print(f"{'=' * 60}\n")
        return 0
    else:
        print(f"\n{'=' * 60}")
        print("BACKEND BUILD FAILED")
        print(f"{'=' * 60}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
