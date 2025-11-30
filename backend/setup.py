"""
Cython build configuration for XPLORER backend.
Run with: python setup.py build_ext --inplace
"""

from setuptools import setup, Extension
from Cython.Build import cythonize
import platform
import sys

# Windows-specific compiler settings
extra_compile_args = []
extra_link_args = []

if platform.system() == "Windows":
    extra_compile_args = ["/O2", "/W3"]
    extra_link_args = ["shell32.lib", "ole32.lib", "user32.lib", "shlwapi.lib"]
else:
    extra_compile_args = ["-O3", "-Wall"]

# Define Cython extensions
extensions = [
    Extension(
        "xplorer.core.filesystem",
        sources=["xplorer/core/filesystem.pyx"],
        extra_compile_args=extra_compile_args,
        extra_link_args=extra_link_args,
        language="c",
    ),
    Extension(
        "xplorer.core.watcher",
        sources=["xplorer/core/watcher.pyx"],
        extra_compile_args=extra_compile_args,
        extra_link_args=extra_link_args,
        language="c",
    ),
    Extension(
        "xplorer.core.clipboard",
        sources=["xplorer/core/clipboard.pyx"],
        extra_compile_args=extra_compile_args,
        extra_link_args=extra_link_args,
        language="c",
    ),
    Extension(
        "xplorer.core.thumbnail",
        sources=["xplorer/core/thumbnail.pyx"],
        extra_compile_args=extra_compile_args,
        extra_link_args=extra_link_args,
        language="c",
    ),
    Extension(
        "xplorer.core.shell",
        sources=["xplorer/core/shell.pyx"],
        extra_compile_args=extra_compile_args,
        extra_link_args=extra_link_args,
        language="c",
    ),
]

setup(
    name="xplorer-backend",
    ext_modules=cythonize(
        extensions,
        compiler_directives={
            "language_level": "3",
            "boundscheck": False,
            "wraparound": False,
            "cdivision": True,
            "embedsignature": True,
        },
        annotate=True,  # Generate HTML annotation files
    ),
)
