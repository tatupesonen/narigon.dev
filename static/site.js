(() => {
  "use strict";

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  const withTransition = (apply) => {
    if (document.startViewTransition && !reducedMotion.matches) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  };

  // ----- Theme toggle (follows OS preference until explicitly set, persisted) -----
  const toggle = document.getElementById("theme-toggle");
  const setThemeColor = () => {
    const color =
      document.documentElement.dataset.theme === "dark" ? "#1a1712" : "#faf7f0";
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute("content", color);
    });
  };
  const setIcon = () => {
    if (toggle) {
      toggle.textContent =
        document.documentElement.dataset.theme === "dark" ? "☀" : "☾";
    }
  };
  setIcon();
  toggle?.addEventListener("click", () => {
    const next =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    withTransition(() => {
      document.documentElement.dataset.theme = next;
      localStorage.setItem("narigon-theme", next);
      setIcon();
      setThemeColor();
    });
  });
  // Track OS theme changes until the user picks a theme explicitly.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (localStorage.getItem("narigon-theme")) return;
    document.documentElement.dataset.theme = e.matches ? "dark" : "light";
    setIcon();
    setThemeColor();
  });

  // ----- Home: move the avatar into the navbar when the hero scrolls away -----
  const heroAvatar = document.querySelector(".hero > img");
  if (heroAvatar && document.querySelector(".home-nav-avatar")) {
    new IntersectionObserver(
      (entries) => {
        document.documentElement.classList.toggle(
          "avatar-in-nav",
          !entries[0].isIntersecting
        );
      },
      { rootMargin: "-80px 0px 0px 0px" }
    ).observe(heroAvatar);
  }

  // ----- Discord presence via the Lanyard websocket (like the old site) -----
  // Subscribes to the configured Discord ID and keeps the line live:
  // Spotify > playing activity > bare status. Hidden until real data arrives.
  const pres = document.querySelectorAll(".presence");
  if (!pres.length) return;
  const id = (pres[0].dataset.discordId || "").trim();
  if (!id) return;

  // Resolve a Discord activity asset to an image URL (game logos come either
  // as app-assets or as "mp:external/..." media proxy paths).
  const activityImage = (activity) => {
    const img =
      activity.assets && (activity.assets.large_image || activity.assets.small_image);
    if (!img) return null;
    if (img.startsWith("mp:")) {
      return `https://media.discordapp.net/${img.slice(3)}`;
    }
    return `https://cdn.discordapp.com/app-assets/${activity.application_id}/${img}.png`;
  };

  const card = document.getElementById("activity-card");
  let progressTimer = null;

  const fmtTime = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  };

  // Live song progress from the Spotify timestamps, ticking locally.
  const setProgress = (timestamps) => {
    if (!card) return;
    const progress = card.querySelector(".progress");
    clearInterval(progressTimer);
    if (!timestamps || !timestamps.start || !timestamps.end) {
      progress.hidden = true;
      return;
    }
    const tick = () => {
      const total = timestamps.end - timestamps.start;
      const elapsed = Math.min(Date.now() - timestamps.start, total);
      progress.querySelector(".fill").style.width =
        `${Math.min(100, (elapsed / total) * 100)}%`;
      progress.querySelector(".ptime").textContent =
        `${fmtTime(elapsed)} / ${fmtTime(total)}`;
    };
    tick();
    progress.hidden = false;
    progressTimer = setInterval(tick, 1000);
  };

  const setCard = (kind, href, imgUrl, kicker, label, timestamps) => {
    if (!card) return;
    if (!kind) {
      card.hidden = true;
      setProgress(null);
      return;
    }
    card.dataset.kind = kind;
    if (href) card.setAttribute("href", href);
    else card.removeAttribute("href");
    const art = card.querySelector(".art");
    if (imgUrl) {
      art.src = imgUrl;
      art.hidden = false;
      art.onerror = () => { art.hidden = true; };
    } else {
      art.hidden = true;
    }
    card.querySelector(".kicker-text").textContent = kicker;
    const song = card.querySelector(".song");
    const inner = song.querySelector(".inner");
    inner.textContent = label;
    setProgress(timestamps);
    card.hidden = false;
    // Long titles scroll back and forth instead of truncating
    // (unless the user prefers reduced motion — then they just clip).
    requestAnimationFrame(() => {
      const overflow = inner.scrollWidth - song.clientWidth;
      if (overflow > 4 && !reducedMotion.matches) {
        song.style.setProperty("--song-scroll-shift", `${-overflow}px`);
        song.style.setProperty("--song-scroll-dur", `${Math.max(6, overflow / 15 + 4)}s`);
        song.classList.add("scroll");
      } else {
        song.classList.remove("scroll");
      }
    });
  };

  const STATUS_LABELS = {
    online: "online",
    idle: "idle",
    dnd: "do not disturb",
    offline: "offline",
  };

  // Temporarily disable an element's transitions across one style flush, so
  // cache-driven renders on navigation don't replay the entrance animation.
  const withoutTransition = (els) => {
    els.forEach((el) => { el.style.transition = "none"; });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        els.forEach((el) => { el.style.transition = ""; });
      });
    });
  };

  const render = (d, instant) => {
    if (instant && card) {
      withoutTransition([card, ...pres]);
    }
    const s = d.discord_status || "offline";
    const game = (d.activities || []).find((x) => x.type === 0);
    if (d.spotify) {
      setCard(
        "spotify",
        `https://open.spotify.com/track/${d.spotify.track_id}`,
        d.spotify.album_art_url,
        "Currently listening to",
        `${d.spotify.artist} - ${d.spotify.song}`,
        d.spotify.timestamps
      );
    } else if (game && s !== "offline") {
      setCard("game", null, activityImage(game), "Currently playing", game.name, null);
    } else {
      setCard(null);
    }
    pres.forEach((p) => {
      p.dataset.status = s;
      p.querySelector(".line").textContent = STATUS_LABELS[s] || s;
      p.hidden = false;
    });
  };

  // Render the last known presence immediately so navigation doesn't pop.
  try {
    const cached = JSON.parse(sessionStorage.getItem("narigon-presence"));
    if (cached) render(cached, true);
  } catch { /* no cache */ }

  let heartbeat = null;
  const connect = () => {
    const ws = new WebSocket("wss://api.lanyard.rest/socket");
    ws.addEventListener("message", (message) => {
      const incoming = JSON.parse(message.data);
      if (incoming.op === 1) {
        ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } }));
        heartbeat = setInterval(() => {
          ws.send(JSON.stringify({ op: 3 }));
        }, incoming.d?.heartbeat_interval || 30000);
        return;
      }
      if (incoming.op === 0 && incoming.d) {
        try {
          sessionStorage.setItem("narigon-presence", JSON.stringify(incoming.d));
        } catch { /* storage full/blocked */ }
        render(incoming.d);
      }
    });
    ws.addEventListener("close", () => {
      clearInterval(heartbeat);
      setTimeout(connect, 30000);
    });
  };
  connect();
})();
