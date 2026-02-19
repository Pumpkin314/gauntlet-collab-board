"""
Test: sticky note content persists after editing via the inline textarea.

Steps:
  1. Create a sticky note (tool-sticky → double-click canvas center)
  2. The inline textarea opens automatically; type "Hello Test"
  3. Press Ctrl+Enter to save and close the editor
  4. Double-click the sticky note position again to reopen the inline editor
  5. Assert the textarea's current value is "Hello Test"

Saves: tests/screenshots/sticky_edited.png
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from helpers import navigate_and_wait, canvas_center

SCREENSHOTS_DIR = Path(__file__).parent.parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

TEST_CONTENT = "Hello Test"


def test_shape_editing():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)
        center = canvas_center(page)

        # Select sticky tool and double-click to create + open inline editor.
        page.click('[data-testid="tool-sticky"]')
        page.mouse.dblclick(center["x"], center["y"])
        time.sleep(0.3)

        # The inline editor is a <textarea> that appears over the canvas.
        # Canvas.tsx renders it without a data-testid (it's a native element),
        # so we target by tag within the canvas-stage container.
        editor = page.locator('[data-testid="canvas-stage"] textarea')
        assert editor.is_visible(), "Inline textarea should open after double-clicking canvas"

        # Clear any placeholder text and type our test content.
        editor.fill("")
        editor.type(TEST_CONTENT)
        page.keyboard.press("Control+Enter")
        time.sleep(0.2)

        # Re-open the sticky note's inline editor.
        page.mouse.dblclick(center["x"], center["y"])
        time.sleep(0.3)

        editor2 = page.locator('[data-testid="canvas-stage"] textarea')
        assert editor2.is_visible(), "Inline textarea should reopen on second double-click"

        actual = editor2.input_value()
        assert actual == TEST_CONTENT, \
            f"Expected textarea to contain {TEST_CONTENT!r}, got {actual!r}"

        page.screenshot(path=str(SCREENSHOTS_DIR / "sticky_edited.png"))
        print(f"PASS  test_shape_editing: content persisted as {actual!r}")

        browser.close()


if __name__ == "__main__":
    test_shape_editing()
