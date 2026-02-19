"""
Shared helpers for the CollabBoard Playwright test suite.

All helpers assume:
  - The dev server is running at http://localhost:3000
  - VITE_TEST_MODE=true (auth bypass + in-memory Yjs, no Firebase/WebRTC)
  - data-testid attributes from feature/test-selectors are present
"""

import time
from playwright.sync_api import Page, expect


BASE_URL = "http://localhost:3000"

# Konva node types that are framework internals, not board objects.
_INTERNAL_NODE_TYPES = {"Transformer", "TransformerAnchor"}


def navigate_and_wait(page: Page) -> None:
    """Navigate to the app root and wait for network activity to settle."""
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")


def get_shape_count(page: Page) -> int:
    """Return the number of user-created shapes on the Konva stage.

    Queries window.Konva.stages[0] layer children directly, filtering out
    Transformer nodes which are Konva internals rather than board objects.
    """
    return page.evaluate("""() => {
        const stage = window.Konva?.stages?.[0];
        if (!stage) return 0;
        const layer = stage.getLayers()[0];
        if (!layer) return 0;
        return layer.getChildren().filter(
            node => !['Transformer', 'TransformerAnchor'].includes(node.getClassName())
        ).length;
    }""")


def canvas_center(page: Page) -> dict:
    """Return {x, y} pixel coordinates of the canvas-stage element's center."""
    bbox = page.locator('[data-testid="canvas-stage"]').bounding_box()
    return {
        "x": bbox["x"] + bbox["width"] / 2,
        "y": bbox["y"] + bbox["height"] / 2,
    }


def create_shape(page: Page, tool_name: str) -> None:
    """Select a tool from the toolbar and double-click the canvas center to place a shape.

    For 'line' the tool requires two clicks (start + end point), so we click
    twice at slightly offset positions to complete the two-step line placement.
    """
    page.click(f'[data-testid="tool-{tool_name}"]')
    center = canvas_center(page)

    if tool_name == "line":
        # Line tool: first double-click sets start, second sets end.
        page.mouse.dblclick(center["x"] - 40, center["y"])
        page.mouse.dblclick(center["x"] + 40, center["y"])
    else:
        page.mouse.dblclick(center["x"], center["y"])
