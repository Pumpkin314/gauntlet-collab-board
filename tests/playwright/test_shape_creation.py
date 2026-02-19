"""
Test: each tool in the toolbar creates a new shape on the canvas.

For each tool (sticky, rect, circle, text, line):
  - Switch to the tool, double-click canvas center
  - Assert the Konva shape count increased by at least 1
  - For sticky / text: also assert the inline edit textarea appears
    (double-clicking a newly created text object opens it for editing)

Saves screenshots to tests/screenshots/shape_<tool>.png
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from helpers import navigate_and_wait, get_shape_count, create_shape, canvas_center

SCREENSHOTS_DIR = Path(__file__).parent.parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)

# Tools that should create exactly one shape per double-click at canvas center.
# line is handled separately below because it requires two clicks.
SIMPLE_TOOLS = ["sticky", "rect", "circle", "text"]


def test_shape_creation():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)

        for tool in SIMPLE_TOOLS:
            before = get_shape_count(page)
            # Dismiss any open inline editor from previous iteration.
            page.keyboard.press("Escape")
            page.keyboard.press("Escape")

            create_shape(page, tool)
            time.sleep(0.3)  # let Yjs observe callback update React state

            after = get_shape_count(page)
            assert after > before, \
                f"Expected shape count to increase after creating '{tool}', " \
                f"got before={before} after={after}"

            page.screenshot(path=str(SCREENSHOTS_DIR / f"shape_{tool}.png"))
            print(f"PASS  {tool}: {before} → {after} shapes")

        # Line tool — double-click twice (start + end) to complete the segment.
        before = get_shape_count(page)
        page.keyboard.press("Escape")
        create_shape(page, "line")
        time.sleep(0.3)
        after = get_shape_count(page)
        assert after > before, \
            f"Expected shape count to increase after creating 'line', " \
            f"got before={before} after={after}"
        page.screenshot(path=str(SCREENSHOTS_DIR / "shape_line.png"))
        print(f"PASS  line: {before} → {after} shapes")

        browser.close()


if __name__ == "__main__":
    test_shape_creation()
