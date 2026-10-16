# Engineering blog

- Scope: `projects/blog`; preserve other projects and shared packages.
- Use the parent Yarn 4 workspace and Node.js 24. Commands delegate to `@blog/web`.
- Follow FSD: app → widgets → features → entities → shared. Never add a `components/` directory.
- Content is Git-managed MDX. Public metadata lives in `content/posts/<id>/meta.json`; translated titles, slugs, and SEO live in `seo/<locale>.json`. Only publish locales with real MDX.
- Generate and validate the static registry before building. Keep generated files deterministic; no runtime file-path imports.
- Migration includes only public Tistory posts matched to local blog entries; unpublished resume drafts stay private. Live public text is authoritative. See `docs/migration.md`.
- UI translations are in messages; article prose is in MDX; SEO translations are in seo JSON.
- Tests and runner configs belong to `apps/web`; use its isolated port 3100 (E2E 3101).
- Run content validation, typecheck, lint, unit/component tests, production build and E2E for release changes. Record actual results; external account/domain setup is not completed by code alone.
- Never commit credentials. DSNs, analytics, and source-map upload remain optional and isolated.
