// Pyaar: Spotify 1.3.5 (October 2026) dropped most of its readable class
// names (.Root__top-container, .main-nowPlayingBar-*, .player-controls__*,
// .progress-bar, .x-progressBar-*, .main-globalNav-link-icon,
// .main-yourLibraryX-header) and re-hashed others (the home tiles, their
// grid, the home header wash and sticky header). The theme's CSS and code
// still use the old names, so on the new layout this finds each element by
// its data-testid or position and gives it its old class back: one class
// each, so every rule keeps its specificity and the look is unchanged. On
// older Spotify, where the classes exist, it does nothing.
(function classShim() {
  const tagged = new WeakMap(); // element -> the old classes it should carry
  // Spotify rewrites an element's className when its state changes (the home
  // button on each page change, for one): put the old class straight back
  const guard = new MutationObserver((records) => {
    for (const r of records) {
      for (const cls of tagged.get(r.target) || []) {
        if (!r.target.classList.contains(cls)) r.target.classList.add(cls);
      }
    }
  });
  function want(el, cls) {
    if (!el) return;
    let set = tagged.get(el);
    if (!set) {
      tagged.set(el, (set = new Set()));
      guard.observe(el, { attributes: true, attributeFilter: ["class"] });
    }
    set.add(cls);
    if (!el.classList.contains(cls)) el.classList.add(cls);
  }

  function scan() {
    const nav = document.getElementById("global-nav-bar");
    const top = nav?.parentElement;
    want(top, "Root__top-container");

    // The banner: its wrapper, the bar, and its right side (volume, queue)
    const npb = document.querySelector('[data-testid="now-playing-bar"]');
    want(npb, "main-nowPlayingBar-container");
    if (npb?.parentElement && npb.parentElement !== top) want(npb.parentElement, "L5dM7nzQpMJtRkvZZBZL");
    const bar = npb?.firstElementChild;
    want(bar, "main-nowPlayingBar-nowPlayingBar");
    if (bar?.children.length === 3) want(bar.children[2], "main-nowPlayingBar-right");

    // Player controls: shuffle + previous on the left, next + repeat on the right
    const controls = npb?.querySelector('[data-testid="general-controls"]');
    want(controls, "player-controls__buttons");
    const sides = controls ? [...controls.children].filter((c) => c.tagName === "DIV") : [];
    if (sides.length === 2) {
      want(sides[0], "player-controls__left");
      want(sides[1], "player-controls__right");
    }

    // Progress and volume bars: background > slider areas (hover preview, then
    // the fill) > the fill itself
    for (const pb of npb?.querySelectorAll('[data-testid="progress-bar"]') || []) {
      want(pb, "progress-bar");
      const bg = pb.querySelector(':scope > [data-testid="progress-bar-background"]');
      want(bg, "x-progressBar-progressBarBg");
      const areas = bg ? [...bg.children].filter((c) => c.firstElementChild && !c.dataset.testid) : [];
      for (const a of areas) want(a, "x-progressBar-sliderArea");
      want(areas[areas.length - 1]?.firstElementChild, "x-progressBar-fillColor");
    }

    // Home: the button beside the search bar
    const form = nav?.querySelector("form");
    want(form?.parentElement?.parentElement?.querySelector(":scope > button"), "main-globalNav-link-icon");

    // The library's header ("Your Library" in Doto)
    want(document.querySelector("#Desktop_LeftSidebar_Id .YourLibraryX header"), "main-yourLibraryX-header");

    // Home page: the shortcut tiles and their grid, the grey header wash and
    // the sticky header's background
    const home = document.querySelector('#main-view [data-testid="home-page"]');
    if (home) {
      const first = home.querySelector('[data-testid="shortcut-background"]')?.parentElement?.parentElement;
      if (first && !first.classList.contains("Ut_wBpPPXvZ0dLV07qaf")) {
        for (const b of home.querySelectorAll('[data-testid="shortcut-background"]')) {
          const tile = b.parentElement?.parentElement;
          want(tile, "Ut_wBpPPXvZ0dLV07qaf");
          want(tile?.parentElement, "_8jwKm1Yri1YCL_lRTb0");
        }
      }
      for (const c of home.parentElement?.children || []) {
        if (c === home) continue;
        const style = c.getAttribute("style") || "";
        if (!c.firstElementChild && /background/.test(style)) want(c, "_ddPhxHdxmpT13IbjTmr");
        const layer = c.firstElementChild;
        if (c.children.length === 2 && layer && !layer.firstElementChild && /opacity/.test(layer.getAttribute("style") || "")) {
          want(layer, "mkLf3oHSpzyF02_8URcp");
        }
      }
    }
  }

  // Once the player is on screen: if the old names are there, this is an
  // older Spotify and nothing is needed. Otherwise tag now, and again (once
  // per frame at most, before it paints) whenever Spotify re-renders.
  let pending = false;
  const later = () => {
    if (pending || document.hidden) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; scan(); });
  };
  (function start() {
    if (!document.querySelector('[data-testid="now-playing-bar"]')) return setTimeout(start, 200);
    if (document.querySelector(".player-controls__buttons, .main-nowPlayingBar-container")) return;
    scan();
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    document.addEventListener("visibilitychange", later);
  })();
})();

// Pyaar: smoothly speeds up the glass blob swirl while a control is hovered.
// The animations themselves live in user.css; this only eases their playback rate,
// so the motion never jumps when the pointer enters or leaves.
(function glassControls() {
  // Matched by position because Spotify drops some data-testids (e.g. on "Disable Shuffle").
  const SELECTOR = [
    '.player-controls__buttons [data-testid="control-button-playpause"]',
    ".player-controls__left > button",
    ".player-controls__right > button",
    "#global-nav-bar div:has(form) > button.main-globalNav-link-icon", // Home
  ].join(",");

  const HOVER_RATE = 1.6;
  const EASE_MS = 700;
  const rafs = new WeakMap();

  function rampRate(button, target) {
    const anims = button
      .getAnimations({ subtree: true })
      .filter((a) => typeof CSSAnimation === "undefined" || a instanceof CSSAnimation);
    if (!anims.length) return;

    const from = anims.map((a) => a.playbackRate);
    const start = performance.now();
    cancelAnimationFrame(rafs.get(button));

    const step = (now) => {
      const t = Math.min(1, (now - start) / EASE_MS);
      const k = 1 - Math.pow(1 - t, 3);
      anims.forEach((a, i) => {
        a.playbackRate = from[i] + (target - from[i]) * k;
      });
      if (t < 1) rafs.set(button, requestAnimationFrame(step));
    };
    rafs.set(button, requestAnimationFrame(step));
  }

  document.addEventListener("pointerover", (e) => {
    const button = e.target.closest?.(SELECTOR);
    if (!button || button.contains(e.relatedTarget)) return;
    rampRate(button, HOVER_RATE);
  });

  document.addEventListener("pointerout", (e) => {
    const button = e.target.closest?.(SELECTOR);
    if (!button || button.contains(e.relatedTarget)) return;
    rampRate(button, 1);
  });

  // Neon press flash: keep .glass-pressed on a little after release so the
  // glow is visible even on a quick click, then let CSS fade it out.
  const HOLD_MS = 280;
  const timers = new WeakMap();

  function press(button) {
    clearTimeout(timers.get(button));
    button.classList.add("glass-pressed");
  }

  function release(button) {
    clearTimeout(timers.get(button));
    timers.set(button, setTimeout(() => button.classList.remove("glass-pressed"), HOLD_MS));
  }

  document.addEventListener("pointerdown", (e) => {
    const button = e.target.closest?.(SELECTOR);
    if (button) press(button);
  });

  document.addEventListener("pointerup", (e) => {
    const button = e.target.closest?.(SELECTOR);
    if (button) release(button);
  });

  document.addEventListener("pointercancel", (e) => {
    const button = e.target.closest?.(SELECTOR);
    if (button) release(button);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== " " && e.key !== "Enter") return;
    const button = document.activeElement?.closest?.(SELECTOR);
    if (button) press(button);
  });

  document.addEventListener("keyup", (e) => {
    const button = document.activeElement?.closest?.(SELECTOR);
    if (button) release(button);
  });
})();

// Pyaar: everything that moves on its own redraws on the same 30fps beat
// (window.__mtBeat), so the frames in between have nothing to repaint. The
// slow CSS loops below, both shaders and the progress bar all follow it.
window.__mtBeat = (now) => Math.floor(now * 30 / 1000);

// Pyaar: the like wash spreading from the heart (loveBurst sets
// window.__mtLoveWave = { x, y, r, feather } in viewport CSS px). For a light
// whose canvas covers rect (viewport CSS px) at `scale` canvas px per CSS px
// and `h` canvas px tall, the wave's center, radius and soft edge in that
// canvas's pixels (y up, as gl_FragCoord). With no wave, it covers everything.
window.__mtWaveFor = (rect, scale, h) => {
  const w = window.__mtLoveWave;
  if (!w || !rect) return [0, 0, 1e7, 1];
  return [(w.x - rect.left) * scale, h - (w.y - rect.top) * scale, w.r * scale, Math.max(1, w.feather * scale)];
};

// Pyaar: element sizes for the lights, kept by a ResizeObserver. Reading
// clientWidth/clientHeight every frame forced the page to recalculate its
// styles and layout in the middle of the frame (2.5 ms a frame, and up to
// ~45 ms on big pages like Liked Songs); the observer reports changes after
// layout instead, so nothing is forced.
window.__mtSize = (() => {
  const sizes = new WeakMap();
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) sizes.set(e.target, { w: e.target.clientWidth, h: e.target.clientHeight });
  });
  return (el) => {
    let size = sizes.get(el);
    if (!size) {
      size = { w: el.clientWidth, h: el.clientHeight };
      sizes.set(el, size);
      ro.observe(el);
    }
    return size;
  };
})();

// Pyaar: the light motion preset (the lights button beside Marketplace):
// "full" moves everything; "balanced" is lighter for older PCs (the center
// light at half resolution, still at 30fps since it's always moving and 15
// looked laggy; the library light and glass loops at 30 and 15fps); "still"
// stops all motion: each light is drawn once and only redrawn when the
// song's colors or the window change.
window.__mtMode = () => window.PyaarSettings?.get("lightMode") || "full";

// Pyaar: the slow glass loops (the controls' float, morph and swirl, the
// home pearl, the banner's turning cube, the search bar's idle shimmer) are
// CSS animations, which the browser restyles and re-blurs 60 times a second.
// They move a fraction of a pixel per frame, so they're paused and stepped
// here on the shared beat instead: same keyframes, same easing, same timing,
// half the work. playbackRate is still honored (glassControls ramps it on
// hover). Loops that only run on hover or focus are left to CSS.
(function slowLoops() {
  const SLOW = new Set([
    "glass-float", "glass-morph", "glass-spin", "mt-home-float",
    "cube-turn", "cube-glow", "cube-reflect",
    "mt-glow-spin", "mt-glow-breathe",
  ]);
  const clock = new Map(); // animation -> its own current time
  let beat = -1, lastTick = 0, lastScan = -1e9;

  // Picks up loops as Spotify re-renders. Only writes in the loop below:
  // reading an animation's state would force a style recalc for each one.
  function scan() {
    const seen = new Set();
    for (const a of document.getAnimations()) {
      if (!SLOW.has(a.animationName)) continue;
      seen.add(a);
      if (!clock.has(a)) {
        clock.set(a, a.currentTime || 0);
        a.pause();
      }
    }
    for (const a of clock.keys()) if (!seen.has(a)) clock.delete(a);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const b = window.__mtBeat(now);
    if (b === beat) return;
    beat = b;
    if (now - lastScan > 1000) {
      scan();
      lastScan = now;
    }
    // Still: they hold where they are (still paused, so they never fall back
    // to running natively). Balanced: every other beat (15fps).
    const mode = window.__mtMode();
    if (mode === "still") { lastTick = now; return; }
    if (mode === "balanced" && b % 2) return;
    const dt = lastTick ? Math.min(100, now - lastTick) : 0;
    lastTick = now;
    for (const [a, t] of clock) {
      const next = t + dt * a.playbackRate;
      clock.set(a, next);
      a.currentTime = next;
    }
  }
  requestAnimationFrame(frame);
})();

// Pyaar: the glass player bar's light takes the current song's colors.
// Exposes the cover as --mt-cover, its main colors as --mt-art-*, its
// distinct colors as --mt-p1..--mt-p5, and an 8-stop rainbow of the whole
// artwork's colors in proportion as window.__mtRainbow (12 rgb stops, read by the
// center light's shader directly).
(function glassLight() {
  function coverUrl() {
    const meta = window.Spicetify?.Player?.data?.item?.metadata;
    const uri = meta?.image_xlarge_url || meta?.image_large_url || meta?.image_url;
    if (uri?.startsWith("spotify:image:")) {
      return "https://i.scdn.co/image/" + uri.slice("spotify:image:".length);
    }
    if (uri?.startsWith("http")) return uri;
    return document.querySelector(".main-nowPlayingBar-container img")?.src || null;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  const hsl = (h, s, l) => `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
  // An hsl() string from hsl() above as [r, g, b] in 0..1, rounded to whole
  // 0..255 steps the way the browser computes it
  function hslToRgb(str) {
    const [h, sp, lp] = str.match(/[\d.]+/g).map(Number);
    const sat = sp / 100, lit = lp / 100;
    const a = sat * Math.min(lit, 1 - lit);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return lit - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    };
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255) / 255);
  }

  // Reads the cover's real colors. Pixels are grouped into a few color
  // clusters (k-means); each cluster keeps its true hue and saturation, so
  // nothing is invented. Colors are only lifted in lightness where needed to
  // show on a dark background.
  async function artColors(url) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const px = [];
    for (let i = 0; i < data.length; i += 4) px.push([data[i], data[i + 1], data[i + 2]]);

    const clusters = kmeans(px, 6);
    const total = px.length;
    const info = clusters
      .filter((c) => c.count > total * 0.015)
      .map((c) => {
        const [h, s, l] = rgbToHsl(...c.rgb);
        return { h, s, l, share: c.count / total };
      });

    // The main color: the most present one, favoring a little color over grey
    const main = info.slice().sort((x, y) => y.share * (0.5 + y.s) - x.share * (0.5 + x.s))[0];
    const darkest = info.slice().sort((x, y) => x.l - y.l)[0];

    const lift = (l, lo, hi) => Math.min(hi, Math.max(lo, l));
    return {
      rainbow: artRainbow(px),
      main: hsl(main.h, main.s, lift(main.l, 0.42, 0.68)),
      light: hsl(main.h, main.s, lift(main.l + 0.2, 0.72, 0.86)),
      dark: hsl(darkest.h, darkest.s, Math.min(darkest.l, 0.12)),
      // The cover's colors by how much of it they cover
      palette: [0, 1, 2, 3, 4].map((i) => {
        const c = info.slice().sort((x, y) => y.share - x.share)[i % info.length];
        return hsl(c.h, c.s, lift(c.l, 0.32, 0.82));
      }),
    };
  }

  // The artwork's colors in proportion, as 12 stops for the center light.
  // Colors come from clustering the whole image and keep their real hue,
  // saturation and (nearly) lightness. Each color gets stops in proportion to
  // how much of the artwork it covers, so the main color dominates and small
  // accents stay small (or drop out). Similar colors sit side by side.
  function artRainbow(px) {
    const total = px.length;
    // Merge clusters that are really the same color (k-means splits big areas)
    const clusters = kmeans(px, 8).filter((c) => c.count > 0);
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    for (let merged = true; merged; ) {
      merged = false;
      for (let i = 0; i < clusters.length && !merged; i++) {
        for (let j = i + 1; j < clusters.length && !merged; j++) {
          if (dist(clusters[i].rgb, clusters[j].rgb) < 64) {
            const a = clusters[i], b = clusters[j], n = a.count + b.count;
            a.rgb = a.rgb.map((v, k) => (v * a.count + b.rgb[k] * b.count) / n);
            a.count = n;
            clusters.splice(j, 1);
            merged = true;
          }
        }
      }
    }
    const found = clusters
      .filter((c) => c.count > total * 0.03)
      .map((c) => {
        const [h, s, l] = rgbToHsl(...c.rgb);
        // Only lift very dark colors enough to show on black
        return { h, s, l: Math.min(0.72, Math.max(0.36, l)), share: c.count / total };
      });
    if (!found.length) return Array(12).fill(hsl(0, 0, 0.5));

    // Order: colorful ones around the wheel, greys placed by lightness
    const colorful = found.filter((c) => c.s >= 0.12).sort((x, y) => x.h - y.h);
    const greys = found.filter((c) => c.s < 0.12).sort((x, y) => x.l - y.l);
    const order = colorful.slice();
    greys.forEach((g, i) => order.splice(Math.round(((i + 1) * order.length) / (greys.length + 1)) + i, 0, g));

    // 12 stops shared out strictly by area: walk the colors in order and give
    // each stop to whichever color covers that point of the artwork
    const N = 12;
    const sum = order.reduce((n, c) => n + c.share, 0);
    const stops = [];
    let prev = null, run = 0;
    for (let i = 0; i < N; i++) {
      const at = ((i + 0.5) / N) * sum;
      let acc = 0, pick = order[order.length - 1];
      for (const c of order) {
        acc += c.share;
        if (at <= acc) { pick = c; break; }
      }
      run = pick === prev ? run + 1 : 0;
      prev = pick;
      // a gentle shimmer between a color's own neighboring stops
      stops.push(hsl(pick.h, pick.s, Math.min(0.75, Math.max(0.34, pick.l + (run % 2 ? 0.04 : -0.02)))));
    }
    return stops;
  }

  // Groups pixels into k color clusters; returns their average color and size.
  function kmeans(px, k) {
    const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    // Deterministic spread-out starting points
    const centers = [px[0].slice()];
    while (centers.length < k) {
      let best = null, bestD = -1;
      for (const p of px) {
        const d = Math.min(...centers.map((c) => dist(p, c)));
        if (d > bestD) { bestD = d; best = p; }
      }
      centers.push(best.slice());
    }
    let assign = new Array(px.length).fill(0);
    for (let iter = 0; iter < 10; iter++) {
      assign = px.map((p) => {
        let bi = 0, bd = Infinity;
        centers.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } });
        return bi;
      });
      const sums = centers.map(() => [0, 0, 0, 0]);
      px.forEach((p, i) => { const s = sums[assign[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++; });
      sums.forEach((s, i) => { if (s[3]) centers[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
    }
    const counts = centers.map(() => 0);
    assign.forEach((a) => counts[a]++);
    return centers.map((c, i) => ({ rgb: c, count: counts[i] }));
  }

  let current = null;

  async function apply(url) {
    if (current !== url) apply.retries = 0;
    current = url;
    const root = document.documentElement;
    root.style.setProperty("--mt-cover", `url("${url}")`);
    try {
      const c = await artColors(url);
      if (current !== url) return;
      root.style.setProperty("--mt-art", c.main);
      root.style.setProperty("--mt-art-light", c.light);
      root.style.setProperty("--mt-art-dark", c.dark);
      c.palette.forEach((color, i) => root.style.setProperty(`--mt-p${i + 1}`, color));
      // The center light's 12 colors go straight to its shader (as rgb 0..1),
      // not onto :root: only the shader uses them, and every :root change
      // restyles the whole page
      window.__mtRainbow = c.rainbow.map(hslToRgb);
    } catch {
      // The image wasn't ready (common right after startup): try again shortly
      if (current === url && (apply.retries = (apply.retries || 0) + 1) <= 5) {
        setTimeout(() => current === url && apply(url), 1500);
      }
    }
  }

  // Spotify fires "songchange" before the new cover is in the player data,
  // so keep checking for a little while until the cover actually changes.
  function check(attempt = 0) {
    const url = coverUrl();
    if (url && url !== current) {
      apply(url);
    } else if (attempt < 25) {
      setTimeout(() => check(attempt + 1), 250);
    }
  }

  (function waitForPlayer() {
    if (!document.body || !window.Spicetify?.Player?.addEventListener) {
      setTimeout(waitForPlayer, 300);
      return;
    }
    Spicetify.Player.addEventListener("songchange", () => document.hidden || check());
    // Hidden, nothing is sampled; the current song's colors come in on return
    document.addEventListener("visibilitychange", () => document.hidden || check());
    // Safety net for changes that don't fire an event (e.g. ads, queue edits)
    setInterval(() => {
      if (document.hidden) return;
      const url = coverUrl();
      if (url && url !== current) apply(url);
    }, 3000);
    check();
  })();
})();

// Pyaar: moves the progress bar every frame from the player's own clock,
// so it glides in exact sync instead of stepping once a second. Exposes the
// position as --mt-pos on the bar (used by user.css). While the bar is being
// dragged, and briefly after, it follows Spotify's own value instead.
// Also marks <html data-mt-paused> while playback is paused.
(function smoothProgress() {
  const BAR = '[data-testid="playback-progressbar"] .progress-bar';
  let followSpotifyUntil = 0;
  let dragging = false;

  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.('[data-testid="playback-progressbar"]')) dragging = true;
  });
  const release = () => {
    if (dragging) followSpotifyUntil = performance.now() + 700;
    dragging = false;
  };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);

  let last = "";
  let lastPct = -1, width = 0, widthAt = -1e9, beat = -1;
  let wasPaused = null;
  function frame(now) {
    requestAnimationFrame(frame);
    // On the shared beat, unless the knob is being dragged
    const b = window.__mtBeat(now);
    if (b === beat && !dragging) return;
    beat = b;
    const bar = document.querySelector(BAR);
    const player = window.Spicetify?.Player;

    // Lets user.css shift the timeline's colors when playback pauses
    const paused = !!player?.data?.isPaused;
    if (paused !== wasPaused) {
      document.documentElement.toggleAttribute("data-mt-paused", paused);
      wasPaused = paused;
    }

    if (bar && player) {
      let pct;
      if (dragging || now < followSpotifyUntil) {
        pct = parseFloat(bar.style.getPropertyValue("--progress-bar-transform"));
      } else {
        const duration = player.getDuration?.();
        const progress = player.getProgress?.();
        if (duration > 0 && progress >= 0) pct = Math.min(100, (progress / duration) * 100);
      }
      if (now - widthAt > 1000) {
        width = bar.offsetWidth || 0;
        widthAt = now;
      }
      // A move under a quarter pixel isn't visible; skip the restyle for it
      const step = width > 0 ? 25 / width : 0;
      if (Number.isFinite(pct) && !dragging && Math.abs(pct - lastPct) < step) pct = NaN;
      if (Number.isFinite(pct)) {
        lastPct = pct;
        const value = pct.toFixed(3) + "%";
        if (value !== last || bar.style.getPropertyValue("--mt-pos") !== value) {
          bar.style.setProperty("--mt-pos", value);
          last = value;
        }
      }
    }
  }
  requestAnimationFrame(frame);
})();

// Pyaar: settings, and "Pyaar Settings" in the account menu.
// Settings live in localStorage and are shared through window.PyaarSettings
// (get / set / on). The menu is where the theme's visual controls will grow.
(function settings() {
  const KEY = "pyaar:settings";
  // Music sync starts on, at Normal; the center light's tempo starts off.
  // The lights start in Full motion, and the library clears when idle (the
  // lights button).
  const DEFAULTS = { musicSync: true, syncIntensity: "normal", centerLight: true, lightTempo: false, lightMode: "full", libraryVeil: true };
  const state = { ...DEFAULTS };
  let saved = {};
  try {
    // (settings saved before the theme was named Pyaar carry over)
    saved = JSON.parse(localStorage.getItem(KEY) || localStorage.getItem("mytheme:settings") || "{}") || {};
  } catch {}
  Object.assign(state, saved);
  // The old "Library light: 30 fps" choice became the Balanced preset
  if (saved.libraryFps === 30 && !saved.lightMode) state.lightMode = "balanced";
  delete state.libraryFps;
  // ("Library glass" was offered briefly and removed; the glass stays frosted)
  delete state.libraryGlass;
  const listeners = new Set();

  const S = (window.PyaarSettings = {
    get: (key) => state[key],
    set(key, value) {
      state[key] = value;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
      listeners.forEach((fn) => fn(key, value));
    },
    on: (fn) => listeners.add(fn),
  });

  const LEVELS = [["subtle", "Subtle"], ["normal", "Normal"], ["strong", "Strong"]];
  const MODES = [["full", "Full"], ["balanced", "Balanced"], ["still", "Still"]];
  // The motion preset as html[data-mt-mode], for user.css (Still's frost)
  const applyMode = () => { document.documentElement.dataset.mtMode = state.lightMode || "full"; };
  applyMode();
  S.on((key) => key === "lightMode" && applyMode());

  // The settings window: frosted glass in the song's colors (user.css,
  // "Pyaar Settings window"). Grows into the full visual controls later.
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // A switch; with `needs`, it dims while that other setting is off
  function switchRow(label, hint, key, needs) {
    const row = el("div", "mt-set-row");
    const text = el("div", "mt-set-text");
    text.append(el("div", "mt-set-label", label), el("div", "mt-set-hint", hint));
    const sw = el("button", "mt-switch");
    sw.type = "button";
    sw.setAttribute("role", "switch");
    sw.setAttribute("aria-label", label);
    const sync = () => {
      sw.setAttribute("aria-checked", String(!!S.get(key)));
      if (needs) row.classList.toggle("mt-set-off", S.get(needs) === false);
    };
    sync();
    sw.addEventListener("click", () => { S.set(key, !S.get(key)); sync(); });
    if (needs) S.on((k) => k === needs && sync());
    row.append(text, sw);
    return row;
  }

  // A segmented slider over `options` ([value, label] pairs); with `needs`,
  // it dims while that other setting is off
  function segRow(label, hint, key, options, needs) {
    const row = el("div", "mt-set-row mt-set-level");
    const text = el("div", "mt-set-text");
    text.append(el("div", "mt-set-label", label), el("div", "mt-set-hint", hint));
    const seg = el("div", "mt-seg");
    seg.setAttribute("role", "radiogroup");
    seg.setAttribute("aria-label", label);
    seg.style.setProperty("--n", options.length);
    seg.append(el("span", "mt-seg-thumb"));
    const buttons = options.map(([value, text]) => {
      const b = el("button", "mt-seg-option", text);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.addEventListener("click", () => { S.set(key, value); sync(); });
      seg.append(b);
      return b;
    });
    const sync = () => {
      const i = Math.max(0, options.findIndex(([v]) => v === S.get(key)));
      seg.style.setProperty("--i", i);
      buttons.forEach((b, j) => b.setAttribute("aria-checked", String(i === j)));
      if (needs) row.classList.toggle("mt-set-off", !S.get(needs));
    };
    sync();
    if (needs) S.on((k) => k === needs && sync());
    row.append(text, seg);
    return row;
  }

  // The playing song's motion style, as music sync detected it (read live
  // from PyaarSync.style while the window is open)
  function styleRow() {
    const row = el("div", "mt-set-row mt-set-style");
    const text = el("div", "mt-set-text");
    const hint = el("div", "mt-set-hint");
    text.append(el("div", "mt-set-label", "Detected style"), hint);
    const value = el("div", "mt-set-value");
    row.append(text, value);
    const sync = () => {
      const on = !!S.get("musicSync");
      const st = window.PyaarSync?.style;
      row.classList.toggle("mt-set-off", !on);
      if (!on) {
        value.textContent = "Off";
        hint.textContent = "Turn on Music sync to detect the song's style";
      } else if (!st) {
        value.textContent = "Listening";
        hint.textContent = "How the library light moves for this song";
      } else {
        value.textContent = st.label;
        hint.textContent = (st.share >= 0.8 ? "How the library light moves for this song" : `Mostly ${st.label}, a little ${st.second}`)
          + (st.from === "features" ? " (no beat map for this song)" : "");
      }
    };
    sync();
    row.refresh = sync;
    return row;
  }

  let open = null;
  function openSettings() {
    if (open) return;
    const backdrop = el("div", "mt-settings-backdrop");
    const panel = el("div", "mt-settings");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Pyaar Settings");

    const head = el("div", "mt-settings-head");
    const close = el("button", "mt-settings-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    const heart = el("span", "mt-menu-heart mt-settings-heart");
    heart.append(window.PyaarGlassHeart?.(true, true) ?? "");
    head.append(heart, el("h2", "mt-settings-title", "Pyaar Settings"), close);

    const music = el("section", "mt-set-group");
    const style = styleRow();
    music.append(el("h3", "mt-set-group-title", "Music"),
      switchRow("Music sync", "The library light follows the song's tempo and bass", "musicSync"),
      segRow("Sync intensity", "How strongly the light moves with the music", "syncIntensity", LEVELS, "musicSync"),
      style);
    // Kept current while the window is open (a new song, sync turned on)
    const styleTimer = setInterval(style.refresh, 1000);

    panel.append(head, music);
    backdrop.append(panel);
    document.body.append(backdrop);
    requestAnimationFrame(() => backdrop.classList.add("mt-open"));

    const onKey = (e) => e.key === "Escape" && dismiss();
    function dismiss() {
      clearInterval(styleTimer);
      backdrop.classList.remove("mt-open");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => backdrop.remove(), 350);
      open = null;
    }
    document.addEventListener("keydown", onKey, true);
    close.addEventListener("click", dismiss);
    backdrop.addEventListener("click", (e) => e.target === backdrop && dismiss());
    open = backdrop;
  }
  S.open = openSettings;

  // The lights menu: a button beside Marketplace in the top bar opens a
  // small glass card with the motion preset and the center light's switches,
  // so anyone whose PC struggles can calm or stop the lights in one click
  let pop = null;
  function closeLights() {
    if (!pop) return;
    const layer = pop;
    pop = null;
    layer.classList.remove("mt-open");
    const button = document.querySelector("[data-mt-lights]");
    button?.setAttribute("aria-expanded", "false");
    button?.querySelector(".mt-gh")?.classList.remove("mt-gh-filled");
    setTimeout(() => layer.remove(), 300);
  }
  function openLights(button) {
    if (pop) return closeLights();
    const layer = el("div", "mt-pop-layer");
    const card = el("div", "mt-settings mt-pop");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "Pyaar lights");
    const r = button.getBoundingClientRect();
    card.style.left = Math.max(12, r.left) + "px";
    card.style.top = r.bottom + 8 + "px";
    const group = el("section", "mt-set-group");
    group.append(el("h3", "mt-set-group-title", "Lights"),
      segRow("Motion", "Balanced and Still are lighter on older PCs", "lightMode", MODES),
      switchRow("Center light", "The moving light behind the center", "centerLight"),
      switchRow("Follow the tempo", "The center light speeds up and slows down with the song's tempo", "lightTempo", "centerLight"),
      switchRow("Clear library when idle", "After 7 s without the mouse, the library's text dissolves into its light", "libraryVeil"));
    // The rest (music sync and its style) is in the full window
    const more = el("button", "mt-set-row mt-set-link");
    more.type = "button";
    const moreText = el("div", "mt-set-text");
    moreText.append(el("div", "mt-set-label", "Pyaar Settings"), el("div", "mt-set-hint", "Music sync and the song's style"));
    more.append(moreText, el("span", "mt-set-chevron", "\u203A"));
    more.addEventListener("click", () => { closeLights(); openSettings(); });
    card.append(group, more);
    layer.append(card);
    document.body.append(layer);
    button.setAttribute("aria-expanded", "true");
    button.querySelector(".mt-gh")?.classList.add("mt-gh-filled");
    requestAnimationFrame(() => layer.classList.add("mt-open"));
    pop = layer;
  }
  // Closes on a click outside it or on Escape
  document.addEventListener("pointerdown", (e) => {
    if (pop && !e.target.closest?.(".mt-pop, [data-mt-lights]")) closeLights();
  }, true);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeLights(), true);

  // The button: the Pyaar heart in silver glass (the settings' own color, so
  // it isn't mistaken for the like button's pink). Like the like button, it
  // toggles: clear glass when closed, filled while its menu is open. Styled
  // like Marketplace's own button and placed just after it
  // (or after the back and forward buttons without Marketplace). Spotify may
  // re-render the top bar, so it's put back when it goes missing.
  function addLightsButton() {
    const nav = document.getElementById("global-nav-bar");
    if (!nav || nav.querySelector("[data-mt-lights]") || !window.PyaarGlassHeart) return;
    const after = nav.querySelector(".custom-navlinks-scrollable_container") || nav.querySelector("button")?.parentElement;
    if (!after) return;
    const sample = nav.querySelector("button.custom-navlink") || nav.querySelector("button");
    const button = document.createElement("button");
    button.type = "button";
    button.className = (sample?.className || "").replace(/\bcustom-navlink\b/, "").trim();
    button.classList.add("mt-lights-button");
    button.dataset.mtLights = "";
    button.setAttribute("aria-label", "Pyaar");
    button.setAttribute("aria-expanded", "false");
    button.title = "Pyaar";
    const heart = el("span", "mt-menu-heart mt-settings-heart");
    heart.append(window.PyaarGlassHeart(false, true));
    button.append(heart);
    button.addEventListener("click", () => openLights(button));
    after.after(button);
  }
  setInterval(() => document.hidden || addLightsButton(), 1000);
})();

// Pyaar: music sync. The library ribbon moves with the song: it flows faster
// with its tempo, surges and brightens on its bass hits, and opens up in its
// loud parts. The center light only takes the tempo (sync.tempo), and only
// when its own "Follow the tempo" setting is on.
// Spotify doesn't let a theme hear the audio, so this reads the track's audio
// analysis (beats, bars, sections, and short sound segments with loudness,
// attack and timbre) and finds the bass hits in it: beats where a sound
// attacks sharply and sounds dark, weighted toward the first beat of each
// bar. The analysis is known ahead of time, so each hit starts rising just
// before it lands instead of lagging behind it.
// Layers, each with its own feel:
//  - pulse: the bass hits (a punch that fades before the next beat)
//  - shimmer: bright, sharp sounds (hi-hats, snares) as quick glints
//  - breath: the loudness moment to moment, following each swell and fade
//  - energy: how loud this part of the song is, slowly
//  - build / bloom: the analysis knows each section's loudness ahead, so
//    before a louder section the light speeds up and brightens, and when it
//    lands it blooms wide and bright, then settles
// Publishes window.PyaarSync, read by both shaders every frame (nothing is
// written to CSS per frame, which would restyle the whole page). When off,
// paused, or without analysis, everything settles back to the calm default.
(function musicSync() {
  const LEVELS = { subtle: 0.55, normal: 1, strong: 1.5 };
  // The motion when nothing is known about the song's style (its features
  // couldn't be read): the light's original settings
  const PLAIN = { pulse: 1, gate: 0, release: 0.3, rise: 0.07, ref: 110, lo: 0.7, hi: 1.6, surge: 0.3, shimmer: 1, breath: 1, build: 1, bloom: 1, bloomTau: 1.8 };
  const sync = (window.PyaarSync = {
    speed: 1,    // flow speed: from the tempo, plus a surge on each hit
    tempo: 1,    // the center light's speed: the song's tempo at this moment (1 = calm), eased
    pulse: 0,    // bass hit envelope (0..1.5 with intensity)
    energy: 0.5, // how loud this part of the song is, 0..1
    shimmer: 0,  // bright transients (hi-hats, snares), quick
    breath: 0,   // each swell and fade against this part's loudness (around 0)
    build: 0,    // rising before a louder section, 0..1
    bloom: 0,    // a louder section just landed, fading over ~2 s
    amount: 0,   // how much the energy shapes the light (0 when inactive)
    style: null, // the playing song's motion style (styleOf), or null
  });
  const settings = window.PyaarSettings;

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const quantile = (values, q) => {
    const a = values.slice().sort((x, y) => x - y);
    return a.length ? a[Math.min(a.length - 1, Math.floor(q * a.length))] : 0;
  };
  // Index of the last item starting at or before time t (-1 if none)
  function lastAt(list, t) {
    let lo = 0, hi = list.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].t <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  function prepare(id, data) {
    const beats = data.beats || [], segments = data.segments || [];
    const bars = data.bars || [], sections = data.sections || [];
    if (beats.length < 8 || segments.length < 8) return null;

    // Tempo from the beat grid. The analysis often doubles slow songs
    // (e.g. 216 for a 108 song), so fold it into a musical range.
    const gaps = beats.slice(1).map((b, i) => b.start - beats[i].start);
    let bpm = 60 / quantile(gaps, 0.5);
    while (bpm > 165) bpm /= 2;
    while (bpm < 60) bpm *= 2;

    // The tempo moment to moment, for the center light: at each beat, the
    // median of the 9 beat gaps around it (so one missed or extra beat
    // doesn't move it), in the same octave as the song's tempo above, and
    // kept within half to double of it
    const octave = (bpm * quantile(gaps, 0.5)) / 60;
    const tempos = beats.map((b, i) => {
      const local = (60 / quantile(gaps.slice(Math.max(0, i - 4), i + 5), 0.5)) * octave;
      return Math.min(2 * bpm, Math.max(0.5 * bpm, local));
    });

    // Loudness normalized to this track, so quiet songs still react
    const loud = segments.map((s) => s.loudness_max);
    const lo = quantile(loud, 0.1), hi = quantile(loud, 0.97);
    const level = (db) => clamp01((db - lo) / Math.max(6, hi - lo));
    const segs = segments.map((s) => ({
      t: s.start,
      level: level(s.loudness_max),
      // the loudness curve: from the start level up to the peak, then on
      // toward the next segment's start
      l0: level(s.loudness_start),
      tp: s.start + s.loudness_max_time,
      attack: s.loudness_max - s.loudness_start,
      // timbre[1] is brightness: low means the sound is mostly low end
      dark: clamp01(0.5 - (s.timbre?.[1] ?? 0) / 260),
    }));

    // Bright transients (hi-hats, snares): sharp attacks in bright segments
    const rawShine = segs.map((g) => ({
      t: g.tp,
      s: clamp01(g.attack / 12) * (1 - g.dark) * (0.3 + 0.7 * g.level),
    }));
    const shineTop = quantile(rawShine.map((h) => h.s), 0.9) || 1;
    const shine = rawShine.map((h) => ({ t: h.t, s: clamp01(h.s / shineTop) ** 1.4 })).filter((h) => h.s > 0.15);

    // Bass hits: on each beat, the sharpest, darkest attack landing near it
    const downbeats = bars.map((b) => b.start);
    let si = 0, di = 0;
    const raw = beats.map((b) => {
      while (si < segs.length && segs[si].t < b.start - 0.08) si++;
      let best = 0;
      for (let k = si; k < segs.length && segs[k].t < b.start + 0.08; k++) {
        const g = segs[k];
        best = Math.max(best, clamp01(g.attack / 14) * (0.35 + 0.65 * g.level) * (0.4 + 0.6 * g.dark));
      }
      while (di < downbeats.length - 1 && downbeats[di + 1] <= b.start + 0.06) di++;
      const down = Math.abs((downbeats[di] ?? -9) - b.start) < 0.06;
      return { t: b.start, s: best * (down ? 1.25 : 1) };
    });
    // Normalized, then curved so strong hits stand clearly above the rest
    const top = quantile(raw.map((h) => h.s), 0.9) || 1;
    const hits = raw.map((h) => ({ t: h.t, s: clamp01(h.s / top) ** 1.6 })).filter((h) => h.s > 0.08);

    // Two measurements for the style (styleOf): how steady the beat is
    // (Spotify's confidence in each beat), and how many of the strong hits
    // land between the beats (high in hip-hop and reggaeton, low in dance)
    const beatGap = quantile(gaps, 0.5);
    const grid = beats.map((b) => ({ t: b.start }));
    const strong = quantile(segs.map((g) => g.attack), 0.7);
    let offbeat = 0, counted = 0;
    for (const g of segs) {
      if (g.attack < strong) continue;
      const i = Math.max(0, lastAt(grid, g.tp));
      const frac = ((g.tp - grid[i].t) / beatGap) % 1;
      counted++;
      if ((frac > 0.15 && frac < 0.35) || (frac > 0.65 && frac < 0.85)) offbeat++;
    }
    const stats = {
      clarity: quantile(beats.map((b) => b.confidence ?? 0.5), 0.5),
      offbeat: counted ? offbeat / counted : 0,
    };

    return {
      id, bpm, hits, segs, shine, stats, tempos, grid,
      beatGap,
      sections: sections.map((s) => ({ t: s.start, db: s.loudness })),
    };
  }

  // Spotify has no analysis for many songs now ("analysis not found"), but its
  // audio features (tempo, meter, energy, loudness) are there for nearly all of
  // them. Lay an even beat grid at that tempo from the start of the song, so the
  // light still moves in time with it: softer, since the exact beat positions
  // aren't known, and with no build-ups or drops to read.
  function approximate(id, f, duration) {
    let bpm = f.tempo;
    while (bpm > 165) bpm /= 2;
    while (bpm < 60) bpm *= 2;
    const gap = 60 / bpm, meter = f.time_signature >= 3 ? f.time_signature : 4;
    const hits = [];
    for (let i = 0; i * gap < duration; i++) hits.push({ t: i * gap, s: i % meter === 0 ? 0.7 : 0.45 });
    const level = clamp01(f.energy ?? 0.5);
    return {
      id, bpm, hits, shine: [], approx: true, beatGap: gap,
      segs: [{ t: 0, level, l0: level, tp: 0, attack: 0, dark: 0.5 }],
      sections: [{ t: 0, db: f.loudness ?? -8 }],
    };
  }

  // Motion styles. Spotify gives no genre, so each song's style is inferred
  // from its audio features (danceability, energy, acousticness, speech,
  // tempo), its language and label (Indian and Latin music), and, when the
  // analysis is there, how steady and busy its beat is. Each style sets how
  // the library light moves: how strong the beat pulses are and which hits
  // get through (gate: the share of the song's weakest hits left out, so 0
  // pulses on every beat and 0.55 only on the accents and bar starts), how
  // fast they fade (release, seconds) and how early
  // they rise (rise), how tempo becomes speed (bpm / ref, clamped lo..hi),
  // how much each hit surges the flow, and how much it glints, breathes,
  // builds and blooms. The top two styles are blended, so a song between two
  // styles moves between them.
  const STYLES = {
    dance:     { label: "Dance",          pulse: 1.0,  gate: 0,    release: 0.24, rise: 0.07, ref: 122, lo: 0.8,  hi: 1.5,  surge: 0.3,  shimmer: 0.8,  breath: 1.0, build: 1.0, bloom: 1.0, bloomTau: 2.2 },
    hiphop:    { label: "Hip-hop / trap", pulse: 0.95, gate: 0.5,  release: 0.38, rise: 0.1,  ref: 140, lo: 0.75, hi: 1.05, surge: 0,    shimmer: 0.3,  breath: 1.2, build: 0.5, bloom: 0.8, bloomTau: 1.8 },
    rock:      { label: "Rock / pop",     pulse: 0.85, gate: 0.3,  release: 0.32, rise: 0.09, ref: 120, lo: 0.85, hi: 1.4,  surge: 0.2,  shimmer: 0.7,  breath: 1.0, build: 0.6, bloom: 0.8, bloomTau: 2.0 },
    indian:    { label: "Indian film",    pulse: 0.85, gate: 0.55, release: 0.28, rise: 0.1,  ref: 110, lo: 0.85, hi: 1.4,  surge: 0.15, shimmer: 0.2,  breath: 1.1, build: 0.7, bloom: 0.9, bloomTau: 2.0 },
    latin:     { label: "Latin",          pulse: 0.9,  gate: 0.35, release: 0.26, rise: 0.08, ref: 95,  lo: 0.85, hi: 1.35, surge: 0.2,  shimmer: 0.5,  breath: 1.0, build: 0.7, bloom: 0.9, bloomTau: 2.0 },
    ballad:    { label: "Ballad",         pulse: 0.2,  gate: 0.75, release: 0.5,  rise: 0.25, ref: 999, lo: 0.95, hi: 0.95, surge: 0,    shimmer: 0.3,  breath: 1.7, build: 0.5, bloom: 0.8, bloomTau: 2.5 },
    classical: { label: "Classical / ambient", pulse: 0, gate: 1,  release: 0.6,  rise: 0.3,  ref: 999, lo: 0.85, hi: 0.85, surge: 0,    shimmer: 0.25, breath: 1.7, build: 0.5, bloom: 0.9, bloomTau: 3.0 },
    speech:    { label: "Spoken",         pulse: 0,    gate: 1,    release: 0.6,  rise: 0.2,  ref: 999, lo: 0.8,  hi: 0.8,  surge: 0,    shimmer: 0,    breath: 1.2, build: 0,   bloom: 0,   bloomTau: 2.0 },
  };
  const INDIAN_LANGS = /^(hi|pa|ur|ta|te|ml|kn|bn|gu|mr|or|as|bho|raj|ne|si)$/;
  const INDIAN_LABELS = /t-series|yrf|yash raj|saregama|zee music|tips (industries|music)|times music|speed records|white hill|venus|aditya music|lahari|think music|sony music (entertainment )?india|desi melodies/i;
  const fold = (bpm) => {
    while (bpm > 165) bpm /= 2;
    while (bpm < 60) bpm *= 2;
    return bpm;
  };

  // How well the song fits each style (higher fits better). f: audio
  // features; meta: { lang, label, year }; stats: from the analysis, or null
  function styleScores(f, meta, stats) {
    const raw = f.tempo > 0 ? f.tempo : 110;
    const t = fold(raw);
    const indian = INDIAN_LANGS.test(meta.lang || "") || INDIAN_LABELS.test(meta.label || "");
    const latin = /^(es|pt)$/.test(meta.lang || "");
    const steady = stats ? stats.clarity : 0.6;
    const offbeat = stats ? stats.offbeat : 0.15;
    const rap = Math.min(0.35, Math.max(0, f.speechiness - 0.08));
    return {
      speech: 3 * (f.speechiness - 0.62),
      classical: 1.6 * f.instrumentalness + 1.2 * f.acousticness - 1.6 * f.energy - 0.5
        - 1.5 * Math.max(0, f.energy - 0.45) + (t < 100 ? 0.2 : 0) + (stats && steady < 0.35 ? 0.6 : 0),
      ballad: f.acousticness - 1.4 * (f.energy - 0.45) - Math.max(0, f.danceability - 0.6) - 0.35
        + (t < 105 ? 0.3 : 0) + (stats && steady < 0.5 ? 0.3 : 0) - 1.5 * Math.max(0, f.speechiness - 0.12),
      // A steady four-on-the-floor: danceable, energetic, electronic, with
      // few hits between the beats and no rapping (fast styles like
      // hardcore count by their real tempo)
      dance: 1.4 * (f.danceability - 0.5) + (f.energy - 0.55) - 0.8 * f.acousticness
        + ((t >= 115 && t <= 150) || (raw >= 150 && raw <= 185) ? 0.4 : 0) + 0.5 * f.instrumentalness * f.energy
        + (stats ? 0.8 * (steady - 0.6) - 1.2 * Math.max(0, offbeat - 0.2) : 0)
        - 2 * Math.max(0, f.speechiness - 0.12) - (indian || latin ? 0.3 : 0),
      // Rapping, and strong hits between the beats
      hiphop: 3 * rap + 0.4 * (f.energy - 0.5) - 0.5 * f.acousticness - 0.1
        + (stats && offbeat > 0.27 ? 0.35 : 0) + (t <= 100 && f.speechiness > 0.1 ? 0.15 : 0) - (indian ? 0.4 : 0),
      rock: 1.2 * (f.energy - 0.5) + 0.3 * (f.danceability - 0.45) - 0.7 * f.acousticness - 0.4 * f.instrumentalness
        - Math.max(0, f.speechiness - 0.15) + (t >= 95 ? 0.15 : 0) - (indian || latin ? 0.3 : 0)
        + (stats ? 0.4 * (0.6 - steady) : 0),
      indian: (indian ? 1.1 : -1) + 0.8 * (f.energy - 0.5) + 0.5 * (f.danceability - 0.5)
        + (stats && offbeat > 0.3 ? 0.2 : 0),
      latin: (latin ? 1.0 : -1) + 0.7 * (f.danceability - 0.55) + 0.4 * (f.energy - 0.5)
        + (t >= 85 && t <= 105 ? 0.3 : 0),
    };
  }

  // The style: the top two blended (by a soft max of their scores), the
  // blended settings, and a short description for Pyaar Settings
  function styleOf(f, meta, stats) {
    const scores = styleScores(f, meta, stats);
    const [a, b] = Object.entries(scores).sort((x, y) => y[1] - x[1]);
    const wa = 1 / (1 + Math.exp((b[1] - a[1]) / 0.35));
    const p = {};
    for (const key of Object.keys(PLAIN)) p[key] = STYLES[a[0]][key] * wa + STYLES[b[0]][key] * (1 - wa);
    return { name: a[0], label: STYLES[a[0]].label, second: STYLES[b[0]].label, share: wa, p, scores, from: stats ? "analysis" : "features" };
  }

  // base62 track id to the 32-hex id the metadata service uses
  function gid(id) {
    const A = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let n = 0n;
    for (const c of id) n = n * 62n + BigInt(A.indexOf(c));
    return n.toString(16).padStart(32, "0");
  }

  let track = null, loadingId = null, retryAt = 0;
  async function load(id) {
    loadingId = id;
    track = null;
    try {
      const token = Spicetify.Platform.AuthorizationAPI.getState().token.accessToken;
      const auth = { headers: { Authorization: "Bearer " + token } };
      const base = "https://spclient.wg.spotify.com/audio-attributes/v1/";
      const json = (res) => (res.ok ? res.json() : null);
      const [r, f, m] = await Promise.all([
        fetch(`${base}audio-analysis/${id}?format=json`, auth),
        fetch(`${base}audio-features/${id}`, auth).then(json).catch(() => null),
        fetch(`https://spclient.wg.spotify.com/metadata/4/track/${gid(id)}?market=from_token`,
          { headers: { ...auth.headers, Accept: "application/json" } }).then(json).catch(() => null),
      ]);
      let t;
      if (r.ok) t = prepare(id, await r.json());
      else if (r.status === 404) {
        const duration = (Spicetify.Player.getDuration?.() || 0) / 1000;
        if (f?.tempo > 0 && duration > 0) t = approximate(id, f, duration);
      }
      if (!t) throw new Error("no analysis " + r.status);
      // The song's style shapes the motion. Its gate leaves out the song's
      // weaker hits (measured against this song's own hits), for the styles
      // that shouldn't thump on every beat; the hits that stay are rescaled
      // so the strongest still land fully.
      const meta = { lang: m?.language_of_performance?.[0], label: m?.album?.label, year: m?.album?.date?.year };
      t.style = f ? styleOf(f, meta, t.stats || null) : null;
      const share = t.style?.p.gate || 0;
      if (share >= 0.99) t.hits = [];
      else if (share > 0 && t.hits.length) {
        const floor = quantile(t.hits.map((h) => h.s), share);
        t.hits = t.hits
          .map((h) => ({ t: h.t, s: clamp01((h.s - floor) / Math.max(0.05, 1 - floor)) }))
          .filter((h) => h.s > 0.02);
      }
      if (loadingId === id) track = t;
    } catch {
      // No analysis (local files, podcasts, very new releases) or the request
      // failed: stay calm, and try once more a little later
      if (loadingId === id && !retryAt) retryAt = performance.now() + 8000;
    }
  }

  const ease = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
  let last = performance.now(), baseSpeed = 1, energy = 0.5, loud = 0.5, bloom = 0, build = 0;

  // An envelope over a list of hits: the last ones fading, the next one
  // rising in just before it lands
  function envelope(list, pos, decay, rise) {
    const i = lastAt(list, pos);
    let v = 0;
    for (let j = Math.max(0, i - 1); j <= i + 1 && j < list.length; j++) {
      const h = list[j], d = pos - h.t;
      const env = d >= 0 ? Math.exp(-d / decay) : d > -rise ? (1 + d / rise) ** 2 : 0;
      v = Math.max(v, h.s * env);
    }
    return v;
  }

  // The loudness at this moment, following each segment's swell and fade
  function loudnessAt(t, pos) {
    const i = Math.max(0, lastAt(t.segs, pos));
    const g = t.segs[i], next = t.segs[i + 1];
    if (pos < g.tp) return g.l0 + (g.level - g.l0) * clamp01((pos - g.t) / Math.max(0.01, g.tp - g.t));
    const end = next ? next.t : g.tp + 0.5;
    return g.level + ((next ? next.l0 : g.level) - g.level) * clamp01((pos - g.tp) / Math.max(0.01, end - g.tp));
  }
  // For testing the styles on any song's features
  sync.styleOf = (f, meta, stats) => styleOf(f, meta || {}, stats || null);
  let lastSection = -1, P = PLAIN;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (document.hidden) return;

    const player = window.Spicetify?.Player;
    const uri = player?.data?.item?.uri || "";
    const id = uri.startsWith("spotify:track:") ? uri.split(":")[2] : null;
    const on = !!settings?.get("musicSync");
    // The center light's "Follow the tempo" needs the analysis too, even with
    // music sync off
    const tempoOn = settings?.get("lightTempo") === true && settings?.get("centerLight") !== false;
    const want = on || tempoOn;
    if (want && id && id !== loadingId) { retryAt = 0; load(id); }
    if (want && id && !track && retryAt && now > retryAt) { retryAt = -1; load(id); }

    const playing = want && track && track.id === id && !player.data.isPaused ? track : null;
    const t = on ? playing : null;
    // The center light's speed: the tempo alone (110 bpm is the calm
    // default), as it is at this moment in the song, so it speeds up and
    // slows down with it (songs without the analysis keep one tempo)
    let bpmNow = playing?.bpm;
    if (tempoOn && playing?.tempos) bpmNow = playing.tempos[Math.max(0, lastAt(playing.grid, player.getProgress() / 1000))];
    sync.tempo = ease(sync.tempo, tempoOn && playing ? Math.min(1.6, Math.max(0.7, bpmNow / 110)) : 1, dt, 1.2);
    const k = LEVELS[settings?.get("syncIntensity")] ?? 1;

    if (t) {
      const pos = player.getProgress() / 1000;

      // This song's style (PLAIN if its features couldn't be read)
      P = t.style?.p || PLAIN;

      // Bass: each hit fades well before the next beat, so the bass punches
      sync.pulse = envelope(t.hits, pos, Math.min(P.release, 0.55 * t.beatGap), t.approx ? 0.12 : P.rise) * k * P.pulse;
      // Bright sounds: quick glints
      sync.shimmer = envelope(t.shine, pos, 0.09, 0.03) * k * P.shimmer;

      // Build-ups and drops: is a clearly louder section coming?
      const si = lastAt(t.sections, pos);
      const cur = t.sections[si], next = t.sections[si + 1];
      let rising = 0;
      if (cur && next) {
        const jump = clamp01((next.db - cur.db - 2) / 6);
        const lead = Math.min(8, 16 * (60 / t.bpm)); // about 4 bars
        rising = jump * clamp01(1 - (next.t - pos) / lead) ** 2;
      }
      build = ease(build, rising, dt, 0.25);

      // The loudness moment to moment (lightly smoothed)
      loud = ease(loud, loudnessAt(t, pos), dt, 0.05);

      // Energy: how loud this part is (the same loudness curve, eased slowly)
      energy = ease(energy, loud, dt, 0.7);

      // Speed: the tempo against the style's own calm tempo, a little faster
      // when loud (ballads and classical keep an even pace)
      baseSpeed = ease(baseSpeed, Math.min(P.hi, Math.max(P.lo, t.bpm / P.ref)) * (0.88 + 0.24 * energy), dt, 1.5);

      // Sections: count steps forward (a seek just re-syncs)
      const section = lastAt(t.sections, pos);
      if (section === lastSection + 1 && section > 0) {
        // A louder section just landed: bloom
        const jump = clamp01((t.sections[section].db - t.sections[section - 1].db - 2) / 6);
        bloom = Math.max(bloom, jump * P.bloom);
      }
      lastSection = section;
    } else {
      sync.pulse = ease(sync.pulse, 0, dt, 0.15);
      sync.shimmer = ease(sync.shimmer, 0, dt, 0.15);
      energy = ease(energy, 0.5, dt, 1);
      loud = ease(loud, 0.5, dt, 0.5);
      build = ease(build, 0, dt, 0.5);
      baseSpeed = ease(baseSpeed, 1, dt, 1.5);
    }
    bloom *= Math.exp(-dt / P.bloomTau);
    sync.energy = energy;
    sync.amount = ease(sync.amount, t ? k : 0, dt, 0.8);
    // each swell and fade, measured against this part's own loudness
    sync.breath = sync.amount * (loud - energy) * P.breath;
    sync.build = build * k * P.build;
    sync.bloom = bloom * k;
    sync.speed = baseSpeed + P.surge * sync.pulse + 0.6 * sync.build + 0.35 * sync.bloom;
    // For the readout in Pyaar Settings: the playing song's style, once known
    sync.style = track && track.id === id ? track.style || null : null;
  }
  requestAnimationFrame(frame);
})();

// Pyaar: frozen frost for the Still preset. In Still the lights don't move,
// but the glass over them (the library slab, the main view) still re-blurs
// on every frame anything inside it changes, such as each frame of
// scrolling. So in Still the light under each glass is blurred once, with
// the glass's own blur, saturation and brightness, into a still image
// beneath it, and that glass's live blur is switched off: the same picture,
// computed once instead of every frame. It's redrawn only when the light
// itself redraws (a song's colors arriving, a resize). Edges are extended
// before blurring, as the live glass does, so the rim matches too.
(function stillFrost() {
  const GLASS = {
    flow: { blur: 22, saturate: 1.25, brightness: 1.05 }, // the library slab
    silk: { blur: 7, saturate: 1.1, brightness: 1.03 },   // the main view
  };
  const canvases = {};
  let pad = null;

  function canvasFor(kind, src) {
    let c = canvases[kind];
    if (!c?.isConnected || c.previousElementSibling !== src) {
      c = c || document.createElement("canvas");
      c.id = `mt-${kind}-frost`;
      c.className = "mt-frost";
      c.setAttribute("aria-hidden", "true");
      src.after(c);
      canvases[kind] = c;
    }
    return c;
  }

  // kind: "flow" | "silk"; src: the light's WebGL canvas (just drawn);
  // srcScale: its pixels per CSS px; rect: the glass's area in the light's
  // CSS px ({x, y, w, h}), where the frost canvas is placed
  function draw(kind, src, srcScale, rect) {
    const g = GLASS[kind], dpr = window.devicePixelRatio || 1;
    const W = Math.max(2, Math.round(rect.w * dpr)), H = Math.max(2, Math.round(rect.h * dpr));
    const R = g.blur * dpr, P = Math.ceil(R * 3);
    pad = pad || document.createElement("canvas");
    if (pad.width !== W + 2 * P || pad.height !== H + 2 * P) {
      pad.width = W + 2 * P;
      pad.height = H + 2 * P;
    }
    const p = pad.getContext("2d");
    p.imageSmoothingQuality = "high";
    // The light under the glass, then its edge pixels stretched outward
    p.drawImage(src, rect.x * srcScale, rect.y * srcScale, rect.w * srcScale, rect.h * srcScale, P, P, W, H);
    p.drawImage(pad, P, P, 1, H, 0, P, P, H);
    p.drawImage(pad, P + W - 1, P, 1, H, P + W, P, P, H);
    p.drawImage(pad, 0, P, W + 2 * P, 1, 0, 0, W + 2 * P, P);
    p.drawImage(pad, 0, P + H - 1, W + 2 * P, 1, 0, P + H, W + 2 * P, P);
    const c = canvasFor(kind, src);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    c.style.left = rect.x + "px";
    c.style.top = rect.y + "px";
    c.style.width = rect.w + "px";
    c.style.height = rect.h + "px";
    const o = c.getContext("2d");
    o.filter = `blur(${R}px) saturate(${g.saturate}) brightness(${g.brightness})`;
    o.drawImage(pad, -P, -P);
    o.filter = "none";
    document.documentElement.setAttribute(`data-mt-frost-${kind}`, "");
  }

  function clear(kind) {
    document.documentElement.removeAttribute(`data-mt-frost-${kind}`);
  }

  window.__mtFrost = { draw, clear };
})();

// Pyaar: the flowing liquid-glass ribbon behind the library's frosted glass.
// A small WebGL shader draws a wide, twisting sheet of liquid glass standing
// upright and flowing slowly, colored only with the current cover's colors
// (--mt-p1..5, --mt-art*). It renders at low resolution because the glass
// blurs it anyway. With music sync (window.PyaarSync) it flows with the
// song's tempo, swells and flashes on bass hits, and glows with its loudness.
(function liquidRibbon() {
  const VERT = `
    attribute vec2 pos;
    void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

  const FRAG = `
    precision mediump float;
    uniform vec2 res;
    uniform float t;
    uniform float energy;
    uniform float pulse;   // bass hit, 0..1.5
    uniform float shimmer; // bright sounds (hi-hats, snares)
    uniform vec3 s0, s1, s2, s3, s4, sbase, shi, sbg; // the song's colors
    uniform vec3 l0, l1, l2, l3, l4, lbase, lhi, lbg; // the like wash's
    uniform vec4 wave; // the wash spreading from the heart: center, radius, soft edge (px)
    uniform float lv;  // the wash's strength, 0..1
    // This pixel's colors: the song's, or the wash's where it has reached
    vec3 p0, p1, p2, p3, p4, base, hi, bg;
    float lk;

    // The cover's colors blended smoothly: a slow, continuous drift through them
    vec3 accent(float x) {
      float a = 0.5 + 0.5 * sin(x);
      float b = 0.5 + 0.5 * sin(x * 0.73 + 2.1);
      float c = 0.5 + 0.5 * sin(x * 0.51 + 4.2);
      vec3 col = p0 * (0.6 + a) + p1 * b + p2 * c + p3 * a * b * 0.6 + p4 * (1.0 - a) * c * 0.6;
      return col / (1.6 + b + c + a * b * 0.6 + (1.0 - a) * c * 0.6);
    }

    // One twisting sheet of liquid glass, standing upright.
    vec4 sheet(vec2 uv, float aspect, float ph, float amp, float width, float speed) {
      float y = uv.y;
      float x = (uv.x - 0.5) * aspect;
      float tt = t * speed;
      // The spine sways, the width breathes, and the sheet twists as it flows
      float c = amp * (sin(y * 1.9 + tt * 0.9 + ph) * 0.65 + sin(y * 3.9 - tt * 1.1 + ph * 1.7) * 0.35);
      // A bulge travels down the sheet as it flows
      // (and swells on each bass hit)
      float w = width * (1.0 + 0.22 * sin(y * 1.3 + tt * 0.6 + ph * 0.8) + 0.2 * sin(y * 2.6 - tt * 1.4 + ph))
              * (1.0 + 0.2 * pulse);
      // Twists travel along it rather than turning in place
      float th = y * 3.3 - tt * 1.2 + ph + 0.6 * sin(y * 1.2 + tt * 0.5 + ph);
      float ct = cos(th);
      float cw = w * (0.18 + 0.82 * abs(ct));
      float s = clamp((x - c) / cw, -1.6, 1.6);
      float inside = smoothstep(1.0, 0.72, abs(s));

      // The surface curves across its width: light slides over it smoothly
      float na = th + s * (0.8 + 0.3 * sin(y * 2.0 + tt));
      float facing = cos(na - 0.5);
      float broad = 0.5 + 0.5 * facing;
      float sheen = pow(max(facing, 0.0), 6.0);
      float spec = pow(max(facing, 0.0), 22.0);
      float edge = smoothstep(0.45, 1.0, abs(s));

      // Color: the cover's main color fills the sheet; its other colors drift
      // slowly along it and gather toward the edges
      vec3 acc = accent(y * 1.6 - tt * 0.5 + ph + s * 0.6);
      vec3 col = mix(base, acc, 0.35 + 0.45 * edge);
      // A second, softer reflection from the other side, like glossy folds
      float back = pow(max(cos(na + 2.4), 0.0), 10.0);
      // Bass hits flash the sheen and the highlight
      vec3 body = col * (0.18 + 0.5 * broad) + acc * edge * 0.5 + hi * sheen * (0.4 + 0.45 * pulse)
                + hi * back * 0.25 + vec3(1.0) * spec * (0.55 + 0.5 * pulse + 0.7 * shimmer);

      float glow = exp(-pow(abs(x - c) / (cw + 0.05 + 0.04 * pulse), 2.0) * 1.8);
      return vec4(body * inside + col * glow * (0.12 + 0.12 * pulse) * (1.0 - inside), inside);
    }

    void main() {
      lk = lv * (1.0 - smoothstep(wave.z - wave.w, wave.z, distance(gl_FragCoord.xy, wave.xy)));
      p0 = mix(s0, l0, lk); p1 = mix(s1, l1, lk); p2 = mix(s2, l2, lk);
      p3 = mix(s3, l3, lk); p4 = mix(s4, l4, lk);
      base = mix(sbase, lbase, lk); hi = mix(shi, lhi, lk); bg = mix(sbg, lbg, lk);
      vec2 uv = gl_FragCoord.xy / res;
      uv.y = 1.0 - uv.y;
      float aspect = res.x / res.y;
      vec3 c = bg;
      vec4 b = sheet(uv, aspect, 2.6, 0.08, 0.08, 0.27);
      vec4 a = sheet(uv, aspect, 0.0, 0.11, 0.16, 0.34);
      c = mix(c, c * 0.5 + b.rgb * 0.6, b.a * 0.7) + b.rgb * 0.6 * (1.0 - b.a);
      c = mix(c, c * 0.3 + a.rgb, a.a * 0.88) + a.rgb * (1.0 - a.a);
      gl_FragColor = vec4(c * (0.5 + 0.4 * (energy + 0.8 * lk)) * (1.0 + 0.12 * pulse), 1.0);
    }`;

  const SCALE = 0.5; // render at half the panel's CSS size; the glass blurs it
  let canvas, gl, prog, loc = {};
  const colors = { p0: [0.5, 0.5, 0.5], p1: [0.5, 0.5, 0.5], p2: [0.5, 0.5, 0.5], p3: [0.5, 0.5, 0.5], p4: [0.5, 0.5, 0.5], base: [0.5, 0.5, 0.5], hi: [0.8, 0.8, 0.8], bg: [0.02, 0.02, 0.03] };
  const target = JSON.parse(JSON.stringify(colors));
  // The love burst's hot pink and violet (see loveBurst)
  const LOVE = { p0: [1, 0.25, 0.9], p1: [1, 0.14, 0.59], p2: [0.59, 0.33, 1], p3: [1, 0.55, 0.96], p4: [0.45, 0.3, 1], base: [1, 0.25, 0.9], hi: [1, 0.85, 0.98], bg: [0.08, 0.03, 0.22] };
  // Each color's uniforms: s<suffix> (song) and l<suffix> (wash)
  const SUFFIX = { p0: "0", p1: "1", p2: "2", p3: "3", p4: "4", base: "base", hi: "hi", bg: "bg" };
  // The panel's place on screen, for the wash's position (with readTheme)
  let hostRect = null;
  let energy = 1;

  function parseColor(str) {
    const m = str.match(/[\d.]+/g);
    return m && m.length >= 3 ? [m[0] / 255, m[1] / 255, m[2] / 255] : null;
  }

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    ["p1", "p2", "p3", "p4", "p5"].forEach((name, i) => {
      const c = parseColor(cs.getPropertyValue("--mt-" + name));
      if (c) target["p" + i] = c;
    });
    const base = parseColor(cs.getPropertyValue("--mt-art"));
    if (base) target.base = base;
    const hi = parseColor(cs.getPropertyValue("--mt-art-light"));
    if (hi) target.hi = hi;
    const dark = parseColor(cs.getPropertyValue("--mt-art-dark"));
    if (dark) target.bg = dark.map((v) => v * 0.55);
    const e = parseFloat(cs.getPropertyValue("--mt-energy"));
    if (Number.isFinite(e)) energy = e;
    hostRect = document.getElementById("Desktop_LeftSidebar_Id")?.getBoundingClientRect() || null;
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function setup() {
    canvas = document.createElement("canvas");
    canvas.id = "mt-flow";
    gl = canvas.getContext("webgl", { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["res", "t", "energy", "pulse", "shimmer", "wave", "lv"]) loc[n] = gl.getUniformLocation(prog, n);
    for (const [key, suffix] of Object.entries(SUFFIX)) {
      loc["s" + key] = gl.getUniformLocation(prog, "s" + suffix);
      loc["l" + key] = gl.getUniformLocation(prog, "l" + suffix);
    }
    return true;
  }

  function attach() {
    const host = document.getElementById("Desktop_LeftSidebar_Id");
    if (host && canvas.parentElement !== host) host.prepend(canvas);
    return host;
  }

  let last = 0, beat = -1, drawn = "", clock = performance.now() / 1000;
  function frame(now) {
    requestAnimationFrame(frame);
    // Full: every frame (60fps), so the flow and its music-sync pulses stay
    // extra smooth. Balanced: the shared 30fps beat (about 10% of a core
    // less for the window, measured). Still: no motion, see below.
    const mode = window.__mtMode();
    const still = mode === "still";
    const b = window.__mtBeat(now);
    if (b === beat && mode !== "full") return;
    beat = b;
    // Its own clock, so the music sync can speed the flow up and down
    // smoothly (held in Still, where the music doesn't move it either)
    const sync = still ? null : window.PyaarSync;
    if (!still) clock += Math.min(0.1, (now - last) / 1000) * (sync?.speed ?? 1);
    if (document.hidden) { last = now; return; }
    const host = attach();
    if (!host) return;
    // (the panel's size from the shared observer: reading it here forced a
    // style and layout recalculation every frame)
    const size = window.__mtSize(host);
    const w = Math.max(2, Math.round(size.w * SCALE));
    const h = Math.max(2, Math.round(size.h * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    // Ease toward the current song's colors
    const k = Math.min(1, (now - last) / 900);
    last = now;
    let moving = 0;
    for (const key in colors) {
      colors[key] = colors[key].map((v, i) => {
        moving = Math.max(moving, Math.abs(target[key][i] - v));
        return v + (target[key][i] - v) * k;
      });
    }
    // Still: the canvas keeps its last frame; redraw only while the colors
    // cross-fade, or when the size, brightness or love burst changes
    const love = window.__mtLove || 0;
    const sig = `${w}x${h}|${energy.toFixed(3)}|${mode}`;
    if (still && sig === drawn && moving < 0.002 && !love) return;
    drawn = sig;
    gl.uniform2f(loc.res, w, h);
    gl.uniform1f(loc.t, clock);
    // Louder parts, each swell, build-ups and drops all lift its glow
    // The love burst (window.__mtLove) turns the ribbon hot pink for a moment
    gl.uniform1f(loc.energy, energy + (sync
      ? sync.amount * (sync.energy - 0.5) * 0.7 + sync.breath * 0.3 + sync.build * 0.15 + sync.bloom * 0.3
      : 0));
    gl.uniform1f(loc.pulse, sync?.pulse ?? 0);
    gl.uniform1f(loc.shimmer, sync?.shimmer ?? 0);
    // The song's colors, and the like wash's where it has spread to
    for (const key in SUFFIX) {
      gl.uniform3fv(loc["s" + key], colors[key]);
      gl.uniform3fv(loc["l" + key], LOVE[key]);
    }
    gl.uniform1f(loc.lv, love);
    gl.uniform4fv(loc.wave, window.__mtWaveFor(hostRect, SCALE, h));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Still: the library slab's glass gets its frost from this frame
    // (stillFrost), instead of re-blurring live
    if (still) window.__mtFrost?.draw("flow", canvas, SCALE, { x: 0, y: 0, w: size.w, h: size.h });
    else window.__mtFrost?.clear("flow");
  }

  function start() {
    if (!document.body) return setTimeout(start, 300);
    try {
      if (!setup()) return;
    } catch (err) {
      console.warn("Pyaar ribbon shader failed:", err);
      return;
    }
    document.documentElement.setAttribute("data-mt-flow", "");
    readTheme();
    setInterval(() => document.hidden || readTheme(), 500);
    requestAnimationFrame(frame);
  }
  start();
})();

// Pyaar: glass light behind the top bar and the center.
// A slow wave rolls over a sheet of black glass covering the whole center and
// top bar, with a few broad panels tilting on their own rhythm. One grazing
// light drifts slowly, so long, smooth bands of light come and go, with a
// white sheen, a thin-film sheen in the artwork's own colors in proportion
// (window.__mtRainbow) and very fine, faint lines. Everywhere else stays black.
// With "Follow the tempo" on in Pyaar Settings (off by default), only its
// speed follows the song: the whole pattern moves faster or slower with the
// song's tempo (window.PyaarSync.tempo). Nothing else in it reacts to the music.
// "Center light" in the Pyaar menu turns it off (pure black center).
(function silkLight() {
  const VERT = `
    attribute vec2 pos;
    void main() { gl_Position = vec4(pos, 0.0, 1.0); }`;

  // Anything that is the same for the whole screen (the panels' drift and
  // tilt, the light's direction) is worked out once per frame in JS below,
  // not once per pixel. The surface returns its slope along with its height,
  // so each pixel evaluates it once instead of three times.
  const FRAG = `
    precision highp float;
    uniform vec2 res;
    uniform vec4 skip;     // covered by the library's solid panel: nothing to draw
    uniform float t;
    uniform float energy;
    uniform float crease;  // the creases' slow sway
    uniform vec3 H;        // halfway between the light and the viewer
    uniform vec4 pan[6];   // each panel: center xy, tilt, size
    uniform vec2 pdir[6];  // each panel's tilt direction
    uniform vec3 rc[12];   // the artwork's colors, in proportion
    uniform vec3 lc[12];   // the like wash's colors
    uniform vec4 wave;     // the wash spreading from the heart: center, radius, soft edge (px)
    uniform float lv;      // the wash's strength, 0..1
    float lk;              // how much of the wash this pixel shows

    // A smooth loop through the artwork's colors, in proportion
    vec3 film(float x) {
      x = fract(x) * 12.0;
      float f = smoothstep(0.0, 1.0, fract(x));
      if (x < 1.0) return mix(mix(rc[0], lc[0], lk), mix(rc[1], lc[1], lk), f);
      if (x < 2.0) return mix(mix(rc[1], lc[1], lk), mix(rc[2], lc[2], lk), f);
      if (x < 3.0) return mix(mix(rc[2], lc[2], lk), mix(rc[3], lc[3], lk), f);
      if (x < 4.0) return mix(mix(rc[3], lc[3], lk), mix(rc[4], lc[4], lk), f);
      if (x < 5.0) return mix(mix(rc[4], lc[4], lk), mix(rc[5], lc[5], lk), f);
      if (x < 6.0) return mix(mix(rc[5], lc[5], lk), mix(rc[6], lc[6], lk), f);
      if (x < 7.0) return mix(mix(rc[6], lc[6], lk), mix(rc[7], lc[7], lk), f);
      if (x < 8.0) return mix(mix(rc[7], lc[7], lk), mix(rc[8], lc[8], lk), f);
      if (x < 9.0) return mix(mix(rc[8], lc[8], lk), mix(rc[9], lc[9], lk), f);
      if (x < 10.0) return mix(mix(rc[9], lc[9], lk), mix(rc[10], lc[10], lk), f);
      if (x < 11.0) return mix(mix(rc[10], lc[10], lk), mix(rc[11], lc[11], lk), f);
      return mix(mix(rc[11], lc[11], lk), mix(rc[0], lc[0], lk), f);
    }

    // The surface's height (x) and slope (yz): overlapping panels of black
    // glass, each a soft bowl tilting on its own rhythm, a broad slow
    // undulation so light can land anywhere, plus soft creases and a
    // travelling ripple
    vec3 surface(vec2 p) {
      vec3 z = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        vec2 d = p - pan[i].xy;
        float tilt = pan[i].z, size = pan[i].w;
        float dd = dot(d, d);
        float w = exp(-1.4 * dd / (size * size));
        float g = tilt * dot(d, pdir[i]) + 0.45 * dd / size;
        z += w * vec3(g, tilt * pdir[i] + (0.9 / size - 2.8 * g / (size * size)) * d);
      }
      float a = p.x * 2.3 + t * 0.38, b = p.y * 1.9 - t * 0.31;
      float sa = sin(a), cb = cos(b);
      z += 0.32 * vec3(sa * cb, 2.3 * cos(a) * cb, -1.9 * sa * sin(b));
      float c = p.x * 1.1 - p.y * 2.7 + t * 0.27 + 1.3;
      z += 0.18 * vec3(sin(c), cos(c) * vec2(1.1, -2.7));
      float k = dot(p, vec2(5.2, 3.1)) + crease;
      z += 0.028 * vec3(sin(k), cos(k) * vec2(5.2, 3.1));
      vec2 q = p - vec2(0.15, 0.1);
      float len = max(length(q), 1e-4);
      float m = len * 6.0 - t * 0.9;
      z += 0.022 * vec3(sin(m), 6.0 * cos(m) * q / len);
      return z;
    }

    void main() {
      vec2 fc = gl_FragCoord.xy;
      if (fc.x < skip.z && fc.y > skip.y && fc.y < skip.w && fc.x > skip.x) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
      lk = lv * (1.0 - smoothstep(wave.z - wave.w, wave.z, distance(fc, wave.xy)));
      vec2 uv = fc / res;
      vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);

      // (read a hair up and right, where the old three-sample slope landed,
      // so the bands sit exactly where they always have)
      vec3 s = surface(p + 0.0015);
      // (and the height stepped back to this pixel, which keeps the fine
      // lines exactly in place)
      float h0 = s.x - 0.0015 * (s.y + s.z);
      vec3 n = normalize(vec3(-s.yz, 1.0));

      // One grazing light, slowly circling, so the lit places keep changing
      float nh = max(dot(n, H), 0.0);
      float nv = n.z;

      // Black glass: light only where the surface turns into the light
      // Wide, soft bands: light lands over a broad range of angles
      float land = pow(smoothstep(0.77, 1.0, nh), 1.2);
      float sheen = pow(nh, 200.0);
      // a soft glow around the bands, so the pattern's shape reads
      float near = pow(smoothstep(0.5, 1.0, nh), 2.0);

      // Thin-film color shifting with angle and position, with fine lines
      float thick = length(p * vec2(1.0, 1.3)) * 2.0 + h0 * 3.0;
      // Changes slowly across the screen: large areas take one color at a time
      vec3 irid = film(nv * 0.6 + thick * 0.12 + t * 0.04);
      float lines = 0.95 + 0.05 * sin(thick * 900.0);

      // Where light lands the artwork's color shows at its true brightness
      // (dimming a color on black shifts its hue, e.g. yellow turns olive)
      vec3 col = irid * (land * 1.0 + near * 0.24) * lines + vec3(1.0) * sheen * 0.25;
      col = min(col, vec3(1.0)) * (0.84 + 0.15 * (energy + 2.5 * lk));
      gl_FragColor = vec4(col, 1.0);
    }`;

  // The panels: center (drifting a little), tilt direction, size, and the
  // speed and phase of their tilt
  const PANELS = [
    { c: (dr) => [-0.25 + 0.06 * Math.sin(dr), 0.22], dir: [0.8, 0.6], size: 0.45, speed: 0.62, ph: 0.0 },
    { c: (dr) => [0.38, 0.28 + 0.05 * Math.cos(dr * 1.3)], dir: [-0.7, 0.7], size: 0.5, speed: 0.55, ph: 1.7 },
    { c: (dr) => [0.12 + 0.07 * Math.cos(dr), -0.18], dir: [0.2, -1.0], size: 0.55, speed: 0.7, ph: 3.1 },
    { c: () => [-0.05, 0.48], dir: [1.0, 0.1], size: 0.4, speed: 0.66, ph: 4.4 }, // through the top bar
    { c: (dr) => [0.6 + 0.04 * Math.sin(dr * 0.8), -0.32], dir: [-0.5, -0.9], size: 0.45, speed: 0.58, ph: 5.6 },
    { c: () => [-0.38, -0.3], dir: [0.9, -0.4], size: 0.4, speed: 0.74, ph: 2.5 },
  ];
  const pan = new Float32Array(24);
  const pdir = new Float32Array(PANELS.flatMap((P) => {
    const l = Math.hypot(P.dir[0], P.dir[1]);
    return [P.dir[0] / l, P.dir[1] / l];
  }));
  const H = new Float32Array(3);

  // Everything that is the same for every pixel this frame
  function frameUniforms(t) {
    const dr = t * 0.05;
    PANELS.forEach((P, i) => {
      const [cx, cy] = P.c(dr);
      pan[i * 4] = cx;
      pan[i * 4 + 1] = cy;
      pan[i * 4 + 2] = Math.sin(t * P.speed + P.ph) * 0.7 + Math.sin(t * P.speed * 0.53 + P.ph * 2.1) * 0.25;
      pan[i * 4 + 3] = P.size;
    });
    // One grazing light, slowly circling
    const la = t * 0.22;
    let lx = 0.6 * Math.cos(la), ly = 0.6 * Math.sin(la) + 0.15, lz = 0.26;
    let l = Math.hypot(lx, ly, lz);
    lx /= l; ly /= l; lz = lz / l + 1;
    l = Math.hypot(lx, ly, lz);
    H[0] = lx / l; H[1] = ly / l; H[2] = lz / l;
    return 0.8 * Math.sin(t * 0.35); // the creases' sway
  }

  const SCALE = 1;     // full resolution, so the fine lines stay crisp
  const BASE_SPEED = 1;   // this pattern's own pace (it moves faster than the slow wave did)
  const FPS = 30;      // the motion is slow, 30fps is plenty
  let canvas, gl, prog, loc = {};
  const colors = new Float32Array(36).map((_, i) => (i % 3 === 2 ? 0.65 : 0.6));
  const target = colors.slice();
  // The love burst's hot pink and violet (see loveBurst), mixed in while it plays
  const LOVE_R = new Float32Array([
    1, 0.25, 0.9, 1, 0.42, 0.95, 1, 0.14, 0.59, 1, 0.25, 0.9, 0.75, 0.3, 1, 0.59, 0.33, 1,
    1, 0.42, 0.95, 1, 0.25, 0.85, 1, 0.55, 0.96, 0.48, 0.36, 1, 1, 0.14, 0.59, 1, 0.25, 0.9,
  ]);
  let energy = 1;
  // The part of the screen under the library's solid panel, in CSS pixels
  let covered = null;
  // The main view's glass, in the container's CSS px (for Still's frost)
  let glass = null;
  // The container's place on screen, for the like wash's position
  let hostRect = null;

  function parseColor(str) {
    const m = str.match(/[\d.]+/g);
    return m && m.length >= 3 ? [m[0] / 255, m[1] / 255, m[2] / 255] : null;
  }

  function readTheme() {
    const cs = getComputedStyle(document.documentElement);
    // The 12 colors from glassLight (window.__mtRainbow, rgb 0..1)
    const rainbow = window.__mtRainbow;
    if (rainbow) for (let i = 0; i < 12; i++) if (rainbow[i]) target.set(rainbow[i], i * 3);
    const e = parseFloat(cs.getPropertyValue("--mt-energy"));
    if (Number.isFinite(e)) energy = e;

    // The library hides the light where its background is solid: below its
    // rounded top corners, and only while it is fully opaque
    covered = null;
    glass = null;
    const mv = document.getElementById("main-view");
    if (mv && host?.isConnected) {
      const a = mv.getBoundingClientRect(), b = host.getBoundingClientRect();
      hostRect = b;
      if (a.width > 0) glass = { x: Math.round(a.left - b.left), y: Math.round(a.top - b.top), w: Math.round(a.width), h: Math.round(a.height) };
    }
    const lib = document.getElementById("Desktop_LeftSidebar_Id");
    if (lib) {
      const ls = getComputedStyle(lib);
      const bg = ls.backgroundColor;
      const solid = !/rgba|\//.test(bg) && bg !== "transparent" && ls.opacity === "1";
      const r = lib.getBoundingClientRect();
      const corner = parseFloat(ls.borderTopLeftRadius) || 0;
      if (solid && r.width > 0) covered = { x0: r.left, x1: r.right, y0: r.top + corner + 1, y1: r.bottom };
    }
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }

  function setup() {
    canvas = document.createElement("canvas");
    canvas.id = "mt-silk";
    gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    for (const n of ["res", "skip", "t", "energy", "crease", "H", "pan", "pdir", "rc", "lc", "wave", "lv"]) loc[n] = gl.getUniformLocation(prog, n);
    gl.uniform2fv(loc.pdir, pdir);
    return true;
  }

  let last = 0, lastDraw = 0, beat = -1, drawn = "", clock = performance.now() / 1000, host = null, shown = true;
  function frame(now) {
    requestAnimationFrame(frame);
    // 30fps (FPS), on the shared beat with the library ribbon and glass
    // loops. Balanced: half resolution (15fps was tried and looked laggy).
    // Still: drawn once, then only when something changes (below).
    const b = window.__mtBeat(now);
    if (document.hidden || b === beat) return;
    beat = b;
    const mode = window.__mtMode();
    const still = mode === "still";
    const scale = mode === "balanced" ? 0.5 : SCALE;
    // Its own clock, so the song's tempo can speed it up and down smoothly
    // (held in Still)
    if (!still) clock += Math.min(0.1, (now - lastDraw) / 1000) * BASE_SPEED * (window.PyaarSync?.tempo ?? 1);
    lastDraw = now;
    // Turned off in the Pyaar menu: the center stays pure black
    const on = window.PyaarSettings?.get("centerLight") !== false;
    if (on !== shown) canvas.style.display = (shown = on) ? "" : "none";
    if (!on) { window.__mtFrost?.clear("silk"); return; }
    if (!host?.isConnected) host = document.querySelector(".Root__top-container");
    if (!host) return;
    if (canvas.parentElement !== host) host.prepend(canvas);
    // (the container's size from the shared observer, not read every frame)
    const size = window.__mtSize(host);
    const w = Math.max(2, Math.round(size.w * scale));
    const h = Math.max(2, Math.round(size.h * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    const k = Math.min(1, (now - last) / 1200);
    last = now;
    let moving = 0;
    for (let i = 0; i < 36; i++) {
      moving = Math.max(moving, Math.abs(target[i] - colors[i]));
      colors[i] += (target[i] - colors[i]) * k;
    }
    // Still: the canvas keeps its last frame; redraw only while the colors
    // cross-fade, or when the size, brightness, the library's edge or the
    // love burst changes
    const love = window.__mtLove || 0;
    const edge = covered ? [covered.x0, covered.y0, covered.x1, covered.y1].map(Math.round).join(",") : "";
    const gl8 = glass ? `${glass.x},${glass.y},${glass.w},${glass.h}` : "";
    const sig = `${w}x${h}|${energy.toFixed(3)}|${edge}|${gl8}|${mode}`;
    if (still && sig === drawn && moving < 0.002 && !love) return;
    drawn = sig;
    const crease = frameUniforms(clock);
    gl.uniform2f(loc.res, w, h);
    // (in the shader's pixels, counted from the bottom)
    if (covered) gl.uniform4f(loc.skip, covered.x0 * scale, h - covered.y1 * scale, covered.x1 * scale, h - covered.y0 * scale);
    else gl.uniform4f(loc.skip, 0, 0, 0, 0);
    gl.uniform1f(loc.t, clock);
    // The love burst (window.__mtLove) turns the light hot pink and violet
    gl.uniform1f(loc.energy, energy);
    gl.uniform1f(loc.crease, crease);
    gl.uniform3fv(loc.H, H);
    gl.uniform4fv(loc.pan, pan);
    // The song's colors, and the like wash's where it has spread to
    gl.uniform3fv(loc.rc, colors);
    gl.uniform3fv(loc.lc, LOVE_R);
    gl.uniform1f(loc.lv, love);
    gl.uniform4fv(loc.wave, window.__mtWaveFor(hostRect, scale, h));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Still: the main view's glass gets its frost from this frame
    if (still && glass) window.__mtFrost?.draw("silk", canvas, scale, glass);
    else window.__mtFrost?.clear("silk");
  }

  function start() {
    if (!document.body) return setTimeout(start, 300);
    try {
      if (!setup()) return;
    } catch (err) {
      console.warn("Pyaar silk shader failed:", err);
      return;
    }
    document.documentElement.setAttribute("data-mt-silk", "");
    readTheme();
    setInterval(() => document.hidden || readTheme(), 500);
    requestAnimationFrame(frame);
  }
  start();
})();

// Pyaar: the glass heart like button.
// Marks the now-playing "Add to Liked Songs" button as .mt-like and puts a
// thick glass heart in it (.mt-gh, styled in user.css). Its edges bend the
// banner's light behind it: a backdrop refraction filter (#mt-heart-lens)
// pushes each edge pixel outward along the glass's slope, so the rim shows
// the light around the heart squeezed and bent, like a rounded slab of glass.
// On hover it glides and catches a glare; a pass that has started finishes
// after the pointer leaves. Liked, it turns saturated pink glass.
(function heartLike() {
  // A chubby heart in a 32 x 30 box, drawn at 75% inside a 34 x 32 frame
  const HEART = "M16 28.5C6 21.5 1.5 15.8 1.5 9.8 1.5 5.2 5 1.8 9.2 1.8c2.9 0 5.4 1.6 6.8 4 1.4-2.4 3.9-4 6.8-4 4.2 0 7.7 3.4 7.7 8 0 6-4.5 11.7-14.5 18.7z";
  const PLACE = "translate(5 4.75) scale(0.75)";
  const NS = "http://www.w3.org/2000/svg";

  // The refraction map: red/green hold how far each pixel looks sideways.
  // A soft "pillow" height field of the heart; its slope is steepest at the
  // rim, so the flat middle stays clear and the edges bend strongly.
  function lensMap() {
    const S = 4, W = 34 * S, H = 32 * S;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d", { willReadFrequently: true });
    const shape = new Path2D(HEART);
    const draw = (blur) => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.filter = "none";
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      g.filter = blur ? `blur(${blur}px)` : "none";
      g.setTransform(S * 0.75, 0, 0, S * 0.75, 5 * S, 4.75 * S);
      g.fillStyle = "#fff";
      g.fill(shape);
      return g.getImageData(0, 0, W, H).data;
    };
    const inside = draw(0), h = draw(3.5 * S);
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    let max = 1e-6;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (inside[i * 4] < 128) continue;
        gx[i] = (h[(i + 1) * 4] - h[(i - 1) * 4]) / 2;
        gy[i] = (h[(i + W) * 4] - h[(i - W) * 4]) / 2;
        max = Math.max(max, Math.hypot(gx[i], gy[i]));
      }
    }
    const out = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      // outward: against the slope, toward the light beyond the edge; eased
      // so the middle stays clear and the bend gathers at the rim
      const m = Math.hypot(gx[i], gy[i]) / max;
      const k = m > 0 ? m ** 0.6 / m / max : 0;
      out.data[i * 4] = 128 - 127 * gx[i] * k;
      out.data[i * 4 + 1] = 128 - 127 * gy[i] * k;
      out.data[i * 4 + 2] = 128;
      out.data[i * 4 + 3] = 255;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.putImageData(out, 0, 0);
    return c.toDataURL();
  }

  function addLensFilter() {
    if (document.getElementById("mt-heart-lens")) return;
    const holder = document.createElementNS(NS, "svg");
    holder.setAttribute("width", "0");
    holder.setAttribute("height", "0");
    holder.setAttribute("aria-hidden", "true");
    holder.style.position = "absolute";
    holder.innerHTML = `
      <filter id="mt-heart-lens" x="0" y="0" width="34" height="32" filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage href="${lensMap()}" x="0" y="0" width="34" height="32" preserveAspectRatio="none" result="raw"/>
        <feGaussianBlur in="raw" stdDeviation="0.7" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="8" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
    document.body.append(holder);
  }

  // The drawn layers over the glass, in the song's colors
  let uid = 0;
  function buildHeart() {
    const n = "mt-gh" + uid++;
    const wrap = document.createElement("span");
    wrap.className = "mt-gh";
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML = `
      <span class="mt-gh-lens"></span>
      <svg class="mt-gh-art" viewBox="0 0 34 32" xmlns="${NS}">
        <defs>
          <path id="${n}-s" transform="${PLACE}" d="${HEART}"/>
          <clipPath id="${n}-c"><use href="#${n}-s"/></clipPath>
          <radialGradient id="${n}-fill" cx="0.42" cy="0.38" r="0.72">
            <stop offset="0" style="stop-color: var(--gh-f0); stop-opacity: 0.35"/>
            <stop offset="0.5" style="stop-color: var(--gh-f1); stop-opacity: 0.75"/>
            <stop offset="1" style="stop-color: var(--gh-f2); stop-opacity: 1"/>
          </radialGradient>
          <linearGradient id="${n}-depth" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0.35" stop-color="#000" stop-opacity="0"/>
            <stop offset="1" stop-color="#000" stop-opacity="0.75"/>
          </linearGradient>
          <linearGradient id="${n}-band" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style="stop-color: var(--gh-b0)"/>
            <stop offset="0.5" style="stop-color: var(--gh-b1)"/>
            <stop offset="1" style="stop-color: var(--gh-b2)"/>
          </linearGradient>
          <linearGradient id="${n}-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="1"/>
            <stop offset="0.4" stop-color="#fff" stop-opacity="0.4"/>
            <stop offset="0.7" stop-color="#fff" stop-opacity="0.3"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0.9"/>
          </linearGradient>
          <linearGradient id="${n}-glare" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0"/>
            <stop offset="0.5" stop-color="#fff" stop-opacity="0.9"/>
            <stop offset="1" stop-color="#fff" stop-opacity="0"/>
          </linearGradient>
          <filter id="${n}-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.55"/>
          </filter>
        </defs>
        <g clip-path="url(#${n}-c)">
          <use class="mt-gh-fill" href="#${n}-s" fill="url(#${n}-fill)"/>
          <use class="mt-gh-depth" href="#${n}-s" fill="url(#${n}-depth)"/>
          <use class="mt-gh-band" href="#${n}-s" fill="none" stroke="url(#${n}-band)" stroke-width="5.4" filter="url(#${n}-soft)"/>
          <g class="mt-gh-spec"><g filter="url(#${n}-soft)">
            <ellipse cx="11" cy="9.6" rx="3.3" ry="1.6" transform="rotate(-38 11 9.6)" fill="#fff"/>
            <circle cx="23.4" cy="8.8" r="0.9" fill="#fff"/>
            <path d="M19.5 23.2 Q24.8 19.6 26.6 14.2" fill="none" stroke="#fff" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/>
          </g></g>
          <g class="mt-gh-glare">
            <rect x="10" y="-8" width="14" height="48" fill="url(#${n}-glare)" transform="rotate(22 17 16)"/>
          </g>
        </g>
        <use class="mt-gh-rim" href="#${n}-s" fill="none" stroke="url(#${n}-rim)" stroke-width="1.15"/>
      </svg>`;
    return wrap;
  }

  function markLikeButton() {
    const widget = document.querySelector('[data-testid="now-playing-widget"]');
    if (!widget) return;
    for (const b of widget.querySelectorAll("button[aria-checked]")) {
      const label = b.getAttribute("aria-label") || "";
      const isLike = /liked songs|add to playlist/i.test(label) && !/^hide/i.test(label);
      b.classList.toggle("mt-like", isLike);
      const heart = b.querySelector(":scope > .mt-gh");
      if (isLike && !heart) {
        addLensFilter();
        b.append(buildHeart());
      } else if (!isLike && heart) heart.remove();
    }
  }

  // Liking makes Spotify rewrite the button's class (dropping .mt-like) and
  // swap in its green check. Re-mark it the moment that happens: observer
  // callbacks run before the next paint, so the green icon never shows and
  // the heart fills in at the same instant Spotify's state flips.
  const observer = new MutationObserver(markLikeButton);
  let watched = null;
  function watch() {
    const widget = document.querySelector('[data-testid="now-playing-widget"]');
    if (widget && widget !== watched) {
      observer.disconnect();
      observer.observe(widget, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-label", "aria-checked"] });
      watched = widget;
    }
    markLikeButton();
  }
  setInterval(() => document.hidden || watch(), 700);

  // The same heart, filled with the song's colors, for Pyaar Settings (its
  // account menu row and window header)
  window.PyaarGlassHeart = (filled, silver) => {
    addLensFilter();
    const heart = buildHeart();
    if (filled) heart.classList.add("mt-gh-filled");
    if (silver) heart.classList.add("mt-gh-silver");
    return heart;
  };

  // Hovering the heart's button (the like button, the Pyaar button in the top
  // bar, or the settings window's header) plays the glide; once the pointer
  // has left, the current pass finishes before it stops, so the heart never
  // jumps back
  const HOSTS = ".mt-like, [data-mt-lights], .mt-settings-head";
  document.addEventListener("pointerover", (e) => {
    e.target.closest?.(HOSTS)?.querySelector(".mt-gh")?.classList.add("mt-gh-play");
  });
  document.addEventListener("animationiteration", (e) => {
    if (e.animationName !== "mt-gh-glide") return;
    const heart = e.target;
    if (!heart.closest(HOSTS)?.matches(":hover")) heart.classList.remove("mt-gh-play");
  });
})();

// Pyaar: the library dissolves into its light when you leave Spotify alone.
// After 7 s with no mouse, wheel or key input anywhere in Spotify, a pane
// of thick glass slowly comes forward over the library: it frosts the text
// and gently bends it at its rim (as the glass heart bends the banner, and
// like the reference slab), the text melts away under it, and then the
// glass recedes, leaving only the library light and its music. Any input
// brings the text back the same way, quicker. It's a crossfade: only
// opacity and a slight scale move (the GPU eases them on its own, so it
// stays smooth however busy the page is), and the stages overlap into one
// continuous motion, so it never holds or snaps. Switched in the lights menu ("Clear library when idle").
// Only the transitions cost anything; while cleared, the list isn't drawn.
(function libraryVeil() {
  const IDLE_MS = 7000;
  const NS = "http://www.w3.org/2000/svg";
  const RIM = 60;     // how far in from the panel's edge the glass bends the view
  const BEND = 26;    // displacement (gentle: the text softens and shifts, never warps)
  let last = performance.now(), veiled = false, timers = [], mapKey = "";

  const on = () => window.PyaarSettings?.get("libraryVeil") !== false;
  const host = () => document.getElementById("Desktop_LeftSidebar_Id");
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const stop = () => { timers.forEach(clearTimeout); timers = []; };

  // The glass's displacement map: the panel's shape blurred into a soft
  // height field, its slope pointing inward, so near the rim the view is
  // pulled in and bent like the thick edge of a slab (inward, so it never
  // reaches past the panel). Drawn at a quarter size; the filter scales it.
  function slabMap(w, h, radius) {
    const S = 0.25, W = Math.max(8, Math.round(w * S)), H = Math.max(8, Math.round(h * S));
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const draw = (blur) => {
      ctx.filter = "none";
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      ctx.filter = blur ? `blur(${blur}px)` : "none";
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, radius * S);
      ctx.fill();
      return ctx.getImageData(0, 0, W, H).data;
    };
    const inside = draw(0), hf = draw(RIM * S * 0.5);
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    let max = 1e-6;
    for (let yy = 1; yy < H - 1; yy++) {
      for (let xx = 1; xx < W - 1; xx++) {
        const i = yy * W + xx;
        if (inside[i * 4] < 128) continue;
        gx[i] = (hf[(i + 1) * 4] - hf[(i - 1) * 4]) / 2;
        gy[i] = (hf[(i + W) * 4] - hf[(i - W) * 4]) / 2;
        max = Math.max(max, Math.hypot(gx[i], gy[i]));
      }
    }
    const out = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const m = Math.hypot(gx[i], gy[i]) / max;
      const k = m > 0 ? m ** 0.6 / m / max : 0;
      out.data[i * 4] = 128 + 127 * gx[i] * k;
      out.data[i * 4 + 1] = 128 + 127 * gy[i] * k;
      out.data[i * 4 + 2] = 128;
      out.data[i * 4 + 3] = 255;
    }
    ctx.filter = "none";
    ctx.putImageData(out, 0, 0);
    return c.toDataURL();
  }

  function lensFor(w, h) {
    const key = `${w}x${h}`;
    if (key === mapKey && document.getElementById("mt-veil-lens")) return;
    mapKey = key;
    let holder = document.getElementById("mt-veil-svg");
    if (!holder) {
      holder = document.createElementNS(NS, "svg");
      holder.id = "mt-veil-svg";
      holder.setAttribute("width", "0");
      holder.setAttribute("height", "0");
      holder.setAttribute("aria-hidden", "true");
      holder.style.position = "absolute";
      document.body.append(holder);
    }
    holder.innerHTML = `
      <filter id="mt-veil-lens" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse"
              primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage href="${slabMap(w, h, 20)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="raw"/>
        <feGaussianBlur in="raw" stdDeviation="2" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="${BEND}" xChannelSelector="R" yChannelSelector="G"/>
      </filter>`;
  }

  function slab(lib) {
    if (!lib.querySelector(":scope > .mt-veil")) {
      const pane = document.createElement("div");
      pane.className = "mt-veil";
      pane.setAttribute("aria-hidden", "true");
      lib.append(pane);
    }
    lensFor(lib.clientWidth, lib.clientHeight);
  }

  // The stages are classes on the panel (user.css times each one):
  // mt-veil-on (glass present), -glass (come forward), -gone (text melted),
  // -recede (glass leaving, slowly), -rest (hidden), -back (quicker timings)
  function hide() {
    const lib = host();
    if (!lib || veiled) return;
    slab(lib);
    stop();
    veiled = true;
    lib.classList.remove("mt-veil-back", "mt-veil-recede", "mt-veil-rest");
    lib.classList.add("mt-veil-on");
    // One continuous breath, about 4.5 s: the glass comes forward (2.2 s),
    // the text melts away under it from 0.6 s (1.8 s), and from 1.8 s,
    // before it has fully arrived, the glass is already receding into the
    // light (2.6 s), so it never stops and holds
    requestAnimationFrame(() => requestAnimationFrame(() => lib.classList.add("mt-veil-glass")));
    later(600, () => lib.classList.add("mt-veil-gone"));
    later(1800, () => { lib.classList.add("mt-veil-recede"); lib.classList.remove("mt-veil-glass"); });
    later(4600, () => lib.classList.add("mt-veil-rest"));
  }

  // Returning, the same breath, quicker (about 1.6 s): the glass comes
  // forward, the text forms under it, and the glass recedes leaving it sharp
  function reveal() {
    const lib = host();
    veiled = false;
    stop();
    if (!lib) return;
    lib.classList.remove("mt-veil-rest", "mt-veil-recede");
    lib.classList.add("mt-veil-on", "mt-veil-back");
    requestAnimationFrame(() => lib.classList.add("mt-veil-glass"));
    later(200, () => lib.classList.remove("mt-veil-gone"));
    later(600, () => { lib.classList.add("mt-veil-recede"); lib.classList.remove("mt-veil-glass"); });
    later(1800, () => lib.classList.remove("mt-veil-on", "mt-veil-back", "mt-veil-recede"));
  }

  // Not while something needs the library or the pointer: a menu, a dialog,
  // the Pyaar windows, typing, or a press in progress. (Spotify keeps some
  // dialogs in the page while hidden, so only ones on screen count.)
  let pressed = false;
  const OPEN = "[role='menu'], [role='dialog'], .mt-settings-backdrop, .mt-pop-layer, [data-testid='context-menu']";
  function busy() {
    const a = document.activeElement;
    return pressed
      || (a && (a.matches?.("input, textarea, [contenteditable='true']")))
      || [...document.querySelectorAll(OPEN)].some((e) => e.getClientRects().length > 0);
  }

  const input = () => {
    last = performance.now();
    if (veiled) reveal();
  };
  for (const type of ["pointermove", "pointerdown", "wheel", "keydown", "touchstart"]) {
    document.addEventListener(type, input, { capture: true, passive: true });
  }
  document.addEventListener("pointerdown", () => { pressed = true; }, true);
  document.addEventListener("pointerup", () => { pressed = false; }, true);
  document.addEventListener("pointercancel", () => { pressed = false; }, true);

  setInterval(() => {
    if (document.hidden) return;
    if (!on()) { if (veiled) reveal(); return; }
    if (!veiled && performance.now() - last > IDLE_MS && !busy()) hide();
  }, 500);
})();

// Pyaar: the love burst. Liking a song sets off a glossy, minimal moment in
// monochrome purple (3D, smooth, high gloss, soft glow):
//   charge  the like button's glass heart swells and charges up, lilac
//           sparks rush in
//   launch  a white-lilac comet flies from it to the middle of the screen
//   bloom   a white-hot flash with a lens streak and soft violet rays; a big
//           clear glass heart pops in as a smooth violet spreads over the
//           whole window
//   glass   glossy lilac bars glide through the heart on a diagonal and the
//           glass refracts them into soft steps; it beats twice, then grows
//           a little and fades as the purple clears
// While it plays, the whole theme turns hot pink and violet, then cools back
// to the song's colors: window.__mtLove (0..1) is read by both shaders, and
// html[data-mt-love] swaps the color variables in user.css. These colors are
// fixed on purpose for this moment.
// Drawn on two canvases over the window: the light (sky, rays, bloom flash)
// with a screen blend, so it only adds light; the solid parts (the comet, the
// purple, the bars and the glass heart) in front. The sky and rays stay in
// the center; the charge, the comet, the purple, the bars and the heart reach
// over the whole window.
(function loveBurst() {
  const END = 3.3;               // overlay done (s)
  const LOVE_IN = 0.45;          // theme turns hot over this
  const LOVE_OUT = [2.5, 4.0];   // and cools back to the song's colors here
  // The purple spreads from START, covers the whole window by FULL and
  // clears from CLEAR; the glass heart (SIZE × R) leaves from LEAVE
  const WAVE = { start: 0.95, full: 1.8, clear: 2.75 };
  const GLASS = { size: 1.3, leave: 2.75 };
  const SCALE = 0.75;

  const HOT = [255, 64, 228], PINK = [255, 140, 246], DEEP = [255, 36, 150];
  const PALE = [255, 218, 251], WHITE = [255, 255, 255];
  // Glossy monochrome purple: violet through
  // lilac to near white. FOIL is the cycle of tones the sparks, comet and
  // rays take; GOLD is now a pale lilac highlight.
  const GOLD = [236, 214, 255], WHITE_HOT = [250, 246, 255];
  const FOIL = [[150, 96, 250], [184, 136, 255], [214, 182, 255], [236, 220, 255], [196, 150, 255], [166, 112, 252]];
  const foil = (x) => {
    x = (((x % 1) + 1) % 1) * FOIL.length;
    const i = Math.floor(x), f = x - i;
    return mix(FOIL[i], FOIL[(i + 1) % FOIL.length], f * f * (3 - 2 * f));
  };

  const rgb = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a))})`;
  const mix = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const ramp = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
  const hump = (a, b, t) => (t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)));
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeIn = (x) => Math.pow(clamp01(x), 3);
  const easeOutBack = (x) => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
  const rand = (a, b) => a + Math.random() * (b - a);

  // A smooth heart, about 2 units wide, centered on its middle
  const HEART = new Path2D();
  for (let i = 0; i <= 72; i++) {
    const t = (Math.PI * 2 * i) / 72;
    const x = (16 * Math.sin(t) ** 3) / 16;
    const y = (-(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - 2.5) / 16;
    i ? HEART.lineTo(x, y) : HEART.moveTo(x, y);
  }
  HEART.closePath();

  // A four-pointed sparkle with a soft glow in the given tint
  function sparkle(x, y, size, a, tint = PINK) {
    if (a <= 0 || size <= 0) return;
    const w = size * 0.18;
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 1.1);
    g.addColorStop(0, rgb(tint, 0.55 * a));
    g.addColorStop(1, rgb(tint, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - size * 1.1, y - size * 1.1, size * 2.2, size * 2.2);
    ctx.fillStyle = rgb(WHITE, a);
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + w * 0.3, y - w * 0.3, x + size, y);
    ctx.quadraticCurveTo(x + w * 0.3, y + w * 0.3, x, y + size);
    ctx.quadraticCurveTo(x - w * 0.3, y + w * 0.3, x - size, y);
    ctx.quadraticCurveTo(x - w * 0.3, y - w * 0.3, x, y - size);
    ctx.fill();
  }

  let canvas, back, front, ctx, anim = null, start = 0, held = null;
  let W, H, b, c, clip, R, diag, far, sparks, rays, bars;

  function layout() {
    const s = SCALE;
    W = Math.round(innerWidth * s);
    H = Math.round(innerHeight * s);
    for (const cv of canvas) { cv.width = W; cv.height = H; }
    const btn = document.querySelector(".mt-like")?.getBoundingClientRect();
    const lib = document.getElementById("Desktop_LeftSidebar_Id")?.getBoundingClientRect();
    const bar = document.querySelector(".main-nowPlayingBar-container")?.getBoundingClientRect();
    const mv = document.getElementById("main-view")?.getBoundingClientRect();
    const left = lib ? lib.right : 0;
    const bottom = bar ? bar.top : innerHeight;
    clip = { x: left * s, y: 0, w: (innerWidth - left) * s, h: bottom * s };
    c = mv ? { x: (mv.left + mv.width / 2) * s, y: (mv.top + mv.height * 0.45) * s }
           : { x: clip.x + clip.w / 2, y: clip.h / 2 };
    b = btn ? { x: (btn.left + btn.width / 2) * s, y: (btn.top + btn.height / 2) * s }
            : { x: c.x, y: H - 50 * s };
    R = Math.min(clip.w, clip.h) * 0.15;   // the big heart's size
    diag = Math.hypot(clip.w, clip.h);
    // from the middle to the farthest corner of the window
    far = Math.max(Math.hypot(c.x, c.y), Math.hypot(W - c.x, c.y), Math.hypot(c.x, H - c.y), Math.hypot(W - c.x, H - c.y));
  }

  function scatter() {
    const s = SCALE;
    // Sparks rushing into the small heart while it charges
    sparks = Array.from({ length: 18 }, (_, i) => ({
      ang: rand(0, Math.PI * 2), r0: rand(45, 130) * s, t0: rand(0, 0.38), dur: rand(0.22, 0.34), size: rand(3, 7) * s, hue: i / 18,
    }));
    // Soft prismatic rays from the middle
    rays = Array.from({ length: 28 }, (_, i) => ({
      a0: (i / 28) * Math.PI * 2 + rand(-0.08, 0.08), w: rand(0.012, 0.04), len: rand(0.55, 1), ph: rand(0, 6), hue: rand(0, 1),
    }));
    // The glossy bars gliding through the glass heart: lanes across it (in
    // heart sizes), a beat apart, and two strays further out
    const lanes = [-1.25, -0.9, -0.55, -0.2, 0.15, 0.5, 0.85, 1.2, -2.3, 2.1];
    bars = lanes.map((lane, i) => ({
      lane: lane + rand(-0.05, 0.05), t0: 1.0 + i * 0.065 + rand(0, 0.04), dur: rand(1.5, 1.7),
      len: rand(2.0, 3.2), w: rand(0.85, 1.15),
    }));
  }

  // The theme's colors: hot while it plays, then back to the song's
  function setLove(t) {
    const v = ramp(0, LOVE_IN, t) * (1 - ramp(LOVE_OUT[0], LOVE_OUT[1], t));
    window.__mtLove = v;
    return v;
  }

  // 1. The small heart charging up (outside the center, over the banner)
  function drawCharge(t) {
    const s = SCALE;
    if (t > 1.3) return;
    const aura = ramp(0, 0.5, t) * (1 - ramp(0.85, 1.3, t));
    const r = 34 * s * (1 + 0.18 * Math.sin(t * 34) * (t < 0.7 ? 1 : 0.3)) * (1 + 0.6 * ramp(0.6, 0.75, t));
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    g.addColorStop(0, rgb(PALE, 0.9 * aura));
    g.addColorStop(0.35, rgb(HOT, 0.7 * aura));
    g.addColorStop(1, rgb(DEEP, 0));
    ctx.fillStyle = g;
    ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);

    // Rings closing in, twice
    for (const [a, z] of [[0, 0.34], [0.3, 0.64]]) {
      const k = (t - a) / (z - a);
      if (k < 0 || k > 1) continue;
      ctx.strokeStyle = rgb(a ? PINK : GOLD, 0.85 * Math.sin(Math.PI * k));
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.arc(b.x, b.y, (70 - 60 * easeIn(k)) * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The release: a white shockwave
    const k = (t - 0.66) / 0.4;
    if (k > 0 && k < 1) {
      ctx.strokeStyle = rgb(WHITE, 0.9 * (1 - k));
      ctx.lineWidth = 3 * s * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(b.x, b.y, (12 + 90 * easeOut(k)) * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Sparks rushing in
    ctx.lineCap = "round";
    for (const p of sparks) {
      const q = (t - p.t0) / p.dur;
      if (q < 0 || q > 1) continue;
      const rr = p.r0 * (1 - easeIn(q));
      const x = b.x + Math.cos(p.ang) * rr, y = b.y + Math.sin(p.ang) * rr;
      const tail = rr + 26 * s;
      ctx.strokeStyle = rgb(foil(p.hue), 0.6 * q);
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(b.x + Math.cos(p.ang) * tail, b.y + Math.sin(p.ang) * tail);
      ctx.lineTo(x, y);
      ctx.stroke();
      sparkle(x, y, p.size, clamp01(q * 3), foil(p.hue));
    }
  }

  // 2. The comet from the small heart to the middle
  function cometAt(p) {
    const cx = b.x + (c.x - b.x) * 0.1, cy = c.y + (b.y - c.y) * 0.25;
    const u = 1 - p;
    return { x: u * u * b.x + 2 * u * p * cx + p * p * c.x, y: u * u * b.y + 2 * u * p * cy + p * p * c.y };
  }

  function drawComet(t) {
    const s = SCALE;
    const p = (t - 0.66) / 0.26;
    if (p < 0 || p > 1.15) return;
    const head = clamp01(p);
    const fade = 1 - clamp01((p - 1) / 0.15);
    ctx.lineCap = "round";
    for (let i = 0; i < 16; i++) {
      const p0 = easeIn(head) - (i + 1) * 0.022, p1 = easeIn(head) - i * 0.022;
      if (p1 <= 0) break;
      const a = cometAt(Math.max(0, p0)), z = cometAt(p1);
      ctx.strokeStyle = rgb(i < 2 ? WHITE_HOT : i < 6 ? GOLD : foil(i / 16), fade * (1 - i / 16));
      ctx.lineWidth = (7 - i * 0.38) * s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(z.x, z.y);
      ctx.stroke();
    }
    const h = cometAt(easeIn(head));
    const r = 22 * s;
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, r);
    g.addColorStop(0, rgb(WHITE_HOT, fade));
    g.addColorStop(0.35, rgb(GOLD, 0.75 * fade));
    g.addColorStop(1, rgb(HOT, 0));
    ctx.fillStyle = g;
    ctx.fillRect(h.x - r, h.y - r, r * 2, r * 2);
  }

  // 3. The sky: a deep violet wash over the center, lit from the middle
  function drawSky(t) {
    const a = ramp(0.05, 0.6, t) * (1 - ramp(2.4, 3.6, t));
    if (a <= 0) return;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, diag * 0.6);
    g.addColorStop(0, rgb([140, 90, 255], 0.55 * a));
    g.addColorStop(0.5, rgb([92, 50, 210], 0.6 * a));
    g.addColorStop(1, rgb([44, 20, 112], 0.7 * a));
    ctx.fillStyle = g;
    ctx.fillRect(clip.x, clip.y, clip.w, clip.h);
  }

  // 4. The bloom flash: white-hot light opening in the middle as the comet
  //    lands, with a long, thin lens streak
  function drawBloom(t) {
    const a = ramp(0.84, 0.95, t) * (1 - ramp(0.98, 1.75, t));
    if (a <= 0) return;
    const r = R * 3.4;
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
    g.addColorStop(0, rgb(WHITE_HOT, a));
    g.addColorStop(0.18, rgb([226, 206, 255], 0.75 * a));
    g.addColorStop(0.45, rgb([150, 100, 255], 0.3 * a));
    g.addColorStop(1, rgb([150, 100, 255], 0));
    ctx.fillStyle = g;
    ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(7, 0.1);
    const s = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    s.addColorStop(0, rgb(WHITE_HOT, 0.9 * a));
    s.addColorStop(0.4, rgb(foil(0.92), 0.4 * a));
    s.addColorStop(1, rgb(foil(0.92), 0));
    ctx.fillStyle = s;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  }

  // 5. Soft prismatic rays turning slowly around the middle
  function drawRays(t) {
    const e = ramp(0.88, 1.08, t) * (1 - ramp(1.7, 2.3, t));
    if (e <= 0) return;
    const rot = 0.16 * t;
    for (const ry of rays) {
      const ang = ry.a0 + rot, L = diag * ry.len;
      const flick = 0.75 + 0.25 * Math.sin(t * 6 + ry.ph);
      const tone = foil(ry.hue + t * 0.12);
      for (const [wide, alpha] of [[3.2, 0.1], [1, 0.32]]) {
        const w = ry.w * wide;
        const g = ctx.createRadialGradient(c.x, c.y, R * 0.3, c.x, c.y, L);
        g.addColorStop(0, rgb(mix(tone, WHITE, 0.5), e * alpha * flick));
        g.addColorStop(0.35, rgb(tone, e * alpha * 0.7 * flick));
        g.addColorStop(1, rgb(tone, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + Math.cos(ang - w) * L, c.y + Math.sin(ang - w) * L);
        ctx.lineTo(c.x + Math.cos(ang + w) * L, c.y + Math.sin(ang + w) * L);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // 6. The glass heart: a big heart of clear glass, like the like button's,
  //    in a glossy, minimal purple world (3D, smooth, high gloss). Glossy
  //    lilac bars glide through on a diagonal, and the glass refracts them:
  //    inside the heart they are shifted and magnified, and the thick edge
  //    shifts them the other way, so each bar breaks into soft steps as it
  //    passes.
  //    The glass itself is nearly clear: a soft rim, a bevel, a side wall,
  //    gloss and a soft shadow. Its shading is baked once per burst into
  //    sprites; the refraction is composited live.
  const SPRITE = 520;                 // the heart's width in the sprites (px)
  const SLANT = Math.PI / 4;          // the bars run down to the right
  let heartUnder = null, heartFace = null, heartGlow = null, barsCanvas = null, barsCtx = null;

  function bakeHeart() {
    const k = SPRITE / 2;             // HEART is 2 units wide
    const size = Math.round(SPRITE * 1.7);
    const make = () => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const g = cv.getContext("2d");
      g.translate(size / 2, size / 2);
      return [cv, g];
    };
    const fillHeart = (g, style, s = 1, dx = 0, dy = 0) => {
      g.save();
      g.translate(dx * k, dy * k);
      g.scale(k * s, k * s);
      g.fillStyle = style;
      g.fill(HEART);
      g.restore();
    };
    const strokeHeart = (g, style, width, s = 1) => {
      g.save();
      g.scale(k * s, k * s);
      g.strokeStyle = style;
      g.lineWidth = width / (k * s);
      g.lineJoin = "round";
      g.stroke(HEART);
      g.restore();
    };
    const diagonal = (g, stops) => {
      const d = g.createLinearGradient(-k, -k, k, k);
      for (const [at, color] of stops) d.addColorStop(at, color);
      return d;
    };

    // Under the face: a soft shadow on the backdrop, and the glass's side
    // wall showing below and to the right (its thickness)
    const [under, ug] = make();
    ug.filter = `blur(${Math.round(k * 0.09)}px)`;
    fillHeart(ug, "rgba(36, 12, 104, 0.4)", 1, 0.08, 0.13);
    ug.filter = "none";
    fillHeart(ug, diagonal(ug, [[0, "rgba(150, 110, 255, 0.5)"], [1, "rgba(84, 44, 196, 0.62)"]]), 1, 0.035, 0.06);

    // The face: almost clear, milkier toward the edge, with a bevel lit from
    // the upper left and shaded toward the lower right, a fine rim and gloss
    const [face, fg] = make();
    const body = fg.createRadialGradient(-0.1 * k, -0.08 * k, 0, 0, 0, 1.05 * k);
    body.addColorStop(0, "rgba(238, 228, 255, 0.05)");
    body.addColorStop(0.7, "rgba(232, 218, 255, 0.1)");
    body.addColorStop(1, "rgba(232, 218, 255, 0.26)");
    fillHeart(fg, body);
    fg.globalCompositeOperation = "source-atop";
    fg.filter = `blur(${Math.round(k * 0.035)}px)`;
    strokeHeart(fg, diagonal(fg, [[0, "rgba(255, 255, 255, 0.7)"], [0.5, "rgba(255, 255, 255, 0.12)"], [1, "rgba(255, 255, 255, 0.3)"]]), k * 0.15);
    strokeHeart(fg, diagonal(fg, [[0, "rgba(60, 24, 150, 0)"], [0.55, "rgba(60, 24, 150, 0)"], [1, "rgba(60, 24, 150, 0.35)"]]), k * 0.09, 0.93);
    // gloss: a broad soft sheen and a crisp glint on the left lobe, a
    // catch-light along the right lobe
    fg.fillStyle = "rgba(255, 255, 255, 0.5)";
    fg.beginPath();
    fg.ellipse(-0.45 * k, -0.43 * k, 0.27 * k, 0.12 * k, -0.62, 0, Math.PI * 2);
    fg.fill();
    fg.filter = `blur(${Math.max(1, Math.round(k * 0.008))}px)`;
    fg.fillStyle = "rgba(255, 255, 255, 0.95)";
    fg.beginPath();
    fg.ellipse(-0.52 * k, -0.5 * k, 0.085 * k, 0.035 * k, -0.62, 0, Math.PI * 2);
    fg.fill();
    fg.strokeStyle = "rgba(255, 255, 255, 0.6)";
    fg.lineWidth = k * 0.025;
    fg.lineCap = "round";
    fg.beginPath();
    fg.arc(0.42 * k, -0.36 * k, 0.3 * k, -Math.PI * 0.35, Math.PI * 0.05);
    fg.stroke();
    fg.globalCompositeOperation = "source-over";
    fg.filter = "none";
    strokeHeart(fg, diagonal(fg, [[0, "rgba(255, 255, 255, 0.95)"], [0.5, "rgba(255, 255, 255, 0.4)"], [1, "rgba(255, 255, 255, 0.6)"]]), k * 0.012);

    // The glow as it pops in
    const [glow, gg] = make();
    gg.filter = `blur(${Math.round(k * 0.16)}px)`;
    fillHeart(gg, "rgba(180, 140, 255, 0.9)", 1.05);

    heartUnder = under;
    heartFace = face;
    heartGlow = glow;
  }

  // The heart's size (half its width, px), visibility and glow at time t:
  // it pops in as the comet lands, beats twice while the bars glide through,
  // then grows a little and fades
  function heartAt(t) {
    if (t < 0.88 || t > END) return null;
    const pop = easeOutBack((t - 0.88) / 0.32);
    const beat = 0.05 * hump(1.3, 1.44, t) + 0.065 * hump(1.5, 1.66, t);
    const leave = ramp(GLASS.leave, END, t);
    const float = 1 + 0.012 * Math.sin(t * 2.4);
    return {
      size: R * GLASS.size * pop * (1 + beat) * float * (1 + 0.35 * leave),
      a: clamp01((t - 0.88) / 0.08) * (1 - leave),
      glow: 0.6 * (1 - ramp(1.0, 1.7, t)) + 3 * beat,
    };
  }

  // A glossy lilac bar: a rounded tube, lit along its upper edge
  function bar(g, x0, y0, x1, y1, w, a) {
    const nx = -Math.sin(SLANT), ny = Math.cos(SLANT);
    g.lineCap = "round";
    // its shade underneath, offset down-left
    g.strokeStyle = rgb([70, 34, 176], 0.45 * a);
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0 + nx * w * 0.22, y0 + ny * w * 0.22);
    g.lineTo(x1 + nx * w * 0.22, y1 + ny * w * 0.22);
    g.stroke();
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const s = g.createLinearGradient(mx - nx * w / 2, my - ny * w / 2, mx + nx * w / 2, my + ny * w / 2);
    s.addColorStop(0, rgb([246, 232, 255], 0.95 * a));
    s.addColorStop(0.3, rgb([214, 170, 255], 0.95 * a));
    s.addColorStop(0.75, rgb([176, 120, 250], 0.95 * a));
    s.addColorStop(1, rgb([142, 92, 236], 0.95 * a));
    g.strokeStyle = s;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }

  // The bars: they glide in from the upper left, ease through the heart,
  // and glide out to the lower right, a beat apart
  function drawBars(g, t, size) {
    g.clearRect(0, 0, W, H);
    const dx = Math.cos(SLANT), dy = Math.sin(SLANT);
    const nx = -dy, ny = dx;
    const w = size * 0.16;
    for (const b2 of bars) {
      const q = (t - b2.t0) / b2.dur;
      if (q <= 0 || q >= 1) continue;
      // in (fast, settling), drift, out (gathering speed)
      const run = q < 0.35 ? -far * 1.3 * (1 - easeOut(q / 0.35))
                : q < 0.68 ? (q - 0.35) * size * 0.6
                : (0.33 * size * 0.6) + far * 1.3 * easeIn((q - 0.68) / 0.32);
      const ox = c.x + nx * b2.lane * size + dx * run, oy = c.y + ny * b2.lane * size + dy * run;
      const L = b2.len * size;
      bar(g, ox - dx * L / 2, oy - dy * L / 2, ox + dx * L / 2, oy + dy * L / 2, w * b2.w, 1);
    }
  }

  function drawGlassHeart(t) {
    const h = heartAt(t);
    if (!h || h.a <= 0 || !heartFace) return;
    const size = h.size;
    const scale = size / (SPRITE / 2);
    const sw = heartFace.width * scale;
    drawBars(barsCtx, t, R * GLASS.size);

    ctx.save();
    ctx.globalAlpha = h.a;
    // the glow as it pops in and beats
    if (h.glow > 0.01) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = h.a * h.glow;
      ctx.drawImage(heartGlow, c.x - sw / 2, c.y - sw / 2, sw, sw);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = h.a;
    }
    // the bars on the backdrop, then the glass's shadow and side wall
    ctx.drawImage(barsCanvas, 0, 0);
    ctx.drawImage(heartUnder, c.x - sw / 2, c.y - sw / 2, sw, sw);

    // Refraction: inside the face, the bars shifted across their run and
    // magnified; in the thick edge, shifted the other way and magnified more
    const nx = -Math.sin(SLANT), ny = Math.cos(SLANT);
    const outer = new DOMMatrix().translate(c.x, c.y).scale(size, size);
    const inner = new DOMMatrix().translate(c.x, c.y).scale(size * 0.84, size * 0.84);
    const innerP = new Path2D();
    innerP.addPath(HEART, inner);
    const edgeP = new Path2D();
    edgeP.addPath(HEART, outer);
    edgeP.addPath(HEART, inner);
    for (const [path, rule, shift, mag] of [[innerP, "nonzero", 0.2, 1.08], [edgeP, "evenodd", -0.3, 1.18]]) {
      ctx.save();
      ctx.clip(path, rule);
      ctx.clearRect(0, 0, W, H);
      drawHaze(t);
      ctx.translate(c.x + nx * shift * size, c.y + ny * shift * size);
      ctx.scale(mag, mag);
      ctx.translate(-c.x, -c.y);
      ctx.drawImage(barsCanvas, 0, 0);
      ctx.restore();
    }
    // the face: nearly clear glass, bevel, rim and gloss
    ctx.drawImage(heartFace, c.x - sw / 2, c.y - sw / 2, sw, sw);
    ctx.restore();
  }

  // 7. The purple the heart sits in: a smooth, glossy violet spreading from
  //    the middle across the whole window as the heart pops in, lighter
  //    behind the heart, then clearing
  function drawHaze(t) {
    if (t < WAVE.start || t > END) return;
    const out = 1 - ramp(WAVE.clear, END, t);
    const reach = R * 1.2 + (far * 1.1 - R * 1.2) * ramp(WAVE.start, WAVE.full, t);
    const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, reach);
    g.addColorStop(0, rgb([170, 128, 255], 0.72 * out));
    g.addColorStop(0.5, rgb([128, 82, 248], 0.7 * out));
    g.addColorStop(0.88, rgb([98, 56, 222], 0.66 * out));
    g.addColorStop(1, rgb([98, 56, 222], 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function frame(now) {
    const t = held ?? (now - start) / 1000;
    setLove(t);
    back.clearRect(0, 0, W, H);
    front.clearRect(0, 0, W, H);
    if (t > END) {
      for (const cv of canvas) cv.style.display = "none";
      if (t > LOVE_OUT[1]) { window.__mtLove = 0; anim = null; return; }
      anim = requestAnimationFrame(frame);
      return;
    }
    if (t > LOVE_OUT[0] && document.documentElement.hasAttribute("data-mt-love")) {
      document.documentElement.removeAttribute("data-mt-love");
      document.documentElement.setAttribute("data-mt-love-out", "");
      setTimeout(() => !window.__mtLove && document.documentElement.removeAttribute("data-mt-love-out"), 3000);
    }
    for (const cx of [back, front]) {
      cx.save();
      cx.beginPath();
      cx.rect(clip.x, clip.y, clip.w, clip.h);
      cx.clip();
    }
    ctx = back;
    drawSky(t);
    drawRays(t);
    drawBloom(t);
    ctx = front;
    back.restore();
    front.restore();
    ctx = back;     // light only, so the small heart stays visible through it
    drawCharge(t);
    ctx = front;
    drawComet(t);
    // these reach over the whole window
    drawHaze(t);
    drawGlassHeart(t);
    anim = requestAnimationFrame(frame);
  }

  function play() {
    if (!canvas) {
      canvas = ["mt-love", "mt-love-front"].map((id) => {
        const cv = document.createElement("canvas");
        cv.id = id;
        return cv;
      });
      back = canvas[0].getContext("2d");
      front = canvas[1].getContext("2d");
    }
    for (const cv of canvas) {
      if (cv.parentElement !== document.body) document.body.append(cv);
      cv.style.display = "";
    }
    layout();
    scatter();
    if (!heartFace) bakeHeart();
    if (!barsCanvas) barsCtx = (barsCanvas = document.createElement("canvas")).getContext("2d");
    barsCanvas.width = W;
    barsCanvas.height = H;
    const root = document.documentElement;
    root.removeAttribute("data-mt-love-out");
    root.setAttribute("data-mt-love", "");
    // The small glass heart: swells, glows hot pink and charges (user.css).
    // The class goes on the theme's own .mt-gh, because liking makes Spotify
    // rewrite the button's classes.
    const heart = document.querySelector(".mt-like > .mt-gh");
    if (heart) {
      heart.classList.remove("mt-gh-love");
      void heart.offsetWidth;
      heart.classList.add("mt-gh-love");
      clearTimeout(play.timer);
      play.timer = setTimeout(() => heart.classList.remove("mt-gh-love"), 2400);
    }
    start = performance.now();
    if (!anim) anim = requestAnimationFrame(frame);
  }
  // Liking a song plays only the burst's color moment (the user's choice,
  // 2026-10-16): the whole theme washes into its hot pink and violet and
  // cools back to the song's colors, with none of the drawings (no heart
  // swell, comet, sky, bars or glass heart). Same timing as the full burst:
  // in over LOVE_IN, held, then back over LOVE_OUT.
  // It spreads from the liked heart: a wave with a soft edge (FEATHER px)
  // grows over SPREAD seconds until it covers the window. Both lights take
  // the wash's colors where the wave has reached (window.__mtLoveWave), and
  // each area of the theme (the banner, the top bar, the library, the main
  // view) turns as the wave arrives at it (data-mt-love on that area). Then
  // it all cools back together, as before.
  const SPREAD = 1.6, FEATHER = 280;
  const AREAS = ['[data-testid="now-playing-bar"]', "#global-nav-bar", "#Desktop_LeftSidebar_Id", "#main-view", "#Desktop_PanelContainer_Id"];
  let wash = 0;
  function playColors() {
    const root = document.documentElement;
    root.removeAttribute("data-mt-love-out");
    const heart = document.querySelector(".mt-like")?.getBoundingClientRect();
    const x = heart ? heart.left + heart.width / 2 : 120, y = heart ? heart.top + heart.height / 2 : innerHeight - 50;
    const far = Math.max(Math.hypot(x, y), Math.hypot(innerWidth - x, y), Math.hypot(x, innerHeight - y), Math.hypot(innerWidth - x, innerHeight - y)) + FEATHER;
    // each area turns when the wave's middle reaches its nearest point
    const areas = AREAS.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
      return { el, at: Math.hypot(dx, dy) + FEATHER / 2 };
    }).filter(Boolean);
    const t0 = performance.now();
    cancelAnimationFrame(wash);
    const step = (now) => {
      const t = (now - t0) / 1000;
      setLove(t);
      const k = Math.min(1, t / SPREAD);
      // eased out gently, so it visibly grows from the heart before it slows
      const r = far * (1 - (1 - k) ** 2);
      window.__mtLoveWave = { x, y, r, feather: FEATHER };
      if (t < LOVE_OUT[0]) {
        for (const a of areas) if (r >= a.at && !a.on) { a.el.setAttribute("data-mt-love", ""); a.on = true; }
      } else if (!root.hasAttribute("data-mt-love-out")) {
        // cooling back: everything fades to the song's colors together
        root.setAttribute("data-mt-love-out", "");
        for (const a of areas) a.el.removeAttribute("data-mt-love");
      }
      if (t > LOVE_OUT[1]) {
        window.__mtLove = 0;
        window.__mtLoveWave = null;
        wash = 0;
        // the theme's colors finish fading back (2.2 s from LOVE_OUT[0])
        setTimeout(() => !window.__mtLove && root.removeAttribute("data-mt-love-out"), 1000);
        return;
      }
      wash = requestAnimationFrame(step);
    };
    wash = requestAnimationFrame(step);
  }

  // For checking it: PyaarLove.hold(1.2) freezes the burst at 1.2 s,
  // PyaarLove.hold(null) lets it run on; PyaarLove.colors() plays the wash
  window.PyaarLove = {
    play,
    colors: playColors,
    hold(t) { if (t != null && !anim) play(); held = t; if (t == null) start = performance.now(); },
  };

  // What liking a song plays: the full burst is off (PyaarLove.play() still
  // works); its color wash is on
  const PLAY_ON_LIKE = false;
  const COLORS_ON_LIKE = true;

  // Capture phase: read the button's state before Spotify flips it, so it
  // only plays when liking (not when removing a like)
  document.addEventListener("click", (e) => {
    const button = e.target.closest?.(".mt-like");
    if (!button || button.getAttribute("aria-checked") !== "false") return;
    if (PLAY_ON_LIKE) play();
    else if (COLORS_ON_LIKE) playColors();
  }, true);
})();
