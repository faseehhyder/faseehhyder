// Draws this profile's art as SVG from the portfolio's own code and files,
// not from screenshots, each in GitHub's light and dark:
//
// - the banner: the hero's words and type (src/app/page.tsx, globals.css),
//   its halftone globe and the products circling it
//   (src/components/hero-art), their logos and the portrait;
// - the buttons under it, in the site's .btn style with its icons;
// - the product cards, as the home page draws its work.
//
// Chrome only measures the text, so every line sits where the site puts
// it; the Geist font is embedded, cut down to the letters used.
//
//   node make-art.mjs
//
// Needs the portfolio next to this folder (../Portfolio, with node_modules),
// Google Chrome, and fontTools' pyftsubset.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const SITE = fileURLToPath(new URL("../Portfolio/", import.meta.url));
const sharp = createRequire(join(SITE, "package.json"))("sharp");
const TMP = mkdtempSync(join(tmpdir(), "banner-"));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FONT = join(SITE, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2");

// The site's two themes (src/app/globals.css). `lightInk` is the hero art's
// pal.light: light ink on a dark page, where its dots grow toward the light.
const THEMES = {
  light: {
    bg: "#fafaf9", card: "#ffffff", ink: "#131312", muted: "#6b6a65", soft: "#8f8e88",
    line: "#e5e4df", line2: "#d3d2cc", frame: "#ffffff", shadow: "19,19,18", lightInk: false,
  },
  dark: {
    bg: "#0f0f0e", card: "#1d1d1c", ink: "#f2f1ed", muted: "#9b9a94", soft: "#6c6b66",
    line: "#2a2a28", line2: "#3b3b38", frame: "#2a2a28", shadow: "0,0,0", lightInk: true,
  },
};

// The banner: the hero's text on the left, its art on the right. The text
// runs a little larger than on the site, because GitHub shows the banner
// at about 70% of its size.
const W = 1240, H = 580, RAD = 20;
const COL = 600, TX = 64; // the text column
const S = 540, AX = W - 40 - S; // the art's square
const AY = H / 2 - 0.475 * S; // the globe's centre on the banner's middle
const SEC = Number(process.env.SEC ?? 2.2); // the moment of the art's turn
const LABEL = 16; // the moons' names, in px

// The hero's products (src/lib/hero.ts), in its order round the ring. On
// the site the moons move, so one is always behind the globe and a name
// that doesn't fit waits its turn. The banner holds still, so each moon
// has its own place on the ring (degrees, as ringAt takes them), clear of
// the globe, and all five are named.
const PRODUCTS = [
  { name: "Renew Reminder", logo: "public/logos/renew-reminder.webp", at: 95 },
  { name: "SeedSense", logo: "public/logos/seedsense.webp", at: 155 },
  { name: "AutoCart", logo: "public/projects/autocart/icon.webp", at: 220 },
  { name: "Timeliner", logo: "public/logos/timeliner.webp", at: 320 },
  { name: "myValerio", logo: "public/logos/myvalerio.webp", at: 35 },
];

const BUTTONS = [
  { file: "site", label: "faseehhyder.com", icon: "globe", primary: true },
  { file: "work", label: "Case studies", icon: "stack" },
  { file: "cv", label: "CV", icon: "doc" },
  { file: "linkedin", label: "LinkedIn", icon: "linkedin" },
];

// ------------------------------------------------------------ helpers --

const D = Math.PI / 180, TAU = Math.PI * 2, U = 1 / 480;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const n1 = (v) => +v.toFixed(1), n2 = (v) => +v.toFixed(2);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (file) => readFileSync(file).toString("base64");
const fontFace = (data) =>
  `@font-face{font-family:G;src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:100 900}`;

/** Geist, cut down to the letters in `text`. */
function subset(text) {
  const out = join(TMP, `${Math.random().toString(36).slice(2)}.woff2`);
  execFileSync("pyftsubset", [FONT, `--text=${text}`, "--flavor=woff2", "--layout-features=*", `--output-file=${out}`]);
  return b64(out);
}

/** Runs fn with a headless Chrome tab, to lay out and measure text. */
async function withChrome(fn) {
  const port = 9335;
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${join(TMP, "chrome")}`,
    "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  try {
    let target;
    for (let i = 0; i < 60 && !target; i++) {
      await wait(250);
      try {
        target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
      } catch {}
    }
    if (!target) throw new Error("Chrome didn't start");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, fail) => {
      ws.addEventListener("open", ok, { once: true });
      ws.addEventListener("error", fail, { once: true });
    });
    let seq = 0;
    const pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    });
    const send = (method, params = {}) =>
      new Promise((res) => {
        const id = ++seq;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
      return r.result.result.value;
    };
    const result = await fn({ send, evaluate });
    ws.close();
    return result;
  } finally {
    chrome.kill();
  }
}

// --------------------------------------------------------------- text --

// The hero's copy as the site's page has it (src/app/page.tsx), with the
// styles of .intro-status, .statement and .intro-more. The headline keeps
// the four lines it shows on the site; data-role names each run's colour.
const PAGE = `<!doctype html><meta charset="utf-8"><style>
${fontFace(b64(FONT))}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:G;-webkit-font-smoothing:antialiased}
#root{width:${COL}px}
.status{display:inline-flex;align-items:center;padding:8px 16px;border:1px solid;border-radius:999px;font-size:16px;line-height:1.3}
h1{margin-top:38px;font-size:50px;font-weight:450;line-height:1.12;letter-spacing:-.035em}
.me,.nw{white-space:nowrap}
.photo{display:inline-block;width:1.12em;height:1.12em;margin:0 .04em;vertical-align:-.21em;border:max(2px,.055em) solid;border-radius:.27em}
.more{margin-top:28px;font-size:20px;line-height:1.6}
</style><div id="root"><p class="status" data-role="ink">Open to new roles</p><h1 data-role="ink">Hi, I’m <span class="me"><span class="photo"></span> <span data-role="ink">Faseeh Hyder</span></span>.<br><span data-role="soft">I’m a</span> <span class="nw" data-role="ink">product engineer</span><br><span class="nw" data-role="soft">and co-founder of</span><br><span class="nw" data-role="ink">Renew Reminder.</span></h1><p class="more" data-role="muted">I build mobile apps, web apps, backends and AI automations, plus the tracking and infrastructure that help them grow. I’ve also built <a data-role="ink">AutoCart</a>, a vehicle marketplace for Ireland and the UK, and worked on <a data-role="ink">SeedSense</a>, <span class="nw">crop-trial</span> software that works offline.</p></div>`;

// In the page: every run of text on one line in one style, where it starts
// and where its baseline is; and the boxes of the status pill and portrait.
const LAYOUT = `(async () => {
  await document.fonts.ready;
  const asc = {};
  const ascent = (cs) => {
    const k = cs.fontWeight + " " + cs.fontSize;
    if (!(k in asc)) {
      const c = document.createElement("canvas").getContext("2d");
      c.font = k + " G";
      asc[k] = c.measureText("Hg").fontBoundingBoxAscent;
    }
    return asc[k];
  };
  const runs = [];
  const tw = document.createTreeWalker(document.getElementById("root"), NodeFilter.SHOW_TEXT);
  for (let node; (node = tw.nextNode()); ) {
    const el = node.parentElement, cs = getComputedStyle(el);
    const style = {
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, ls: parseFloat(cs.letterSpacing) || 0,
      role: el.closest("[data-role]").dataset.role, link: !!el.closest("a"),
    };
    let run = null;
    const push = () => {
      if (run && (run.text = run.text.trimEnd())) runs.push(run);
      run = null;
    };
    for (let i = 0; i < node.data.length; i++) {
      const ch = node.data[i], r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + 1);
      const b = [...r.getClientRects()].find((q) => q.width > 0);
      if (!b) continue;
      if (run && Math.abs(b.top - run.top) < 2) {
        run.text += ch;
        if (ch.trim()) run.right = b.right;
        continue;
      }
      push();
      if (!ch.trim()) continue;
      run = { ...style, text: ch, left: b.left, right: b.right, top: b.top, base: b.top + ascent(cs) };
    }
    push();
  }
  const box = (sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  return { runs, status: box(".status"), photo: box(".photo"), height: document.getElementById("root").offsetHeight };
})()`;

// Widths of single lines, and the cap height, for the tags and buttons.
const MEASURE = (items) => `(async () => {
  await document.fonts.ready;
  const c = document.createElement("canvas").getContext("2d");
  return ${JSON.stringify(items)}.map(([t, size, weight, ls]) => {
    c.font = weight + " " + size + "px G";
    c.letterSpacing = ls + "px";
    return { w: c.measureText(t).width, cap: c.measureText("H").actualBoundingBoxAscent };
  });
})()`;

const page = join(TMP, "layout.html");
writeFileSync(page, PAGE);
const buttonType = [15, 500, -0.15]; // .btn: 15px, 500, -0.01em
const { layout, labels, buttons } = await withChrome(async ({ send, evaluate }) => {
  await send("Page.enable");
  await send("Page.navigate", { url: `file://${page}` });
  await wait(800);
  const layout = await evaluate(LAYOUT);
  const labels = await evaluate(MEASURE(PRODUCTS.map((p) => [p.name, LABEL, 500, 0])));
  const buttons = await evaluate(MEASURE(BUTTONS.map((b) => [b.label, ...buttonType])));
  return { layout, labels, buttons };
});

// ---------------------------------------------------------------- art --

// The globe's land, read from the site's own code, so the two stay one map.
const LAND = readFileSync(join(SITE, "src/components/hero-art/globe.ts"), "utf8").match(/const LAND =\s*"([^"]+)"/)[1];
const STEP = 3;

function globePoints() {
  const bits = Buffer.from(LAND, "base64");
  const cp = [], sp = [], lon = [], land = [];
  let i = 0;
  for (let lat = -90 + STEP / 2; lat < 90; lat += STEP) {
    const n = Math.max(1, Math.round((360 * Math.cos(lat * D)) / STEP));
    for (let k = 0; k < n; k++, i++) {
      cp.push(Math.cos(lat * D));
      sp.push(Math.sin(lat * D));
      lon.push((-180 + ((k + 0.5) * 360) / n) * D);
      land.push((bits[i >> 3] >> (i & 7)) & 1);
    }
  }
  return { n: cp.length, cp, sp, lon, land };
}

/** A logo as ink on a 72 x 72 grid: the site's loadLogo, with sharp for the canvas. */
async function loadLogo(file) {
  const SRC = 144, N = 72, B = SRC / N;
  const data = await sharp(file).resize(SRC, SRC).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer();
  const dark = new Float32Array(SRC * SRC);
  for (let i = 0; i < dark.length; i++) {
    dark[i] = 1 - (0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]) / 255;
  }
  const top = Math.max(0.2, Float32Array.from(dark).sort()[Math.floor(dark.length * 0.995)]);
  const g = new Float32Array(N * N);
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      let mx = 0, sum = 0;
      for (let j = 0; j < B; j++) {
        for (let i = 0; i < B; i++) {
          const v = Math.min(1, dark[(gy * B + j) * SRC + gx * B + i] / top);
          mx = Math.max(mx, v);
          sum += v;
        }
      }
      const v = (g[gy * N + gx] = 0.55 * mx + 0.45 * (sum / (B * B)));
      if (v > 0.16) {
        x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
      }
    }
  }
  return {
    box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1],
    at(u, v) {
      const ax = clamp(Math.floor(u), 0, N - 1), ay = clamp(Math.floor(v), 0, N - 1);
      const bx = Math.min(N - 1, ax + 1), by = Math.min(N - 1, ay + 1);
      const fx = clamp(u - ax, 0, 1), fy = clamp(v - ay, 0, 1);
      const a = g[ay * N + ax] * (1 - fx) + g[ay * N + bx] * fx;
      const b = g[by * N + ax] * (1 - fx) + g[by * N + bx] * fx;
      return a * (1 - fy) + b * fy;
    },
  };
}

/** Dots grouped by opacity, as the site's Dots class fills them. */
class Dots {
  bins = Array.from({ length: 16 }, () => []);
  add(x, y, r, a) {
    if (r < 0.2 || a < 0.02) return;
    this.bins[clamp(Math.ceil(a * 16) - 1, 0, 15)].push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${n2(r)}"/>`);
  }
  svg(ink) {
    return this.bins.map((b, k) => (b.length ? `<g fill="${ink}" opacity="${n2((k + 1) / 16)}">${b.join("")}</g>` : "")).join("");
  }
}

const cT = Math.cos(17 * D), sT = Math.sin(17 * D), cR = Math.cos(-15 * D), sR = Math.sin(-15 * D);
const ringAt = (a, rr) => {
  const x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr, y1 = z0 * sT;
  return [x0 * cR - y1 * sR, x0 * sR + y1 * cR, z0 * cT];
};

// The light at rest, with nobody pointing (src/components/hero-art/index.tsx).
const light = (sec) => {
  const lx = -0.58 + Math.sin(sec * 0.35) * 0.08, ly = -0.6 + Math.cos(sec * 0.29) * 0.06;
  const n = Math.hypot(lx, ly, 0.56);
  return [lx / n, ly / n, 0.56 / n];
};

const G = globePoints();
const named = new Set(); // the products with a name tag, for the log
const LOGOS = await Promise.all(PRODUCTS.map((p) => loadLogo(join(SITE, p.logo))));

/** The hero art at rest, in a square of side S: globeHome() of the site. */
function art(t) {
  const li = t.lightInk, L = light(SEC), sec = SEC, u = S * U;
  const toPx = (x, y) => [S * 0.5 + x * S, S * 0.45 + y * S];
  const disc = (x, y, r) => `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n2(r)}" fill="${t.bg}"/>`;
  const R = 0.25, gcy = 0.025, spc = R * STEP * D, ORBIT = 1.62, SIZE = 0.058, LOGO = 0.8;
  const [gx, gy] = toPx(0, gcy), Rp = R * S;
  const moons = PRODUCTS.map((p, k) => {
    const [X, Y, z] = ringAt(p.at * D, ORBIT);
    if (z < 0 && Math.hypot(X, Y) < 1.15) throw new Error(`${p.name} is behind the globe`);
    return { k, x: gx + X * Rp, y: gy + Y * Rp, z, mr: SIZE * S * (0.85 + 0.3 * ((z / ORBIT + 1) / 2)) };
  });

  const orbit = (front) => {
    const d = new Dots(), cut = [], n = Math.round(ORBIT * 52);
    for (let k = 0; k < n; k++) {
      const [X, Y, z] = ringAt((k / n) * TAU, ORBIT);
      if (z >= 0 !== front) continue;
      const inside = X * X + Y * Y;
      if (!front && inside < 1.06) continue;
      const x = gx + X * Rp, y = gy + Y * Rp, r = u * (0.7 + 0.4 * ((z / ORBIT + 1) / 2));
      d.add(x, y, r, front ? 0.32 : 0.22);
      if (front && inside < 1.1) cut.push(disc(x, y, r + 1.2 * u));
    }
    return cut.join("") + d.svg(t.ink);
  };

  const moon = (mo) => {
    const R0 = mo.mr, a = mo.z < 0 ? 0.88 : 1, logo = LOGOS[mo.k];
    const d = new Dots(), step = R0 / 16, [bx, by, bw, bh] = logo.box;
    const c = (2 * LOGO) / Math.max(bw, bh), hw = (bw * c) / 2, hh = (bh * c) / 2;
    const rowH = step * 0.866, rows = Math.ceil(R0 / rowH) + 1, cols = Math.ceil(R0 / step) + 1;
    for (let j = -rows; j <= rows; j++) {
      const y = mo.y + j * rowH, off = j & 1 ? step / 2 : 0;
      for (let i = -cols; i <= cols; i++) {
        const x = mo.x + i * step + off, dx = (x - mo.x) / R0, dy = (y - mo.y) / R0;
        const cover = Math.min(1, ((1 - Math.sqrt(dx * dx + dy * dy)) * R0) / step + 0.5);
        if (cover <= 0.05) continue;
        const nz = Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy));
        const lit = Math.max(0, dx * L[0] + dy * L[1] + nz * L[2]);
        const shade = Math.min(1, (li ? lit ** 1.45 : (1 - lit) ** 1.25) + (1 - nz) * (li ? 0.22 : 0.45));
        let amount = (li ? 0.05 : 0.08) + 0.22 * shade, alpha = (li ? 0.38 : 0.45) + 0.3 * shade;
        if (Math.abs(dx) <= hw && Math.abs(dy) <= hh) {
          const ink = logo.at(bx + bw / 2 + dx / c - 0.5, by + bh / 2 + dy / c - 0.5);
          if (ink > 0.14) {
            amount = (0.3 + 0.7 * ink ** 1.8) * (0.85 + 0.15 * nz);
            alpha = 0.6 + 0.4 * ink;
          }
        }
        d.add(x, y, step * (0.07 + 0.42 * amount) * cover ** 0.75, alpha * a);
      }
    }
    return disc(mo.x, mo.y, R0 + u * 2.5) + d.svg(t.ink);
  };

  // the globe's dots (globeHome().gen), facing Europe and Asia
  const lam0 = (24 + Math.sin(sec * 0.13) * 20 + L[0] * 6) * D, phi0 = 28 * D;
  const s0 = Math.sin(phi0), c0 = Math.cos(phi0), globe = new Dots();
  for (let i = 0; i < G.n; i++) {
    const dl = G.lon[i] - lam0, cdl = Math.cos(dl);
    const Z = s0 * G.sp[i] + c0 * G.cp[i] * cdl;
    if (Z <= 0.02) continue;
    const X = G.cp[i] * Math.sin(dl), Y = c0 * G.sp[i] - s0 * G.cp[i] * cdl;
    const lit = Math.max(0, X * L[0] - Y * L[1] + Z * L[2]);
    const shade = li ? lit ** 1.45 : (1 - lit) ** 1.25, limb = 0.45 + 0.55 * Math.sqrt(Z);
    let r, a;
    if (G.land[i]) {
      const amount = li ? 0.35 + 0.65 * shade : 0.5 + 0.5 * shade;
      r = spc * (0.12 + 0.34 * amount) * limb;
      a = li ? 0.55 + 0.4 * amount : 0.7 + 0.25 * amount;
    } else {
      r = spc * (0.07 + 0.08 * shade + (li ? 0 : 0.07 * (1 - Z))) * limb;
      a = li ? 0.22 : 0.3;
    }
    const [x, y] = toPx(X * R, gcy - Y * R);
    globe.add(x, y, r * S, a);
  }

  // the names: a tag under each moon, nearest first, or over it where a
  // nearer name or moon is in the way
  const tags = [], taken = [];
  const clash = (box, mo) =>
    taken.some((r) => r[0] < box[0] + box[2] && box[0] < r[0] + r[2] && r[1] < box[1] + box[3] && box[1] < r[1] + r[3]) ||
    moons.some((o) => o.k !== mo.k && o.z > mo.z &&
      Math.hypot(clamp(o.x, box[0], box[0] + box[2]) - o.x, clamp(o.y, box[1], box[1] + box[3]) - o.y) < o.mr);
  for (const mo of [...moons].sort((a, b) => b.z - a.z)) {
    const fs = LABEL, w = labels[mo.k].w + fs * 1.5, h = fs * 1.9, gap = mo.mr + 5 + h / 2;
    const lx = clamp(mo.x, 6 + w / 2, S - 6 - w / 2);
    const box = [mo.y + gap, mo.y - gap].map((ly) => [lx - w / 2, ly - h / 2, w, h]).find((b) => !clash(b, mo));
    if (!box) throw new Error(`no room for ${PRODUCTS[mo.k].name}'s name`);
    taken.push(box);
    named.add(PRODUCTS[mo.k].name);
    const [left, top] = box;
    tags.push(
      `<rect x="${n1(left)}" y="${n1(top)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(h / 2)}" fill="${t.card}" stroke="${t.line2}"/>` +
      `<text x="${n1(left + fs * 0.75)}" y="${n1(top + h / 2 + labels[mo.k].cap / 2)}" font-size="${fs}" font-weight="500" fill="${t.ink}">${esc(PRODUCTS[mo.k].name)}</text>`,
    );
  }

  return [
    orbit(false),
    ...moons.filter((m) => m.z < 0).map(moon),
    disc(gx, gy, Rp * 1.03),
    globe.svg(t.ink),
    orbit(true),
    ...moons.filter((m) => m.z >= 0).map(moon),
    ...tags,
  ].join("");
}

// ------------------------------------------------------------- banner --

// The portrait, as the site crops it (object-position 50% 22%).
const portrait = await (async () => {
  const src = join(SITE, "public/faseeh-portrait.webp");
  const { width, height } = await sharp(src).metadata();
  const side = Math.min(width, height);
  const top = Math.round((height - side) * 0.22), left = Math.round((width - side) / 2);
  return (await sharp(src).extract({ left, top, width: side, height: side }).resize(168, 168).jpeg({ quality: 84 }).toBuffer()).toString("base64");
})();

const TY = Math.round((H - layout.height) / 2);
const bannerFont = subset(layout.runs.map((r) => r.text).join("") + PRODUCTS.map((p) => p.name).join(""));

function banner(t) {
  const { status: s, photo: p } = layout;
  const em = 50, bw = Math.max(2, 0.055 * em), pr = 0.27 * em;
  const px = TX + p.x, py = TY + p.y;
  const text = layout.runs.map((r) => {
    const x = TX + r.left, y = TY + r.base;
    const ls = r.ls ? ` letter-spacing="${n2(r.ls)}"` : "";
    const line = r.link ? `<rect x="${n1(x)}" y="${n1(y + 4)}" width="${n1(r.right - r.left)}" height="1" fill="${t.line2}"/>` : "";
    return `${line}<text x="${n1(x)}" y="${n1(y)}" font-size="${r.size}" font-weight="${r.weight}"${ls} fill="${t[r.role]}">${esc(r.text)}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
<title id="title">Hi, I’m Faseeh Hyder. I’m a product engineer and co-founder of Renew Reminder.</title>
<defs><style>${fontFace(bannerFont)}text{font-family:G,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}</style>
<clipPath id="card"><rect width="${W}" height="${H}" rx="${RAD}"/></clipPath>
<clipPath id="photo"><rect x="${n1(px + bw)}" y="${n1(py + bw)}" width="${n1(p.w - 2 * bw)}" height="${n1(p.h - 2 * bw)}" rx="${n1(pr - bw)}"/></clipPath>
<filter id="soft" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2"/></filter>
<filter id="drop" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="9"/></filter>
</defs>
<g clip-path="url(#card)">
<rect width="${W}" height="${H}" fill="${t.bg}"/>
<rect x="${n1(TX + s.x + 0.5)}" y="${n1(TY + s.y + 0.5)}" width="${n1(s.w - 1)}" height="${n1(s.h - 1)}" rx="${n1((s.h - 1) / 2)}" fill="${t.card}" stroke="${t.line}"/>
<rect x="${n1(px + 6)}" y="${n1(py + 8 + 6)}" width="${n1(p.w - 12)}" height="${n1(p.h - 12)}" rx="${n1(pr)}" fill="rgba(${t.shadow},.18)" filter="url(#drop)"/>
<rect x="${n1(px)}" y="${n1(py + 2)}" width="${n1(p.w)}" height="${n1(p.h)}" rx="${n1(pr)}" fill="rgba(${t.shadow},.06)" filter="url(#soft)"/>
<rect x="${n1(px - 0.5)}" y="${n1(py - 0.5)}" width="${n1(p.w + 1)}" height="${n1(p.h + 1)}" rx="${n1(pr + 0.5)}" fill="none" stroke="rgba(${t.shadow},.1)"/>
<rect x="${n1(px)}" y="${n1(py)}" width="${n1(p.w)}" height="${n1(p.h)}" rx="${n1(pr)}" fill="${t.frame}"/>
<image xlink:href="data:image/jpeg;base64,${portrait}" x="${n1(px + bw)}" y="${n1(py + bw)}" width="${n1(p.w - 2 * bw)}" height="${n1(p.h - 2 * bw)}" clip-path="url(#photo)" preserveAspectRatio="xMidYMid slice"/>
${text.join("\n")}
<g transform="translate(${n1(AX)} ${n1(AY)})">${art(t)}</g>
</g>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${RAD - 0.5}" fill="none" stroke="${t.line}"/>
</svg>
`;
}

// -------------------------------------------------------------- cards --

// The products as the home page shows them (src/components/work-list.tsx,
// src/app/work-index.css): one card each, its photo behind (Unsplash, see
// design/covers/photos/README.md) shaded where the text sits, the role and
// period, the title and its line, the arrow, and the real app on its
// devices rising from the foot (public/projects/covers/<slug>-stack, light
// and dark). The README adds a line of facts from each case study.
const CARD_W = 1200, CARD_H = 560, CARD_R = 28, CARD_PAD = 48;
const CARD_TEXT = 200; // the text band; the devices take the rest
const CARDS = [
  {
    slug: "renew-reminder", title: "Renew Reminder", byline: "Co-founder · 2025 – now",
    line: "Keeping track of recurring payments.", pos: [0.5, 0.5],
    // short: the photo's phone starts where a longer line would end
    facts: [["110+", 1], [" sign-ups · "], ["App Store", 1], [", "], ["Google Play", 1], [" and web"]],
  },
  {
    slug: "autocart", title: "AutoCart", byline: "Engineer · 2026 – now",
    line: "A vehicle marketplace for Ireland and the UK.", pos: [0.5, 0.62],
    facts: [["React Native app", 1], [", "], ["backend", 1], [", "], ["admin", 1], [" and "], ["website", 1]],
  },
  {
    slug: "seedsense", title: "SeedSense", byline: "Main engineer · 2024 – now",
    line: "Crop-trial software that works offline.", pos: [0.5, 0.55],
    facts: [["856", 1], [" of 1,058 commits · "], ["2,100+", 1], [" tests · catalog load "], ["10.2 s", 1], [" to "], ["0.2 s", 1]],
  },
];
const RING = { light: "rgba(19,19,18,.07)", dark: "rgba(255,255,255,.07)" };

/** An image cut to w x h as object-fit: cover with object-position pos. */
async function coverCrop(file, w, h, [px, py]) {
  const { width, height } = await sharp(file).metadata();
  const k = Math.max(w / width, h / height), sw = Math.round(width * k), sh = Math.round(height * k);
  return (await sharp(file).resize(sw, sh)
    .extract({ left: Math.round((sw - w) * px), top: Math.round((sh - h) * py), width: w, height: h })
    .webp({ quality: 74 }).toBuffer()).toString("base64");
}

async function card(c, theme) {
  const scale = 4 / 3; // images at 1600 wide, sharp on a retina screen
  const photo = await coverCrop(join(SITE, `public/projects/covers/photos/${c.slug}.webp`),
    Math.round(CARD_W * scale), Math.round(CARD_H * scale), c.pos);
  const AH = Math.min((CARD_W * 920) / 2400, CARD_H - CARD_TEXT), AW = (AH * 2400) / 920;
  const art = (await sharp(join(SITE, `public/projects/covers/${c.slug}-stack${theme === "dark" ? "-dark" : ""}.webp`))
    .resize(Math.round(AW * scale)).webp({ quality: 80, alphaQuality: 90 }).toBuffer()).toString("base64");
  const font = subset(c.byline + c.title + c.line + c.facts.map(([t]) => t).join(""));
  const facts = c.facts
    .map(([t, strong]) => (strong ? `<tspan fill="#fff" font-weight="500">${esc(t)}</tspan>` : esc(t)))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" role="img" aria-labelledby="title">
<title id="title">${esc(`${c.title}: ${c.line} ${c.byline}.`)}</title>
<defs><style>${fontFace(font)}text{font-family:G,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}</style>
<clipPath id="card"><rect width="${CARD_W}" height="${CARD_H}" rx="${CARD_R}"/></clipPath>
<linearGradient id="across"><stop offset="0" stop-opacity=".62"/><stop offset=".36" stop-opacity=".3"/><stop offset=".6" stop-opacity="0"/></linearGradient>
<linearGradient id="down" x2="0" y2="1"><stop offset="0" stop-opacity=".42"/><stop offset=".42" stop-opacity="0"/></linearGradient>
</defs>
<g clip-path="url(#card)">
<rect width="${CARD_W}" height="${CARD_H}" fill="#141413"/>
<image xlink:href="data:image/webp;base64,${photo}" width="${CARD_W}" height="${CARD_H}"/>
<rect width="${CARD_W}" height="${CARD_H}" fill="url(#across)"/>
<rect width="${CARD_W}" height="${CARD_H}" fill="url(#down)"/>
<image xlink:href="data:image/webp;base64,${art}" x="${n1((CARD_W - AW) / 2)}" y="${n1(CARD_H - AH)}" width="${n1(AW)}" height="${n1(AH)}"/>
<text x="${CARD_PAD}" y="64" font-size="16" fill="rgba(255,255,255,.7)">${esc(c.byline)}</text>
<text x="${CARD_PAD}" y="122" font-size="50.4" font-weight="500" letter-spacing="-2.27" fill="#fff">${esc(c.title)}</text>
<text x="${CARD_PAD}" y="160" font-size="20" fill="rgba(255,255,255,.86)">${esc(c.line)}</text>
<text x="${CARD_PAD}" y="192" font-size="17" fill="rgba(255,255,255,.72)">${facts}</text>
<g transform="translate(${n1(CARD_W - 40.8 - 33)} 47) scale(${22 / 24})" fill="none" stroke="#fff" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></g>
<rect x=".5" y=".5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="${CARD_R - 0.5}" fill="none" stroke="${RING[theme]}"/>
</g>
</svg>
`;
}

// ------------------------------------------------------------ buttons --

// Icons on the site's grid (src/components/icons.tsx): 24 units, a 1.75
// stroke with round ends, drawn at the button's 15px.
const ICONS = {
  globe: () => `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>`,
  stack: () => `<rect x="3" y="8" width="14" height="13" rx="2.5"/><path d="M7 4.5h10.5A3 3 0 0 1 20.5 7.5V17"/>`,
  doc: () => `<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>`,
  linkedin: (fg, bg) =>
    `<rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="${fg}" stroke="none"/>` +
    `<g fill="${bg}" stroke="none"><circle cx="8" cy="7.9" r="1.45"/><rect x="6.75" y="10.2" width="2.5" height="7.6" rx=".4"/>` +
    `<path d="M11.2 10.2h2.35v1.05c.45-.75 1.35-1.3 2.55-1.3 2.15 0 2.9 1.35 2.9 3.4v4.45h-2.5v-3.95c0-1.05-.3-1.75-1.35-1.75s-1.45.75-1.45 1.75v3.95h-2.5z"/></g>`,
};

function button(b, m, t, font) {
  const h = 42, pad = 18, icon = 15, gap = 8, w = Math.ceil(pad + icon + gap + m.w + pad);
  const fg = b.primary ? t.bg : t.ink, fill = b.primary ? t.ink : t.card;
  const edge = b.primary ? "" : ` stroke="${t.line2}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(b.label)}">
<defs><style>${fontFace(font)}text{font-family:G,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="9.5" fill="${fill}"${edge}/>
<g transform="translate(${pad} ${(h - icon) / 2}) scale(${icon / 24})" fill="none" stroke="${fg}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[b.icon](fg, fill)}</g>
<text x="${pad + icon + gap}" y="${n1(h / 2 + m.cap / 2)}" font-size="${buttonType[0]}" font-weight="${buttonType[1]}" letter-spacing="${buttonType[2]}" fill="${fg}">${esc(b.label)}</text>
</svg>
`;
}

mkdirSync(join(HERE, "buttons"), { recursive: true });
const sizes = {};
BUTTONS.forEach((b, i) => {
  const font = subset(b.label);
  for (const [name, t] of Object.entries(THEMES)) {
    const svg = button(b, buttons[i], t, font);
    writeFileSync(join(HERE, "buttons", `${b.file}-${name}.svg`), svg);
    sizes[b.file] = svg.match(/width="(\d+)"/)[1];
  }
});
for (const [name, t] of Object.entries(THEMES)) writeFileSync(join(HERE, `hero-${name}.svg`), banner(t));
mkdirSync(join(HERE, "cards"), { recursive: true });
for (const c of CARDS) {
  for (const name of Object.keys(THEMES)) writeFileSync(join(HERE, "cards", `${c.slug}-${name}.svg`), await card(c, name));
}
console.log(JSON.stringify({ sec: SEC, named: [...named], buttons: sizes }));
