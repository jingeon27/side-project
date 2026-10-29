# Engineering blog

- Scope: `projects/blog`; preserve other projects and shared packages.
- Use the parent Yarn 4 workspace and Node.js 24. Commands delegate to `@blog/web`.
- Follow FSD: app → widgets → features → shared. Do not create an entities layer; article data and types belong in shared/article, and article presentation belongs in features/article. Never add a `components/` directory.
- For application code changes and reviews, apply [blog code feedback](.agents/skills/blog-code-feedback/SKILL.md). Keep reusable code feedback there; prose feedback belongs to blog-writer.
- Content is Git-managed MDX. Public metadata lives in `content/posts/<id>/meta.json`; translated titles, slugs, and SEO live in `seo/<locale>.json`. Only publish locales with real MDX.
- For article writing or prose edits, read [blog-writer](.agents/skills/blog-writer/SKILL.md) and [writing feedback](docs/writing-feedback.md). Keep new reusable user feedback in that document, with its scope and concrete examples. The dedicated `blog_writer` agent is defined in [the repository agent file](../../.codex/agents/blog_writer.toml).
- Generate and validate the static registry before building. Keep generated files deterministic; no runtime file-path imports.
- Migration includes only public Tistory posts matched to local blog entries; unpublished resume drafts stay private. The initial import used public text. Subsequent user-requested editorial changes live in MDX; preserve code examples, original image archives and source provenance. Record image replacements in `apps/web/content/image-replacements.json`. Do not rerun the importer over edited content without reviewing the diff. See `docs/migration.md`.
- UI translations are in messages; article prose is in MDX; SEO translations are in seo JSON.
- Every blog article needs an image made for its subject. When writing a new article or revising one without a dedicated cover, create the image, save it under `apps/web/public/images`, set `coverImage`, and include it in the article body with meaningful localized alt text. Use the same image in Korean and English, check the thumbnail and body rendering, and preserve existing screenshots and image archives. Make illustrations clearly distinguishable from actual product screenshots.
- Tests and runner configs belong to `apps/web`; use its isolated port 3100 (E2E 3101).
- Run content validation, typecheck, lint, unit/component tests, production build and E2E for release changes. Record actual results; external account/domain setup is not completed by code alone.
- Never commit credentials. DSNs, analytics, and source-map upload remain optional and isolated.
