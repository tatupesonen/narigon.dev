# narigon.dev

Personal site and blog, built with [Zola](https://www.getzola.org/). Fully static.

## Development

```bash
zola serve          # dev server with live reload at http://127.0.0.1:1111
```

## Open Graph images

Every post gets a generated 1200×630 OG card (plus a site-wide default at
`/og-default.png`). They are rendered at build time by a small Rust tool
(`tools/og`) that reads each post's frontmatter and rasterizes an SVG template
with resvg:

```bash
cargo run --release --manifest-path tools/og/Cargo.toml
```

The PNGs are gitignored; CI regenerates them on every deploy.

## Deploying

Pushing to `main` triggers `.github/workflows/deploy.yml`, which generates the
OG images, runs `zola build`, and publishes `public/` to GitHub Pages.

## Content notes

- Posts live in `content/<slug>/index.md` as page bundles, keeping the old
  Gatsby-era URLs (`/hello-world/`, `/a-surprise-scammer/`, …) and `/rss.xml`.
- The chat transcript in *An opportunistic scammer* lives in
  `content/a-surprise-scammer/chat.json` and is rendered by the `chat`
  shortcode (`templates/shortcodes/chat.html`). Hover a translated bubble to
  see the original Spanish.
