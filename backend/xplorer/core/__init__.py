"""
Cython core modules for X-Plorer.
These modules provide high-performance file system operations.
"""

# Try to import Cython modules, they may not be compiled yet
try:
    from . import filesystem
    from . import watcher
    from . import clipboard
    from . import thumbnail
    from . import shell
except ImportError:
    # Cython modules not compiled yet
    pass
