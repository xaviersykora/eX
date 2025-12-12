"""
Generate a 32x32 base64 PNG for the tray icon.
Usage: python scripts/generate-tray-icon.py
"""

import base64
import io
from PIL import Image

def generate_tray_icon_base64(input_path: str, size: int = 32) -> str:
    """Load image, resize to size x size, and convert to base64 PNG."""
    # Load and resize image
    img = Image.open(input_path)
    img = img.convert('RGBA')  # Ensure RGBA for transparency
    img = img.resize((size, size), Image.Resampling.LANCZOS)

    # Save to bytes buffer as PNG
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    buffer.seek(0)

    # Convert to base64
    base64_data = base64.b64encode(buffer.read()).decode('utf-8')
    return f"data:image/png;base64,{base64_data}"

if __name__ == "__main__":
    import os

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    icon_path = os.path.join(project_root, "resources", "icon.png")

    if not os.path.exists(icon_path):
        print(f"Error: Icon not found at {icon_path}")
        exit(1)

    result = generate_tray_icon_base64(icon_path)
    print("Generated base64 tray icon:")
    print(result)
    print()
    print("Copy the above string to replace TRAY_ICON_BASE64 in src/main/index.ts")
