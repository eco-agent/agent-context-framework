#!/usr/bin/env python3
"""Cache the useful centre content of official Tailwind documentation pages.

Each page is captured as overlapping, readable chunks rather than a single
full-page image. The cache also contains scoped text and code examples so the
docs subagent can retrieve exact syntax without trying to read it from pixels.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import Locator
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


DEFAULT_DESKTOP_VIEWPORT = {"width": 1440, "height": 1200}
DEFAULT_CHUNK_HEIGHT = 1200
DEFAULT_CHUNK_OVERLAP = 160
MOBILE_VIEWPORT = {"width": 393, "height": 852, "is_mobile": True, "has_touch": True}


def skill_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_manifest(root: Path) -> dict:
    manifest = root / "references" / "tailwind-docs" / "doc-manifest.json"
    if not manifest.exists():
        raise FileNotFoundError(f"Missing manifest: {manifest}")
    return json.loads(manifest.read_text(encoding="utf-8"))


def cache_root(root: Path) -> Path:
    return root / "references" / "tailwind-docs" / "cache"


def stem_for(item: dict) -> str:
    return Path(item.get("cache_file") or item.get("slug") or item["url"].rstrip("/").split("/")[-1]).stem


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in (normalize_text(value) for value in values) if value))


def safe_inner_texts(locator: Locator) -> list[str]:
    try:
        return locator.all_inner_texts()
    except Exception:
        return []


def prepare_page(page, url: str, timeout_ms: int) -> None:
    # networkidle is unreliable on documentation sites with persistent analytics.
    page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
    page.evaluate("async () => { await document.fonts.ready }")
    page.add_style_tag(
        content="""
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          scroll-behavior: auto !important;
        }
        """
    )
    page.wait_for_timeout(300)


def resolve_content(page) -> tuple[Locator, str]:
    """Return the centre documentation container, excluding page rails and footer."""
    title = page.locator("h1[data-title], h1").first
    if title.count() and title.is_visible():
        candidate = title.locator("xpath=..")
        # Tailwind's current docs put the title and prose[data-content] in this
        # compact container, while navigation and the right-hand rail are siblings.
        for _ in range(4):
            if candidate.locator("[data-content]").count():
                return candidate, "h1[data-title] ancestor containing [data-content]"
            candidate = candidate.locator("xpath=..")

    content = page.locator("[data-content]").first
    if content.count() and content.is_visible():
        return content, "[data-content] fallback"

    raise ValueError("Could not resolve centre documentation content: no visible title/content container")


def content_geometry(page, content: Locator) -> dict[str, float]:
    geometry = content.evaluate(
        """element => {
          const rect = element.getBoundingClientRect();
          return {
            x: rect.left,
            top: rect.top + window.scrollY,
            width: rect.width,
            height: rect.height,
          };
        }"""
    )
    if geometry["width"] <= 0 or geometry["height"] <= 0:
        raise ValueError("Centre documentation content has no visible dimensions")
    return geometry


def remove_global_header(page) -> None:
    """Remove Tailwind's fixed site header without touching article examples."""
    page.locator("div.fixed.inset-x-0.top-0.z-10").evaluate_all("nodes => nodes.forEach(node => node.remove())")


def chunk_offsets(height: float, chunk_height: int, overlap: int) -> list[int]:
    step = chunk_height - overlap
    if step <= 0:
        raise ValueError("chunk overlap must be smaller than chunk height")
    last = max(0, int(height) - chunk_height)
    offsets = list(range(0, last + 1, step))
    if offsets[-1] != last:
        offsets.append(last)
    return offsets


def capture_chunks(
    page,
    content: Locator,
    output_dir: Path,
    viewport: dict,
    chunk_height: int,
    overlap: int,
) -> list[dict]:
    output_dir.mkdir(parents=True, exist_ok=True)
    remove_global_header(page)
    geometry = content_geometry(page, content)
    offsets = chunk_offsets(geometry["height"], chunk_height, overlap)
    chunks: list[dict] = []

    for index, offset in enumerate(offsets):
        target_y = int(geometry["top"] + offset)
        page.evaluate("scrollY => window.scrollTo(0, scrollY)", target_y)
        page.wait_for_timeout(150)
        actual_scroll_y = page.evaluate("window.scrollY")
        # Re-read the content position after scrolling so lazy-loaded examples
        # cannot make the image and manifest disagree.
        current = content_geometry(page, content)
        remaining = max(1, int(current["height"] - offset))
        height = min(chunk_height, remaining)
        filename = f"{index:03}.png"
        page_y = int(current["top"] + offset)
        # A non-full-page clip is relative to the current viewport, not the
        # document. Scrolling first keeps lazy examples rendered before the
        # centre column is cropped.
        clip_y = max(0, page_y - actual_scroll_y)
        height = min(height, viewport["height"] - clip_y)
        if height <= 0:
            raise ValueError("Centre documentation chunk is outside the viewport")
        page.screenshot(
            path=str(output_dir / filename),
            clip={"x": current["x"], "y": clip_y, "width": current["width"], "height": height},
            type="png",
        )
        chunks.append(
            {
                "index": index,
                "file": filename,
                "contentOffsetY": offset,
                "pageY": page_y,
                "scrollY": actual_scroll_y,
                "width": round(current["width"]),
                "height": height,
                "overlap": overlap if index else 0,
            }
        )

    return chunks


def extract_page_metadata(page, content: Locator, item: dict, screenshots: dict, selector: str) -> dict:
    return {
        "path": item.get("path"),
        "url": item["url"],
        "slug": item.get("slug") or stem_for(item),
        "source_cache_file": item.get("cache_file"),
        "title": normalize_text(page.title()) or stem_for(item),
        "content_selector": selector,
        "headings": unique(safe_inner_texts(content.locator("h1, h2, h3"))),
        "content_text": normalize_text(content.inner_text()),
        "code_examples": [text for text in safe_inner_texts(content.locator("pre")) if text.strip()],
        "screenshots": screenshots,
        "fetched": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def load_cached_entry(meta_path: Path, croot: Path) -> dict | None:
    """Reuse a complete v2 entry so a partial rebuild can resume efficiently."""
    try:
        entry = json.loads(meta_path.read_text(encoding="utf-8"))
        chunks = entry["screenshots"]["desktop"]["chunks"]
        directory = croot / entry["screenshots"]["desktop"]["directory"]
    except (KeyError, OSError, TypeError, json.JSONDecodeError):
        return None

    if not chunks or not all((directory / chunk["file"]).is_file() for chunk in chunks):
        return None
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description="Cache article-only Tailwind documentation screenshots and text.")
    parser.add_argument("--skill-root", type=Path, default=skill_root())
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--slug", action="append", default=[], help="Capture only this manifest slug; repeatable.")
    parser.add_argument("--sleep", type=float, default=0.15)
    parser.add_argument("--timeout", type=int, default=60, help="Timeout in seconds per page.")
    parser.add_argument("--mobile", action="store_true", help="Also capture article-only mobile chunks.")
    parser.add_argument("--desktop-width", type=int, default=DEFAULT_DESKTOP_VIEWPORT["width"])
    parser.add_argument("--desktop-height", type=int, default=DEFAULT_DESKTOP_VIEWPORT["height"])
    parser.add_argument("--chunk-height", type=int, default=DEFAULT_CHUNK_HEIGHT)
    parser.add_argument("--chunk-overlap", type=int, default=DEFAULT_CHUNK_OVERLAP)
    args = parser.parse_args()

    root = args.skill_root.resolve()
    manifest = load_manifest(root)
    manifest_docs = manifest.get("docs", [])
    docs = manifest_docs
    if args.slug:
        selected = set(args.slug)
        docs = [item for item in docs if stem_for(item) in selected or item.get("slug") in selected]
        missing = selected - {stem_for(item) for item in docs} - {item.get("slug") for item in docs}
        if missing:
            raise SystemExit(f"Unknown manifest slug(s): {', '.join(sorted(missing))}")
    if args.limit:
        docs = docs[: args.limit]
    if not docs:
        raise SystemExit("No documentation pages selected")

    croot = cache_root(root)
    screenshots_dir = croot / "screenshots"
    meta_dir = croot / "meta"
    screenshots_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)
    timeout_ms = args.timeout * 1000
    index: list[dict] = []
    failed: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        desktop = browser.new_context(viewport={"width": args.desktop_width, "height": args.desktop_height})
        desktop_page = desktop.new_page()
        desktop_page.set_default_timeout(timeout_ms)
        mobile = browser.new_context(**MOBILE_VIEWPORT) if args.mobile else None
        mobile_page = mobile.new_page() if mobile else None
        if mobile_page:
            mobile_page.set_default_timeout(timeout_ms)

        for item in docs:
            stem = stem_for(item)
            meta_path = meta_dir / f"{stem}.json"
            if not args.force:
                cached = load_cached_entry(meta_path, croot)
                if cached:
                    index.append(cached)
                    print(f"reused {item['url']}")
                    continue
            try:
                prepare_page(desktop_page, item["url"], timeout_ms)
                content, selector = resolve_content(desktop_page)
                desktop_dir = screenshots_dir / stem / "desktop"
                screenshots = {
                    "desktop": {
                        "directory": str(desktop_dir.relative_to(croot)).replace("\\", "/"),
                        "chunks": capture_chunks(
                            desktop_page, content, desktop_dir, {"width": args.desktop_width, "height": args.desktop_height}, args.chunk_height, args.chunk_overlap
                        ),
                    }
                }
                if mobile_page:
                    prepare_page(mobile_page, item["url"], timeout_ms)
                    mobile_content, _ = resolve_content(mobile_page)
                    mobile_dir = screenshots_dir / stem / "mobile"
                    screenshots["mobile"] = {
                        "directory": str(mobile_dir.relative_to(croot)).replace("\\", "/"),
                        "chunks": capture_chunks(mobile_page, mobile_content, mobile_dir, MOBILE_VIEWPORT, args.chunk_height, args.chunk_overlap),
                    }

                metadata = extract_page_metadata(desktop_page, content, item, screenshots, selector)
                meta_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
                index.append(metadata)
                print(f"cached {item['url']} -> {len(screenshots['desktop']['chunks'])} desktop chunks")
            except (PlaywrightError, PlaywrightTimeoutError, OSError, ValueError) as exc:
                message = f"{item['url']}: {exc}"
                failed.append(message)
                print(f"failed {message}", file=sys.stderr)
            time.sleep(args.sleep)

        desktop.close()
        if mobile:
            mobile.close()
        browser.close()

    status = {
        "format_version": 2,
        "source": manifest.get("source"),
        "generated_for": manifest.get("generated_for"),
        "fetched": dt.datetime.now(dt.timezone.utc).isoformat(),
        "docs_total": len(manifest_docs),
        "docs_selected": len(docs),
        "docs_cached": len(index),
        "failed": failed,
        "entries": index,
    }
    (croot / "SCREENSHOT_INDEX.json").write_text(json.dumps(status, indent=2), encoding="utf-8")
    (croot / "CACHE_STATUS.md").write_text(
        "# Tailwind Documentation Cache Status\n\n"
        f"Format: {status['format_version']}\n"
        f"Fetched: {status['fetched']}\n"
        f"Docs total: {len(manifest_docs)}\n"
        f"Docs selected: {len(docs)}\n"
        f"Docs cached: {len(index)}\n"
        f"Failed: {len(failed)}\n"
        + (("\n" + "\n".join(f"- {line}" for line in failed) + "\n") if failed else ""),
        encoding="utf-8",
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
