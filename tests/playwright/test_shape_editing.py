"""
Test: sticky note content persists after editing via the inline textarea.

Steps:
  1. Create a sticky note (tool-sticky → double-click canvas center)
  2. Switch to cursor tool (so the next double-click hits the shape, not the stage)
  3. Double-click the sticky's visual center → StickyNote.onDblClick → inline textarea opens
  4. Type "Hello Test", press Ctrl+Enter to save
  5. Double-click the same position to reopen the editor
  6. Assert the textarea value is "Hello Test"

The inline editor is a <textarea> positioned over the canvas-stage div by
Canvas.tsx. It has no data-testid, so we select it by tag within the wrapper.

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

# Default sticky note size (matches SHAPE_DEFAULTS in BoardContext).
STICKY_W = 200
STICKY_H = 200


def test_shape_editing():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)
        center = canvas_center(page)

        # 1. Create sticky — stage dblclick with sticky tool active.
        page.click('[data-testid="tool-sticky"]')
        page.mouse.dblclick(center["x"], center["y"])
        time.sleep(0.4)  # let Yjs observer update React state and render the shape

        # 2. Switch to cursor so the next dblclick hits the Konva shape, not the stage.
        #    (With sticky tool still active a stage dblclick creates another shape.)
        page.click('[data-testid="tool-cursor"]')
        time.sleep(0.1)

        # 3. Double-click the sticky's visual center.
        #    The sticky's top-left corner is at (center.x, center.y) in screen space
        #    (scale=1, pan=0 on load), so its center is 100px right and down.
        sticky_cx = center["x"] + STICKY_W / 2
        sticky_cy = center["y"] + STICKY_H / 2
        page.mouse.dblclick(sticky_cx, sticky_cy)
        time.sleep(0.3)

        # The inline editor is a <textarea> overlaid on the canvas-stage div.
        editor = page.locator('[data-testid="canvas-stage"] textarea')
        assert editor.is_visible(), \
            "Inline textarea should open after double-clicking the sticky note"

        # 4. Replace placeholder text and type test content.
        editor.fill("")
        editor.type(TEST_CONTENT)
        page.keyboard.press("Control+Enter")
        time.sleep(0.3)

        # 5. Reopen the inline editor with another dblclick on the same spot.
        page.mouse.dblclick(sticky_cx, sticky_cy)
        time.sleep(0.3)

        editor2 = page.locator('[data-testid="canvas-stage"] textarea')
        assert editor2.is_visible(), \
            "Inline textarea should reopen on second double-click of the sticky"

        # 6. Assert content round-tripped correctly through the in-memory Yjs CRDT.
        actual = editor2.input_value()
        assert actual == TEST_CONTENT, \
            f"Expected textarea to contain {TEST_CONTENT!r}, got {actual!r}"

        page.screenshot(path=str(SCREENSHOTS_DIR / "sticky_edited.png"))
        print(f"PASS  test_shape_editing: content persisted as {actual!r}")

        browser.close()


if __name__ == "__main__":
    test_shape_editing()
