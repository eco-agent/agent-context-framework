#!/usr/bin/env python3
"""Build a bounded prompt for a native Tailwind documentation subagent."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import textwrap
from pathlib import Path


def skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def manifest_path(root: Path) -> Path:
    return root / "references" / "tailwind-docs" / "doc-manifest.json"


def cache_dir(root: Path) -> Path:
    return root / "references" / "tailwind-docs" / "cache"


def cache_has_docs(root: Path) -> bool:
    cdir = cache_dir(root)

    if not cdir.exists():
        return False

    screenshot_index = cdir / "SCREENSHOT_INDEX.json"
    screenshots_dir = cdir / "screenshots"

    if not screenshot_index.exists() or not screenshots_dir.exists() or not any(screenshots_dir.rglob("*.png")):
        return False

    try:
        status = json.loads(screenshot_index.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    return (
        status.get("format_version") == 2
        and status.get("docs_cached") == status.get("docs_total")
        and not status.get("failed")
    )


def run_sync(root: Path) -> None:
    sync_script = root / "scripts" / "sync_tailwind_docs.py"
    result = subprocess.run(
        [sys.executable, str(sync_script), "--skill-root", str(root)],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout:
        print(result.stdout, file=sys.stderr)
    if result.returncode != 0:
        if result.stderr:
            print(result.stderr, file=sys.stderr)
        raise RuntimeError("Tailwind docs sync failed. Read references/tailwind-v4-operating-model.md.")


def build_prompt(task: str, context: str, root: Path) -> str:
    manifest = json.loads(manifest_path(root).read_text(encoding="utf-8"))
    doc_count = len(manifest.get("docs", []))
    docs_root = (root / "references" / "tailwind-docs").resolve()
    return textwrap.dedent(
        f"""
        You are a Tailwind CSS v4 documentation subagent for a frontend design workflow.

        You only provide Tailwind/CSS documentation context and implementation guidance. Do not redesign the product, do not write the full app, modify files, or invent undocumented Tailwind APIs. Use the read-only documentation directory below as the primary source.

        Task:
        {task}

        Frontend specification and implementation context:
        {context or "(No extra context provided.)"}

        Available docs:
        - `{docs_root / "INDEX.md"}` // most important
        - `{docs_root / "doc-manifest.json"}` with {doc_count} official docs entries
        - `{docs_root / "cache" / "SCREENSHOT_INDEX.json"}`
        - `{docs_root / "cache" / "meta"}/*.json` // scoped text, headings, and code examples
        - `{docs_root / "cache" / "screenshots"}/<slug>/desktop/*.png` // ordered article-only chunks

        Return concise, task-specific guidance and name the official docs consulted. Cover only relevant syntax, ownership, responsive/state behavior, class detection, compatibility constraints, and implementation notes. Omit categories that do not affect the task.

        Boundaries:
        - Tailwind should follow the recorded frontend specification; it should not alter product topology, visible content, or actions.
        - Prefer Tailwind near markup for local styling.
        - Prefer normal CSS, @theme, @utility, @custom-variant, or semantic classes for durable systems.
        - Do not recommend large JavaScript/TypeScript styling registries.
        - Do not recommend dynamic class-name interpolation.
        - Treat @apply as a narrow exception, not the default.
        - Use content_text and code_examples for syntax. Use screenshot chunks only when a visual example or layout relationship matters.
        """
    ).strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a prompt for a native Tailwind docs subagent.")
    parser.add_argument("--task", required=True, help="Specific Tailwind/UI styling task.")
    parser.add_argument("--context", default="", help="Frontend specification or implementation context from the main agent.")
    parser.add_argument("--skill-root", type=Path, default=skill_root())
    parser.add_argument("--sync-if-missing", action="store_true", help="Fetch official Tailwind docs if the local cache is empty.")
    args = parser.parse_args()

    root = args.skill_root.resolve()
    if not manifest_path(root).exists():
        raise SystemExit(f"Missing Tailwind docs manifest: {manifest_path(root)}")

    if args.sync_if_missing and not cache_has_docs(root):
        run_sync(root)

    if not cache_has_docs(root):
        print(
            "Tailwind docs cache is empty. Run with --sync-if-missing "
            "or read references/tailwind-v4-operating-model.md.",
            file=sys.stderr,
        )
        return 2

    print(build_prompt(args.task, args.context, root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
