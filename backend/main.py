#!/usr/bin/env python3
"""
Entry point for X-Plorer backend server.
This wrapper ensures the xplorer package can be imported correctly.
"""

import sys
import os

# Ensure the parent directory is in the path for imports
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    app_dir = os.path.dirname(sys.executable)
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)
else:
    # Running as script
    app_dir = os.path.dirname(os.path.abspath(__file__))
    if app_dir not in sys.path:
        sys.path.insert(0, app_dir)

# Now import and run the server
from xplorer.server import main
import asyncio

if __name__ == "__main__":
    asyncio.run(main())
