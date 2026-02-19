"""
Test: canvas loads correctly in test mode.

Asserts:
  - Toolbar is visible
  - Canvas stage wrapper is visible
  - Top bar shows the mock user name "Test User"
  - No login page is shown (auth bypass worked)

Saves: tests/screenshots/canvas_load.png
"""

import os
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

# Allow running directly: python tests/playwright/test_canvas_load.py
sys.path.insert(0, str(Path(__file__).parent))
from helpers import navigate_and_wait

SCREENSHOTS_DIR = Path(__file__).parent.parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)


def test_canvas_load():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)

        # Auth bypass should have skipped the login screen entirely.
        assert page.locator('[data-testid="login-page"]').count() == 0, \
            "Login page should not be visible when VITE_TEST_MODE=true"

        assert page.locator('[data-testid="toolbar"]').is_visible(), \
            "Toolbar should be visible after canvas loads"

        assert page.locator('[data-testid="canvas-stage"]').is_visible(), \
            "Canvas stage should be visible"

        user_name_el = page.locator('[data-testid="user-name"]')
        assert user_name_el.is_visible(), "User name element should be visible in top bar"
        assert "Test User" in (user_name_el.text_content() or ""), \
            f"Expected 'Test User', got: {user_name_el.text_content()!r}"

        page.screenshot(path=str(SCREENSHOTS_DIR / "canvas_load.png"))
        print("PASS  test_canvas_load")

        browser.close()


if __name__ == "__main__":
    test_canvas_load()
