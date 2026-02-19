"""
P2P latency test: measure Yjs sync time between two WebRTC-connected sessions.

Two headless Chromium instances both load the app (auth bypass, real WebRTC).
Session A creates a shape; session B polls until it observes the new shape.
The delta between the write timestamp and the first successful poll is printed
as the measured P2P latency.

As you deploy WebRTC / Yjs improvements, run this file and watch the latency
figure decrease. The poll interval is 20ms so resolution is ~±10ms.

Run via:
    python tests/run_p2p.py          # starts servers, then runs this file
"""

import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent.parent))
from helpers import navigate_and_wait, get_shape_count, canvas_center

# How long to wait for WebRTC peers to connect before the write.
# y-webrtc negotiates via signaling + ICE; on localhost this typically
# completes in 1-3 seconds. Increase if you see "peers never connected".
WEBRTC_SETTLE_S = 5.0

# Maximum time to wait for session B to observe session A's write.
MAX_WAIT_S = 10.0

# Poll interval for session B (smaller = better resolution, more CPU).
POLL_INTERVAL_S = 0.02  # 20ms → ±10ms resolution


def _get_webrtc_peer_count(page) -> int:
    """Read the y-webrtc peer count from the Konva awareness state."""
    return page.evaluate("""() => {
        // BoardContext exposes debugInfo via the React DevTools store, but the
        // simplest probe is the Yjs awareness: count states that aren't our own.
        // We can't access the React context directly, so we rely on the fact
        // that DebugOverlay writes peer count to a DOM attribute on the canvas-stage
        // element — or fall back to checking window.__yjsAwareness if we expose it.
        //
        // For now return -1 (unknown); the test waits a fixed WEBRTC_SETTLE_S
        // instead of polling peer count.  A future commit can expose awareness
        // via a window global for tighter synchronisation.
        return -1;
    }""")


def test_p2p_latency():
    with sync_playwright() as p:
        browser_a = p.chromium.launch(headless=True)
        browser_b = p.chromium.launch(headless=True)

        page_a = browser_a.new_page()
        page_b = browser_b.new_page()

        try:
            navigate_and_wait(page_a)
            navigate_and_wait(page_b)

            # Give WebRTC time to complete signaling + ICE negotiation.
            print(f"  Waiting {WEBRTC_SETTLE_S}s for WebRTC peers to connect...")
            time.sleep(WEBRTC_SETTLE_S)

            initial_b = get_shape_count(page_b)

            # Session A writes a shape.
            center_a = canvas_center(page_a)
            page_a.click('[data-testid="tool-rect"]')
            page_a.mouse.dblclick(center_a["x"], center_a["y"])
            t_sent = time.time()

            # Session B polls until it sees the new shape.
            deadline = t_sent + MAX_WAIT_S
            received = False
            while time.time() < deadline:
                if get_shape_count(page_b) > initial_b:
                    t_received = time.time()
                    received = True
                    break
                time.sleep(POLL_INTERVAL_S)

            if not received:
                print(f"  FAIL  Session B did not receive the shape within {MAX_WAIT_S}s")
                print(f"        Check that the signaling server is running on port 4444")
                print(f"        and that both sessions joined the same WebRTC room.")
                sys.exit(1)

            latency_ms = (t_received - t_sent) * 1000
            # Subtract half the poll interval to centre the estimate.
            adjusted_ms = max(0.0, latency_ms - (POLL_INTERVAL_S * 500))

            print(f"  P2P latency (raw):     {latency_ms:.0f}ms")
            print(f"  P2P latency (adj ±{POLL_INTERVAL_S*500:.0f}ms): {adjusted_ms:.0f}ms")
            print(f"PASS  test_p2p_latency")

        finally:
            browser_a.close()
            browser_b.close()


if __name__ == "__main__":
    test_p2p_latency()
