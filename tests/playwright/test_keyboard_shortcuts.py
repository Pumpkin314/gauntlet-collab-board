"""
Test: keyboard shortcuts behave correctly.

Scenarios:
  1. Ctrl+A selects all shapes → Delete removes them → shape count == 0
  2. Backtick (`) toggles the debug overlay open and closed
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from helpers import navigate_and_wait, get_shape_count, create_shape

SCREENSHOTS_DIR = Path(__file__).parent.parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)


def test_select_all_and_delete():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)

        # Create two shapes so there's something to select.
        create_shape(page, "rect")
        page.keyboard.press("Escape")
        time.sleep(0.2)
        create_shape(page, "circle")
        page.keyboard.press("Escape")
        time.sleep(0.2)

        count_before = get_shape_count(page)
        assert count_before >= 2, f"Expected at least 2 shapes, got {count_before}"

        # Ctrl+A → screenshot to capture selected state.
        page.keyboard.press("Control+a")
        time.sleep(0.1)
        page.screenshot(path=str(SCREENSHOTS_DIR / "select_all.png"))

        # Delete selected objects.
        page.keyboard.press("Delete")
        time.sleep(0.3)

        count_after = get_shape_count(page)
        assert count_after == 0, \
            f"Expected 0 shapes after Ctrl+A → Delete, got {count_after}"

        print(f"PASS  test_select_all_and_delete: {count_before} → {count_after}")
        browser.close()


def test_debug_overlay_toggle():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)

        # Debug overlay should not be in the DOM initially.
        assert page.locator('[data-testid="debug-overlay"]').count() == 0, \
            "Debug overlay should be hidden on load"

        # First backtick: open the overlay.
        page.keyboard.press("`")
        time.sleep(0.2)
        assert page.locator('[data-testid="debug-overlay"]').is_visible(), \
            "Debug overlay should be visible after first backtick press"
        page.screenshot(path=str(SCREENSHOTS_DIR / "debug_overlay_open.png"))

        # Second backtick: close the overlay.
        page.keyboard.press("`")
        time.sleep(0.2)
        assert page.locator('[data-testid="debug-overlay"]').count() == 0, \
            "Debug overlay should be hidden after second backtick press"

        print("PASS  test_debug_overlay_toggle")
        browser.close()


if __name__ == "__main__":
    test_select_all_and_delete()
    test_debug_overlay_toggle()
