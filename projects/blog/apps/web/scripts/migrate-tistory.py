#!/usr/bin/env python3
"""Import the explicitly reviewed public Tistory/local-blog intersection.

Requires Python 3 and beautifulsoup4. Run from any directory with:
  python3 apps/web/scripts/migrate-tistory.py --resume-blog /path/to/resume/blog

The local directory is used only to verify counterpart filenames. Article text
and image bytes are fetched from the public site, never from local drafts.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from html import unescape
import json
from pathlib import Path
import re
import tempfile
import unicodedata
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from bs4 import BeautifulSoup, Comment, NavigableString, Tag


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[3]
ORIGIN = "https://jingeon27.tistory.com"
POSTS = [
    (4, "puppeteer-event-lifecycle", "post-04-puppeteer-closure.md", "engineering", ["puppeteer", "electron", "javascript", "typescript", "closure"]),
    (5, "electron-module-boundaries", "post-05-electron-nestjs-inspired.md", "engineering", ["electron", "nestjs", "architecture", "typescript"]),
    (6, "query-key-factory", "post-06-query-key-factory.md", "engineering", ["tanstack-query", "typescript", "query-key"]),
    (7, "typescript-patterns", "post-07-typescript-patterns.md", "engineering", ["typescript", "react"]),
    (8, "nextjs-tanstack-query-ssr", "post-08-next-tanstack-query.md", "engineering", ["nextjs", "tanstack-query", "ssr", "app-router"]),
    (11, "reservation-form-state", "post-11-reservation-form.md", "engineering", ["react-hook-form", "zustand", "zod", "react", "typescript"]),
    (12, "review-like-optimistic-update", "post-12-review-like-optimistic-update.md", "engineering", ["tanstack-query", "optimistic-update", "react"]),
    (14, "nextjs-seo-prefetch", "post-14-next-seo-prefetch.md", "engineering", ["nextjs", "tanstack-query", "seo", "ssr"]),
    (15, "review-form-funnel", "post-15-review-form.md", "engineering", ["react-hook-form", "zod", "react", "state-management"]),
    (18, "typed-program-form", "post-18-program-form.md", "engineering", ["react-hook-form", "typescript", "zod", "architecture"]),
    (19, "cross-domain-token-handoff", "post-19-cross-domain-token.md", "engineering", ["nextjs", "authentication", "bff", "security"]),
    (20, "chatbot-message-layer", "post-20-chatbot-message-layer.md", "engineering", ["react", "typescript", "sse", "chatbot"]),
    (21, "sitemap-api-boundaries", "post-21-sitemap-cache.md", "engineering", ["nextjs", "seo", "sitemap", "cache"]),
    (22, "payment-coupon-branches", "post-22-payment-coupon.md", "engineering", ["typescript", "refactoring", "react", "payment"]),
    (23, "fsd-layer-boundaries", "post-23-fsd-2-1.md", "engineering", ["fsd", "architecture", "refactoring", "nextjs"]),
    (24, "prototype-working-rules", "post-24-prototype-rules.md", "engineering", ["react", "nextjs", "architecture", "ai-workflow"]),
    (25, "testing-standards", "post-25-test-suite-rebuild.md", "engineering", ["testing", "vitest", "playwright", "react"]),
    (26, "declarative-code", "post-26-declarative-code.md", "engineering", ["typescript", "react", "refactoring", "declarative-programming"]),
    (27, "nextjs-server-client-issues", "post-27-next-server-to-client.md", "engineering", ["nextjs", "react", "cache", "react-hook-form"]),
    (28, "error-boundary-recovery", "post-28-error-boundary.md", "engineering", ["react", "error-boundary", "zod", "observability"]),
    (29, "low-effort-success", "post-33-low-effort-success.md", "perspectives", ["reflection", "ai-workflow", "productivity"]),
    (30, "sentry-observability", "post-30-sentry-pii-hardening.md", "engineering", ["sentry", "nextjs", "observability", "web-vitals", "security"]),
    (31, "plan-gated-ai-workflow", "post-34-plan-gated-ai-workflow.md", "engineering", ["ai-workflow", "testing", "eslint", "worktree"]),
    (32, "zod-assertion-boundaries", "post-35-zod-assertion-boundaries.md", "engineering", ["zod", "typescript", "validation", "error-handling"]),
    (33, "bottom-sheet-drag-crash", "post-36-sentry-bottom-sheet-crash.md", "engineering", ["sentry", "react", "debugging", "react-modal-sheet"]),
    (34, "health-check-program", "post-new-health-check-program.md", "engineering", ["react", "react-hook-form", "architecture", "payment"]),
    (35, "reading-ai-code", "post-new-reading-ai-code.md", "perspectives", ["ai-workflow", "code-review", "testing", "reflection"]),
]


def fetch(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": "PersonalBlogMigration/1.0"})
    with urlopen(request, timeout=40) as response:
        if response.status != 200:
            raise ValueError(f"Public source returned {response.status}: {url}")
        return response.read()


def normalized_slug(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).lower()
    value = re.sub(r"[^\w\s-]", "", value, flags=re.UNICODE)
    return re.sub(r"[-\s_]+", "-", value).strip("-")


def prose(value: str) -> str:
    value = value.replace("\xa0", " ")
    value = value.replace("&", "&amp;").replace("<", "&lt;")
    value = value.replace("{", "&#123;").replace("}", "&#125;")
    return re.sub(r"([\\`*\[\]_])", r"\\\1", value)


def code_language(value: str) -> str:
    """Tistory auto-detected language classes are frequently incorrect."""
    stripped = value.strip()
    if not stripped:
        return "text"
    if stripped.startswith(("{", "[")):
        try:
            json.loads(stripped)
            return "json"
        except ValueError:
            pass
    if re.search(r"[├└│─]", stripped) or stripped.startswith(("티켓", "→", "Before", "before", "Client →")):
        return "text"
    if re.search(r"^(?:yarn |pnpm |npm |npx |git |curl |#\!/)", stripped):
        return "bash"
    if re.search(r"(?:^|\n)(?:name|on|jobs|steps|runs-on):", stripped):
        return "yaml"
    if re.search(r"(?:<\w+[\s/>]|</\w+>)", stripped):
        return "tsx"
    if re.search(r"\b(?:const|let|var|function|return|import|export|interface|type|class|if|async|await)\b|=>", stripped):
        return "typescript"
    return "text"


class Markdown:
    def __init__(self, image_paths: dict[str, str], routes: dict[int, str]):
        self.image_paths = image_paths
        self.routes = routes

    def inline(self, node) -> str:
        if isinstance(node, Comment):
            return ""
        if isinstance(node, NavigableString):
            return prose(str(node))
        if not isinstance(node, Tag):
            return ""
        name = node.name
        if name in ("script", "style", "iframe"):
            return ""
        if name == "code":
            value = node.get_text().replace("\xa0", " ").replace("\n", " ")
            delimiter = "`" * (max([len(x) for x in re.findall(r"`+", value)], default=0) + 1)
            padding = " " if value.startswith("`") or value.endswith("`") else ""
            return f"{delimiter}{padding}{value}{padding}{delimiter}"
        children = "".join(self.inline(child) for child in node.children)
        if name in ("b", "strong"):
            return f"**{children.strip()}**" if children.strip() else children
        if name in ("i", "em"):
            return f"*{children.strip()}*" if children.strip() else children
        if name in ("s", "del", "strike"):
            return f"~~{children.strip()}~~"
        if name == "br":
            return "\n"
        if name == "a":
            href = urljoin(ORIGIN, node.get("href", ""))
            parsed = urlparse(href)
            match = re.fullmatch(r"/(?:m/)?(\d+)/?", parsed.path)
            if parsed.netloc == "jingeon27.tistory.com" and match and int(match[1]) in self.routes:
                href = self.routes[int(match[1])]
                if parsed.fragment:
                    href += "#" + parsed.fragment
            if parsed.scheme not in ("https", "http", "mailto", "tel") and not href.startswith("/"):
                return children
            href = href.replace(" ", "%20").replace("(", "%28").replace(")", "%29")
            return f"[{children or prose(href)}]({href})"
        if name == "img":
            source = urljoin(ORIGIN, node.get("src", ""))
            target = self.image_paths[source]
            parent = node.find_parent("figure")
            caption = parent.find("figcaption") if parent else None
            alt = node.get("alt") or (node.parent.get("data-alt") if isinstance(node.parent, Tag) else None)
            alt = alt or (caption.get_text(" ", strip=True) if caption else None)
            alt = alt or node.get("data-filename", "본문 그림").rsplit(".", 1)[0].replace("-", " ")
            # Tistory can retain named entities in its data-alt attribute even
            # though the visible figcaption is already decoded.
            return f"![{prose(unescape(alt))}]({target})"
        if name in ("figure", "pre", "ul", "ol", "table", "blockquote"):
            return "\n\n" + self.block(node) + "\n\n"
        return children

    def block(self, node) -> str:
        if isinstance(node, NavigableString):
            return prose(str(node)).strip()
        if not isinstance(node, Tag):
            return ""
        name = node.name
        if name in ("script", "style", "iframe"):
            return ""
        if name == "pre":
            value = node.get_text().replace("\xa0", " ").strip("\n")
            fence = "`" * max(3, max([len(x) + 1 for x in re.findall(r"`+", value)], default=3))
            return f"{fence}{code_language(value)}\n{value}\n{fence}"
        if name == "figure":
            parts = [self.inline(image) for image in node.find_all("img")]
            caption = node.find("figcaption")
            if caption and caption.get_text(strip=True):
                parts.append("*" + self.inline(caption).strip() + "*")
            return "\n\n".join(parts)
        if name in ("ul", "ol"):
            result = []
            for index, item in enumerate(node.find_all("li", recursive=False), 1):
                marker = f"{index}. " if name == "ol" else "- "
                content = "".join(self.inline(child) for child in item.children).strip()
                lines = content.splitlines()
                if lines:
                    result.append(marker + lines[0] + "".join("\n" + " " * len(marker) + line for line in lines[1:]))
            return "\n".join(result)
        if name == "table":
            rows = []
            for row in node.find_all("tr"):
                cells = []
                for cell in row.find_all(("td", "th"), recursive=False):
                    value = self.inline(cell).strip().replace("\n", " ").replace("|", "\\|")
                    cells.append(value)
                if cells:
                    rows.append(cells)
            if not rows:
                return ""
            width = max(map(len, rows))
            rows = [row + [""] * (width - len(row)) for row in rows]
            rows.insert(1, ["---"] * width)
            return "\n".join("| " + " | ".join(row) + " |" for row in rows)
        if name == "blockquote":
            value = self.container(node)
            return "\n".join("> " + line if line else ">" for line in value.splitlines())
        if name == "hr":
            return "---"
        if re.fullmatch(r"h[1-6]", name):
            # The surrounding article already supplies the only page h1.
            level = max(2, int(name[1]))
            value = "".join(self.inline(child) for child in node.children).strip()
            value = re.sub(r"^\*\*(.*)\*\*$", r"\1", value)
            return "#" * level + " " + value
        if name in ("div", "section", "article"):
            return self.container(node)
        return self.inline(node).strip()

    def container(self, node) -> str:
        return "\n\n".join(value for child in node.children if (value := self.block(child)))


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resume-blog", type=Path, required=True)
    parser.add_argument("--cache-dir", type=Path, help="Optional cache for inspected public HTML only")
    args = parser.parse_args()
    cache = args.cache_dir or Path(tempfile.mkdtemp(prefix="blog-public-migration-"))
    cache.mkdir(parents=True, exist_ok=True)
    sitemap = ElementTree.fromstring(fetch(f"{ORIGIN}/sitemap.xml"))
    public_urls = {item.text for item in sitemap.iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")}
    articles = {}
    for number, content_id, local_name, category, tags in POSTS:
        source_url = f"{ORIGIN}/{number}"
        if source_url not in public_urls:
            raise ValueError(f"Curated source is no longer publicly listed: {source_url}")
        counterpart = args.resume_blog / "revised" / local_name
        if not counterpart.is_file():
            raise ValueError(f"Missing reviewed local counterpart: {counterpart}")
        cached = cache / f"{number}.html"
        if not cached.exists():
            cached.write_bytes(fetch(source_url))
        soup = BeautifulSoup(cached.read_bytes(), "html.parser")
        body = soup.select_one(".tt_article_useless_p_margin")
        title = soup.select_one(".title-article")
        if body is None or title is None or len(body.get_text(strip=True)) < 200:
            raise ValueError(f"Public full article unavailable: {source_url}")
        articles[number] = (soup, body, title.get_text(" ", strip=True))

    routes = {number: "/ko/blog/" + normalized_slug(article[2]) for number, article in articles.items()}
    site = {
        "ko": {
            "site": {"title": "김진건 | Engineering Blog", "description": "개발하면서 겪은 문제와 선택, 검증한 내용을 기록합니다.", "keywords": ["Software Engineer", "React", "Next.js", "TypeScript", "개발 블로그"]},
            "pages": {
                "home": {"title": "홈", "description": "개발 경험과 생각을 기록하는 김진건의 블로그입니다."},
                "blog": {"title": "블로그", "description": "개발 경험, 배운 것과 일하며 정리한 생각을 공유합니다."},
                "about": {"title": "소개", "description": "Software Engineer 김진건의 연락처와 GitHub입니다."},
            },
            "posts": {},
        },
        "en": {
            "site": {"title": "Jingeon Kim | Engineering Blog", "description": "Notes on software engineering, decisions and verification.", "keywords": ["Software Engineering", "React", "Next.js", "TypeScript"]},
            "pages": {
                "home": {"title": "Home", "description": "Engineering experiences and perspectives by Jingeon Kim."},
                "blog": {"title": "Blog", "description": "Engineering experiences, learning and perspectives."},
                "about": {"title": "About", "description": "Contact information and GitHub for software engineer Jingeon Kim."},
            },
            "posts": {},
        },
    }
    manifest = []
    asset_count = 0
    for number, content_id, local_name, category, derived_tags in POSTS:
        soup, body, title = articles[number]
        public_tags = []
        for anchor in soup.select(".article-tag a"):
            # Some original tags accidentally contain several hashtags.
            public_tags.extend(normalized_slug(tag) for tag in re.split(r"\s*#\s*", anchor.get_text(strip=True)))
        tags = list(dict.fromkeys(tag for tag in public_tags + derived_tags if tag))
        assert all(tag == normalized_slug(tag) for tag in tags)
        images = list(body.find_all("img"))
        image_paths = {}
        asset_records = []
        jobs = []
        for index, image in enumerate(images, 1):
            source = urljoin(ORIGIN, image.get("src", ""))
            if source in image_paths:
                continue
            suffix = Path(urlparse(source).path).suffix.lower()
            if suffix not in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"):
                suffix = ".png"
            relative = f"/images/posts/{content_id}/{index:02d}{suffix}"
            target = ROOT / "public" / relative.lstrip("/")
            image_paths[source] = relative
            jobs.append((source, target))

        def download(job):
            source, target = job
            data = fetch(source)
            if len(data) < 100 or data.lstrip().startswith((b"<!DOCTYPE", b"<html")):
                raise ValueError(f"Invalid public image response: {source}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            return {"path": "/" + str(target.relative_to(ROOT / "public")), "sha256": hashlib.sha256(data).hexdigest()}

        with ThreadPoolExecutor(max_workers=4) as executor:
            asset_records = list(executor.map(download, jobs))
        asset_count += len(asset_records)
        markdown = Markdown(image_paths, routes).container(body)
        markdown = markdown.strip() + "\n"
        folder = ROOT / "content" / "posts" / content_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "ko.mdx").write_text(markdown)
        published = soup.find("meta", property="article:published_time")["content"]
        modified = soup.find("meta", property="article:modified_time")
        meta = {"category": category, "tags": tags, "publishedAt": published}
        if modified and modified["content"] != published:
            meta["updatedAt"] = modified["content"]
        if images and re.search(r"(?:test-suite|next-router|sentry-observability|compound-engineering|reading-ai-code)", images[0].get("data-filename", "")):
            meta["coverImage"] = image_paths[urljoin(ORIGIN, images[0]["src"])]
        meta["sourceUrl"] = f"{ORIGIN}/{number}"
        write_json(folder / "meta.json", meta)
        paragraphs = [item.get_text(" ", strip=True).replace("\xa0", " ") for item in body.find_all("p")]
        description = next((value for value in paragraphs if len(value) > 35 and not value.startswith("관련 글")), title)
        description = re.sub(r"\s+", " ", description)
        if len(description) > 160:
            description = description[:157].rstrip() + "…"
        site["ko"]["posts"][content_id] = {"title": title, "slug": routes[number].removeprefix("/ko/blog/"), "description": description, "keywords": tags}
        source_code = [block.get_text().replace("\xa0", " ").strip("\n") for block in body.find_all("pre")]
        manifest.append({"sourceUrl": meta["sourceUrl"], "contentId": content_id, "localCounterpart": f"revised/{local_name}", "publishedAt": published, "title": title, "codeSha256": [hashlib.sha256(block.encode()).hexdigest() for block in source_code], "images": asset_records})
    for locale, seo in site.items():
        write_json(ROOT / "seo" / f"{locale}.json", seo)
    write_json(PROJECT_ROOT / "docs" / "migration-manifest.json", {"source": ORIGIN, "posts": manifest})
    print(f"Migrated {len(manifest)} public Korean articles and {asset_count} public images.")


if __name__ == "__main__":
    main()
