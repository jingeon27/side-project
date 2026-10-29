# Blog web application

Follow the project and repository AGENTS.md. Keep route files thin. Shared UI cannot import feature or widget layers. Article data and types belong in shared/article; article presentation belongs in features/article. Do not create an entities layer. Only necessary interactive features are client components. Preserve canonical URLs when editing titles. Add explicit 301 redirects in content/redirects.json when changing a slug or unpublishing an article; content generation and validation fail when a published path disappears without one.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Apply [blog code feedback](../../.agents/skills/blog-code-feedback/SKILL.md) for callback style, fixed JSX, cmdk behavior, and URL filter state.
