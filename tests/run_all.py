#!/usr/bin/env python3
"""
Master test runner for the CollabBoard Playwright suite.

Starts the Vite dev server in test mode (VITE_TEST_MODE=true), discovers
all tests/playwright/test_*.py files, runs each as a subprocess, then
prints a pass/fail summary and exits non-zero if any test failed.

Usage:
    python tests/run_all.py

Running a single test without this runner:
    python .agents/skills/webapp-testing/scripts/with_server.py \\
      --server "VITE_TEST_MODE=true npm run dev" --port 3000 \\
      -- python tests/playwright/test_canvas_load.py
"""

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT  = Path(__file__).parent.parent
TESTS_DIR  = REPO_ROOT / "tests" / "playwright"
SERVER_CMD = "VITE_TEST_MODE=true npm run dev"
PORT       = 3000
TIMEOUT    = 60  # seconds to wait for server readiness


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
    test_files = sorted(TESTS_DIR.glob("test_*.py"))
    if not test_files:
        print(f"No test files found in {TESTS_DIR}")
        return 1

    print(f"Starting dev server: {SERVER_CMD}")
    server = subprocess.Popen(
        SERVER_CMD,
        shell=True,
        cwd=str(REPO_ROOT),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        print(f"Waiting for server on port {PORT} (timeout={TIMEOUT}s)...")
        if not _wait_for_port(PORT, TIMEOUT):
            print(f"ERROR: Server did not start on port {PORT} within {TIMEOUT}s")
            return 1
        print(f"Server ready on port {PORT}\n")

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
            if not passed:
                # Print failure output indented for readability.
                for line in output.splitlines():
                    print(f"    {line}")

        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        passed_count = sum(1 for _, ok, _ in results if ok)
        for name, ok, _ in results:
            mark = "PASS" if ok else "FAIL"
            print(f"  {mark}  {name}")
        print(f"\n{passed_count}/{len(results)} tests passed")

        return 0 if passed_count == len(results) else 1

    finally:
        print("\nStopping dev server...")
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
        print("Server stopped")


if __name__ == "__main__":
    sys.exit(main())
