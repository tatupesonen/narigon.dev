//! Generates 1200x630 Open Graph card PNGs for every post in content/,
//! plus a site-wide default card at static/og-default.png.
//!
//! Run from anywhere: paths are resolved relative to this crate's manifest.

use resvg::{tiny_skia, usvg};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

const WIDTH: u32 = 1200;
const HEIGHT: u32 = 630;

const BG: &str = "#1a1712";
const BORDER: &str = "#2e2a20";
const FG: &str = "#ece5d4";
const MUTED: &str = "#a1977f";
const ACCENT: &str = "#dfa050";

struct Card {
    title: String,
    description: String,
    footer: String,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize()?;
    let content_dir = root.join("content");

    let mut fontdb = usvg::fontdb::Database::new();
    fontdb.load_font_data(include_bytes!("../assets/JetBrainsMono-Regular.ttf").to_vec());
    fontdb.load_font_data(include_bytes!("../assets/JetBrainsMono-Bold.ttf").to_vec());
    fontdb.load_font_data(include_bytes!("../assets/JetBrainsMono-ExtraBold.ttf").to_vec());
    let mut options = usvg::Options::default();
    options.fontdb = Arc::new(fontdb);

    for entry in fs::read_dir(&content_dir)? {
        let dir = entry?.path();
        let index = dir.join("index.md");
        if !index.is_file() {
            continue;
        }
        let raw = fs::read_to_string(&index)?;
        let (front, body) = split_frontmatter(&raw)
            .ok_or_else(|| format!("no TOML frontmatter in {}", index.display()))?;
        let meta: toml::Value = toml::from_str(front)?;
        if meta.get("draft").and_then(|v| v.as_bool()) == Some(true) {
            continue;
        }

        let title = meta.get("title").and_then(|v| v.as_str()).unwrap_or_default();
        let description = meta.get("description").and_then(|v| v.as_str()).unwrap_or_default();
        let date = match meta.get("date") {
            Some(toml::Value::Datetime(d)) => d.to_string(),
            Some(toml::Value::String(s)) => s.clone(),
            _ => String::new(),
        };
        // Honor an [extra] read = "13 min" override, matching the templates.
        let read = meta
            .get("extra")
            .and_then(|e| e.get("read"))
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| {
                let minutes = (body.split_whitespace().count() as f64 / 200.0).ceil().max(1.0);
                format!("{minutes} min")
            });

        let card = Card {
            title: strip_emoji(title),
            description: description.to_string(),
            footer: format!("{} · {} read", pretty_date(&date), read),
        };
        let out = dir.join("og.png");
        render(&card, &options, &out)?;
        println!("wrote {}", out.display());
    }

    let default_card = Card {
        title: "narigon".to_string(),
        description: "A place for my ramblings.".to_string(),
        footer: String::new(),
    };
    let out = root.join("static/og-default.png");
    render(&default_card, &options, &out)?;
    println!("wrote {}", out.display());

    Ok(())
}

fn split_frontmatter(raw: &str) -> Option<(&str, &str)> {
    let rest = raw.strip_prefix("+++")?;
    let end = rest.find("+++")?;
    Some((&rest[..end], &rest[end + 3..]))
}

/// Drops emoji and joiner codepoints the bundled font has no glyphs for.
fn strip_emoji(s: &str) -> String {
    s.chars()
        .filter(|&c| {
            !matches!(
                c as u32,
                0x1F000..=0x1FAFF | 0x2300..=0x27BF | 0x2900..=0x2BFF | 0xFE00..=0xFE0F | 0x200D
            )
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn pretty_date(iso: &str) -> String {
    const MONTHS: [&str; 12] = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    let mut parts = iso.trim().splitn(3, '-');
    let (Some(y), Some(m), Some(d)) = (parts.next(), parts.next(), parts.next()) else {
        return iso.to_string();
    };
    let month = m.parse::<usize>().ok().and_then(|m| MONTHS.get(m.wrapping_sub(1)));
    let day = d.parse::<u32>().ok();
    match (month, day) {
        (Some(month), Some(day)) => format!("{month} {day}, {y}"),
        _ => iso.to_string(),
    }
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn render(card: &Card, options: &usvg::Options, out: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let svg = build_svg(card);
    let tree = usvg::Tree::from_str(&svg, options)?;
    let mut pixmap = tiny_skia::Pixmap::new(WIDTH, HEIGHT).ok_or("pixmap alloc failed")?;
    resvg::render(&tree, tiny_skia::Transform::default(), &mut pixmap.as_mut());
    if let Some(parent) = out.parent() {
        fs::create_dir_all(parent)?;
    }
    pixmap.save_png(out)?;
    Ok(())
}

fn build_svg(card: &Card) -> String {
    // JetBrains Mono advance width is 0.6em; keep lines inside the 1040px text box.
    let title_size = 76.0;
    let title_cols = (1040.0 / (title_size * 0.6)) as usize;
    let title_lines: Vec<String> = textwrap::wrap(&card.title, title_cols)
        .into_iter()
        .take(3)
        .map(|l| l.into_owned())
        .collect();

    let desc_size = 34.0;
    let desc_cols = (1040.0 / (desc_size * 0.6)) as usize;
    let desc_lines: Vec<String> = textwrap::wrap(&card.description, desc_cols)
        .into_iter()
        .take(2)
        .map(|l| l.into_owned())
        .collect();

    let mut text = String::new();
    let mut y = 265.0;
    for line in &title_lines {
        text.push_str(&format!(
            r#"<text x="80" y="{y}" font-family="JetBrains Mono" font-weight="800" font-size="{title_size}" fill="{FG}">{}</text>"#,
            xml_escape(line)
        ));
        y += title_size * 1.25;
    }
    y += 20.0;
    for line in &desc_lines {
        text.push_str(&format!(
            r#"<text x="80" y="{y}" font-family="JetBrains Mono" font-size="{desc_size}" fill="{MUTED}">{}</text>"#,
            xml_escape(line)
        ));
        y += desc_size * 1.45;
    }
    if !card.footer.is_empty() {
        text.push_str(&format!(
            r#"<text x="80" y="560" font-family="JetBrains Mono" font-size="28" fill="{MUTED}">{}</text>"#,
            xml_escape(&card.footer)
        ));
    }

    format!(
        r#"<svg width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="{WIDTH}" height="{HEIGHT}" fill="{BG}"/>
  <rect x="6" y="6" width="{}" height="{}" fill="none" stroke="{BORDER}" stroke-width="2" rx="18"/>
  <text x="80" y="120" font-family="JetBrains Mono" font-weight="700" font-size="36" fill="{ACCENT}">narigon.dev</text>
  <rect x="82" y="140" width="72" height="6" fill="{ACCENT}" rx="3"/>
  {text}
</svg>"#,
        WIDTH - 12,
        HEIGHT - 12,
    )
}
