# narigon.dev

Personal site and blog, built with [Zola](https://www.getzola.org/). Fully static -
fonts, images, and scripts are all vendored. The one exception is the optional
Discord presence widget, which talks to the Lanyard websocket and loads album/game
art from Discord's CDN at runtime; set `extra.show_presence = false` to disable it
and drop all external requests.

The design was authored in Claude Design ("Modern minimal website redesign") and
implemented as Zola templates: warm paper palette with a dark mode, Newsreader /
IBM Plex Sans / JetBrains Mono (self-hosted variable woff2 in `static/fonts/`),
and cross-document view transitions (avatar and post-title morphs).

## Development

```bash
zola serve          # dev server with live reload at http://127.0.0.1:1111
```

## Discord presence

The navbar shows live Discord status plus a now-playing card (Spotify song with
album art, link, and progress bar, or the current game with its logo) via the
[Lanyard](https://github.com/Phineas/lanyard) websocket API - same approach as
the previous Gatsby site. Configure with `extra.discord_id` in `config.toml`;
leave empty to hide it. The `extra.show_presence` flag turns the whole widget off.

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

Pushing to `master` triggers `.github/workflows/deploy.yml`, which generates the
OG images, runs `zola build`, and publishes `public/` to GitHub Pages.

## Content notes

- Posts live in `content/<slug>/index.md` as page bundles, keeping the old
  Gatsby-era URLs (`/hello-world/`, `/a-surprise-scammer/`, ...) and `/rss.xml`.
- Reading times can be overridden per post with `extra.read = "13 min"`
  (used where Zola's word count misses non-markdown content like the chat JSON).
- The chat transcript in *An opportunistic scammer* lives in
  `content/a-surprise-scammer/chat.json` and is rendered by the `chat`
  shortcode (`templates/shortcodes/chat.html`). Hover a translated bubble to
  see the original Spanish.
