(function () {
  "use strict";

  var withTransition = function (apply) {
    if (document.startViewTransition) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  };

  // ----- Theme toggle (light default, persisted) -----
  var toggle = document.getElementById("theme-toggle");
  var setIcon = function () {
    if (toggle) {
      toggle.textContent =
        document.documentElement.dataset.theme === "dark" ? "☀" : "☾";
    }
  };
  setIcon();
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      withTransition(function () {
        document.documentElement.dataset.theme = next;
        localStorage.setItem("narigon-theme", next);
        setIcon();
      });
    });
  }

  // ----- Post-title view transition -----
  // The article h1 always carries view-transition-name: post-title. On list
  // pages only one row may carry it: the one being clicked (forward morph) or
  // the one we just came back from (reverse morph), tracked in sessionStorage.
  var LAST = "narigon-last-post";
  if (document.querySelector(".article-head h1")) {
    sessionStorage.setItem(LAST, location.pathname);
  }
  document.querySelectorAll("[data-post-link]").forEach(function (link) {
    var title = link.querySelector(".title");
    if (!title) return;
    var path = new URL(link.href).pathname;
    if (sessionStorage.getItem(LAST) === path) {
      title.style.viewTransitionName = "post-title";
    }
    link.addEventListener("click", function () {
      document.querySelectorAll("[data-post-link] .title").forEach(function (t) {
        t.style.viewTransitionName = "";
      });
      title.style.viewTransitionName = "post-title";
      sessionStorage.setItem(LAST, path);
    });
  });

  // ----- Discord presence via the Lanyard websocket (like the old site) -----
  // Subscribes to the configured Discord ID and keeps the line live:
  // Spotify > playing activity > bare status. Hidden until real data arrives.
  var pres = document.querySelectorAll(".presence");
  if (!pres.length) return;
  var id = (pres[0].dataset.discordId || "").trim();
  if (!id) return;

  // Resolve a Discord activity asset to an image URL (game logos come either
  // as app-assets or as "mp:external/..." media proxy paths).
  var activityImage = function (activity) {
    var img = activity.assets && (activity.assets.large_image || activity.assets.small_image);
    if (!img) return null;
    if (img.indexOf("mp:") === 0) {
      return "https://media.discordapp.net/" + img.slice(3);
    }
    return "https://cdn.discordapp.com/app-assets/" + activity.application_id + "/" + img + ".png";
  };

  var card = document.getElementById("activity-card");
  var progressTimer = null;

  var fmtTime = function (ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  };

  // Live song progress from the Spotify timestamps, ticking locally.
  var setProgress = function (timestamps) {
    if (!card) return;
    var progress = card.querySelector(".progress");
    clearInterval(progressTimer);
    if (!timestamps || !timestamps.start || !timestamps.end) {
      progress.hidden = true;
      return;
    }
    var tick = function () {
      var total = timestamps.end - timestamps.start;
      var elapsed = Math.min(Date.now() - timestamps.start, total);
      progress.querySelector(".fill").style.width =
        Math.min(100, (elapsed / total) * 100) + "%";
      progress.querySelector(".ptime").textContent =
        fmtTime(elapsed) + " / " + fmtTime(total);
    };
    tick();
    progress.hidden = false;
    progressTimer = setInterval(tick, 1000);
  };

  var setCard = function (kind, href, imgUrl, kicker, label, timestamps) {
    if (!card) return;
    if (!kind) {
      card.hidden = true;
      setProgress(null);
      return;
    }
    card.dataset.kind = kind;
    if (href) card.setAttribute("href", href);
    else card.removeAttribute("href");
    var art = card.querySelector(".art");
    if (imgUrl) {
      art.src = imgUrl;
      art.hidden = false;
      art.onerror = function () { art.hidden = true; };
    } else {
      art.hidden = true;
    }
    card.querySelector(".kicker-text").textContent = kicker;
    card.querySelector(".song").textContent = label;
    setProgress(timestamps);
    card.hidden = false;
  };

  var STATUS_LABELS = {
    online: "online",
    idle: "idle",
    dnd: "do not disturb",
    offline: "offline",
  };

  var render = function (d) {
    var s = d.discord_status || "offline";
    var game = (d.activities || []).find(function (x) { return x.type === 0; });
    if (d.spotify) {
      setCard(
        "spotify",
        "https://open.spotify.com/track/" + d.spotify.track_id,
        d.spotify.album_art_url,
        "Currently listening to",
        d.spotify.artist + " - " + d.spotify.song,
        d.spotify.timestamps
      );
    } else if (game && s !== "offline") {
      setCard("game", null, activityImage(game), "Currently playing", game.name, null);
    } else {
      setCard(null);
    }
    pres.forEach(function (p) {
      p.dataset.status = s;
      p.querySelector(".line").textContent = STATUS_LABELS[s] || s;
      p.hidden = false;
    });
  };

  var heartbeat = null;
  var connect = function () {
    var ws = new WebSocket("wss://api.lanyard.rest/socket");
    ws.addEventListener("message", function (message) {
      var incoming = JSON.parse(message.data);
      if (incoming.op === 1) {
        ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } }));
        heartbeat = setInterval(function () {
          ws.send(JSON.stringify({ op: 3 }));
        }, (incoming.d && incoming.d.heartbeat_interval) || 30000);
        return;
      }
      if (incoming.op === 0 && incoming.d) render(incoming.d);
    });
    ws.addEventListener("close", function () {
      clearInterval(heartbeat);
      setTimeout(connect, 30000);
    });
  };
  connect();
})();
