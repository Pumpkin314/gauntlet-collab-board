#!/usr/bin/env python3
"""
P2P test runner for WebRTC latency tests.

Starts two servers:
  1. y-webrtc signaling server on port 4445  (npm run dev:signal)
  2. Vite dev server on port 3000            (VITE_TEST_AUTH_BYPASS=true npm run dev)

VITE_TEST_SKIP_SYNC is intentionally NOT set, so WebRTC and Yjs sync
run normally. Firestore will fail with stub credentials but the board
still loads because FirestoreYjsProvider.onSynced fires on error.

Discovers and runs all tests/playwright/p2p/test_*.py files, then
prints a pass/fail summary.

Usage:
    python tests/run_p2p.py
"""

import socket
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT     = Path(__file__).parent.parent
P2P_TESTS_DIR = REPO_ROOT / "tests" / "playwright" / "p2p"

SIGNAL_CMD  = "npm run dev:signal"
SIGNAL_PORT = 4445

DEV_CMD  = "VITE_TEST_AUTH_BYPASS=true npm run dev"
DEV_PORT = 3000

TIMEOUT = 60  # seconds per server


def _wait_for_port(port: int, timeout: int) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("localhost", port), timeout=1):
                return True
        except (socket.error, ConnectionRefusedError):
            time.sleep(0.5)
    return False


def main() -> int:
    test_files = sorted(P2P_TESTS_DIR.glob("test_*.py"))
    if not test_files:
        print(f"No P2P test files found in {P2P_TESTS_DIR}")
        return 1

    processes = []
    try:
        # Start signaling server first — WebRTC peers need it to discover each other.
        print(f"Starting signaling server: {SIGNAL_CMD}")
        sig = subprocess.Popen(
            SIGNAL_CMD, shell=True, cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        processes.append(sig)
        print(f"Waiting for signaling server on port {SIGNAL_PORT}...")
        if not _wait_for_port(SIGNAL_PORT, TIMEOUT):
            print(f"ERROR: Signaling server did not start on port {SIGNAL_PORT} within {TIMEOUT}s")
            return 1
        print(f"Signaling server ready on port {SIGNAL_PORT}")

        # Start dev server with auth bypass only (WebRTC runs normally).
        print(f"\nStarting dev server: {DEV_CMD}")
        dev = subprocess.Popen(
            DEV_CMD, shell=True, cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        processes.append(dev)
        print(f"Waiting for dev server on port {DEV_PORT}...")
        if not _wait_for_port(DEV_PORT, TIMEOUT):
            print(f"ERROR: Dev server did not start on port {DEV_PORT} within {TIMEOUT}s")
            return 1
        print(f"Dev server ready on port {DEV_PORT}\n")

        results: list[tuple[str, bool, str]] = []

        for test_file in test_files:
            print(f"Running {test_file.name} ...")
            result = subprocess.run(
                [sys.executable, str(test_file)],
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
            )
            passed = result.returncode == 0
            output = (result.stdout + result.stderr).strip()
            results.append((test_file.name, passed, output))

            status = "PASS" if passed else "FAIL"
            print(f"  {status}  {test_file.name}")
            # Always print output for P2P tests — latency numbers are the point.
            for line in output.splitlines():
                print(f"    {line}")

        print("\n" + "=" * 60)
        print("P2P TEST SUMMARY")
        print("=" * 60)
        passed_count = sum(1 for _, ok, _ in results if ok)
        for name, ok, _ in results:
            print(f"  {'PASS' if ok else 'FAIL'}  {name}")
        print(f"\n{passed_count}/{len(results)} tests passed")

        return 0 if passed_count == len(results) else 1

    finally:
        print("\nStopping servers...")
        for proc in processes:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
        print("Servers stopped")


if __name__ == "__main__":
    sys.exit(main())
