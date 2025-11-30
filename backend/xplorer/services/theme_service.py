"""
Theme management service.
"""

import json
import os
from pathlib import Path
from typing import Any
import logging

logger = logging.getLogger(__name__)

# Theme storage directory
THEME_DIR = Path(os.environ.get("APPDATA", "")) / "X-Plorer" / "themes"


class ThemeService:
    """Service for managing custom themes."""

    def __init__(self):
        THEME_DIR.mkdir(parents=True, exist_ok=True)

    async def list_themes(self) -> list[dict[str, Any]]:
        """List all available custom themes."""
        themes = []

        try:
            for file in THEME_DIR.glob("*.json"):
                try:
                    with open(file, "r", encoding="utf-8") as f:
                        theme = json.load(f)
                        themes.append({
                            "id": file.stem,
                            "name": theme.get("name", file.stem),
                            "base": theme.get("base", "dark"),
                        })
                except Exception as e:
                    logger.error(f"Error loading theme {file}: {e}")

        except Exception as e:
            logger.error(f"Error listing themes: {e}")

        return themes

    async def get_theme(self, theme_id: str) -> dict[str, Any]:
        """Get a theme by ID."""
        theme_path = THEME_DIR / f"{theme_id}.json"

        if not theme_path.exists():
            raise FileNotFoundError(f"Theme not found: {theme_id}")

        with open(theme_path, "r", encoding="utf-8") as f:
            return json.load(f)

    async def save_theme(self, theme: dict[str, Any]) -> dict[str, Any]:
        """Save a custom theme."""
        theme_id = theme.get("id")
        if not theme_id:
            raise ValueError("Theme ID is required")

        theme_path = THEME_DIR / f"{theme_id}.json"

        with open(theme_path, "w", encoding="utf-8") as f:
            json.dump(theme, f, indent=2)

        return {"id": theme_id, "path": str(theme_path)}

    async def delete_theme(self, theme_id: str) -> dict[str, Any]:
        """Delete a custom theme."""
        theme_path = THEME_DIR / f"{theme_id}.json"

        if not theme_path.exists():
            raise FileNotFoundError(f"Theme not found: {theme_id}")

        theme_path.unlink()
        return {"deleted": theme_id}
