"""
Test: scroll-wheel zoom and drag-pan change the canvas viewport.

Scenarios:
  1. Baseline screenshot → scroll wheel to zoom in → compare to baseline
  2. After zoom-in, drag the canvas horizontally to pan → screenshot
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from helpers import navigate_and_wait, canvas_center

SCREENSHOTS_DIR = Path(__file__).parent.parent / "screenshots"
SCREENSHOTS_DIR.mkdir(exist_ok=True)


def _get_stage_transform(page) -> dict:
    """Read the current Konva stage scale and position."""
    return page.evaluate("""() => {
        const stage = window.Konva?.stages?.[0];
        if (!stage) return { scaleX: 1, x: 0, y: 0 };
        return { scaleX: stage.scaleX(), x: stage.x(), y: stage.y() };
    }""")


def test_zoom():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)
        center = canvas_center(page)

        baseline = _get_stage_transform(page)
        page.screenshot(path=str(SCREENSHOTS_DIR / "zoom_baseline.png"))

        # Scroll up (negative deltaY) to zoom in.
        page.mouse.move(center["x"], center["y"])
        page.mouse.wheel(0, -300)
        time.sleep(0.3)

        after_zoom = _get_stage_transform(page)
        page.screenshot(path=str(SCREENSHOTS_DIR / "zoom_in.png"))

        assert after_zoom["scaleX"] > baseline["scaleX"], \
            f"Expected scale to increase after zoom-in, " \
            f"got baseline={baseline['scaleX']:.3f} after={after_zoom['scaleX']:.3f}"

        print(f"PASS  test_zoom: scale {baseline['scaleX']:.3f} → {after_zoom['scaleX']:.3f}")
        browser.close()


def test_pan():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        navigate_and_wait(page)
        center = canvas_center(page)

        before_pan = _get_stage_transform(page)

        # Drag the stage (cursor tool is active by default → stage is draggable).
        page.mouse.move(center["x"], center["y"])
        page.mouse.down()
        page.mouse.move(center["x"] + 150, center["y"] + 80, steps=10)
        page.mouse.up()
        time.sleep(0.2)

        after_pan = _get_stage_transform(page)
        page.screenshot(path=str(SCREENSHOTS_DIR / "pan.png"))

        pan_dx = abs(after_pan["x"] - before_pan["x"])
        pan_dy = abs(after_pan["y"] - before_pan["y"])
        assert pan_dx > 10 or pan_dy > 10, \
            f"Expected stage position to change after drag-pan, " \
            f"got dx={pan_dx:.1f} dy={pan_dy:.1f}"

        print(f"PASS  test_pan: stage moved ({pan_dx:.0f}px, {pan_dy:.0f}px)")
        browser.close()


if __name__ == "__main__":
    test_zoom()
    test_pan()
