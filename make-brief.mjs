// Draws this profile's README art as SVG, in GitHub's light and dark.
//
// The README is a brief, not the portfolio: faseehhyder.com is the full,
// graphical story. Here a visitor gets one card they can read in a few
// seconds (who, what shipped and the proof, the stack, the reviews, the
// move) and one row of links. Each fact and each link appears once.
//
// Built from the portfolio's own files, not screenshots: the Geist font
// (embedded, cut down to the letters used), the ƒ mark
// (src/components/logo.tsx), the products' icons and the tools' logos.
// Chrome lays the card out as a browser would, and the script copies each
// line into the SVG where Chrome put it.
//
//   node make-brief.mjs
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
const TMP = mkdtempSync(join(tmpdir(), "brief-"));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FONT = join(SITE, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2");

// The site's colours (src/app/globals.css); `ok` is GitHub's own green for
// the availability dot, so it reads as GitHub's "available" in either theme.
const THEMES = {
  light: {
    bg: "#fafaf9", card: "#ffffff", ink: "#131312", text2: "#3c3c39", muted: "#6b6a65",
    soft: "#8f8e88", line: "#e5e4df", line2: "#d3d2cc", ok: "#1a7f37", ring: "rgba(19,19,18,.1)",
  },
  dark: {
    bg: "#0f0f0e", card: "#1d1d1c", ink: "#f2f1ed", text2: "#c8c7c1", muted: "#9b9a94",
    soft: "#6c6b66", line: "#2a2a28", line2: "#3b3b38", ok: "#3fb950", ring: "rgba(255,255,255,.1)",
  },
};
const W = 860; // the README's width on GitHub, so the card shows at its own size

// ------------------------------------------------------------- content --

const LEAD = ["Product engineer.", "I take apps from the first commit to the stores, and help them grow."];

// What each product is, the proof (strong runs are the numbers), and the
// role. Figures from the case studies (src/lib/case-studies.ts) and the CV.
const SHIPPED = [
  {
    name: "Renew Reminder", what: "Tracks recurring payments", icon: "public/logos/renew-reminder.webp",
    proof: [["110+", 1], [" sign-ups on the App Store, Google Play and the web"]],
    role: "Co-founder, product and engineering · 2025 – now",
  },
  {
    name: "SeedSense", what: "Crop-trial software, offline-first", icon: "public/logos/seedsense.webp",
    proof: [["856", 1], [" of 1,058 commits · "], ["2,100+", 1], [" tests · catalog "], ["10.2 s", 1], [" to "], ["0.2 s", 1]],
    role: "Main engineer at Onda Software Solutions · 2024 – now",
  },
  {
    // Unnamed, with a drawn mark for its icon: the client asked (2026-11-27)
    // not to be named in the portfolio.
    name: "Vehicle marketplace", what: "Buying and selling, for a client", icon: "drawn:car.webp",
    proof: [["React Native", 1], [" app, "], ["Node.js", 1], [" backend, admin and website"]],
    role: "Engineer · 2026 – now",
  },
];
// One line: the frameworks, the data, the cloud and the AI. TypeScript is
// taken as read with Next.js and Node.js.
const STACK = [
  ["Flutter", "flutter"], ["React Native", "react"], ["Next.js", "nextjs"], ["Node.js", "nodejs"],
  ["PostgreSQL", "postgresql"], ["AWS", "aws"], ["Claude", "claude"],
];
const CLIENTS = [["Top Rated", 1], [" on Upwork, "], ["100%", 1], [" Job Success · "], ["4.7", 1], [" from 14 reviews on Fiverr"]];
const MOVING = [["Germany and the EU", 1], [" first · needs visa sponsorship · from Pakistan (UTC+5)"]];

const LINKS = [
  { file: "site", label: "faseehhyder.com", icon: "globe", primary: true },
  { file: "work", label: "Case studies", icon: "stack" },
  { file: "cv", label: "CV", icon: "doc" },
  { file: "linkedin", label: "LinkedIn", icon: "linkedin" },
  { file: "email", label: "Email", icon: "mail" },
];

// ------------------------------------------------------------- helpers --

const n1 = (v) => +v.toFixed(1), n2 = (v) => +v.toFixed(2);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (file) => readFileSync(file).toString("base64");
const fontFace = (data) =>
  `@font-face{font-family:G;src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:100 900}`;
/** Runs of text as HTML, the strong ones (the numbers) in ink and weight. */
const strong = (runs) => runs.map(([t, s]) => (s ? `<b data-role="ink">${esc(t)}</b>` : esc(t))).join("");

/** Geist, cut down to the letters in `text`. */
function subset(text) {
  const out = join(TMP, `${Math.random().toString(36).slice(2)}.woff2`);
  execFileSync("pyftsubset", [FONT, `--text=${text}`, "--flavor=woff2", "--layout-features=*", `--output-file=${out}`]);
  return b64(out);
}

/** Runs fn with a headless Chrome tab. */
async function withChrome(fn) {
  const port = 9336;
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

// ---------------------------------------------------------------- card --

const PAGE = `<!doctype html><meta charset="utf-8"><style>
${fontFace(b64(FONT))}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:G;-webkit-font-smoothing:antialiased}
ul{list-style:none}
#root{width:${W}px;padding:1px}
.card{padding:28px 32px 12px}
.top{display:flex;align-items:center;gap:10px}
.mark{display:block;width:26px;height:26px;margin-left:-4px}
.name{font-size:15px;font-weight:500;letter-spacing:-.01em}
.pill{display:inline-flex;align-items:center;gap:8px;height:28px;margin-left:auto;padding:0 12px;font-size:13px}
.dot{display:block;width:7px;height:7px}
.lead{max-width:21em;margin-top:22px;font-size:32px;font-weight:450;line-height:1.14;letter-spacing:-.035em}
.rows{margin-top:26px}
.row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:12px;padding:15px 0;border-top:1px solid}
dt{font-size:11px;font-weight:500;line-height:20px;letter-spacing:.09em}
dd{font-size:14.5px;line-height:20px}
b{font-weight:500}
.products{display:grid;gap:14px}
.product{display:grid;grid-template-columns:36px 230px minmax(0,1fr);align-items:center;gap:14px}
.icon{display:block;width:36px;height:36px}
.pname{font-size:15px;font-weight:500;line-height:19px;letter-spacing:-.01em}
.small{font-size:12.5px;line-height:18px}
.proof{font-size:14px;line-height:19px}
.tools{display:flex;flex-wrap:wrap;gap:6px 18px}
.tool{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.logo{display:block;width:15px;height:15px}
</style><div id="root"><div class="card" data-box="card">
<div class="top"><i class="mark" data-box="mark"></i><span class="name" data-role="ink">Faseeh Hyder</span><span class="pill" data-box="pill"><i class="dot" data-box="dot"></i><span data-role="ink">Open to roles</span></span></div>
<p class="lead" data-role="ink">${esc(LEAD[0])} <span data-role="soft">${esc(LEAD[1])}</span></p>
<dl class="rows">
<div class="row"><dt data-role="muted">SHIPPED</dt><dd><ul class="products">${SHIPPED.map((p) => `<li class="product"><i class="icon" data-box="${p.icon}"></i><div><p class="pname" data-role="ink">${esc(p.name)}</p><p class="small" data-role="muted">${esc(p.what)}</p></div><div><p class="proof" data-role="text2">${strong(p.proof)}</p><p class="small" data-role="muted">${esc(p.role)}</p></div></li>`).join("")}</ul></dd></div>
<div class="row"><dt data-role="muted">STACK</dt><dd><ul class="tools">${STACK.map(([name, logo]) => `<li class="tool" data-role="text2"><i class="logo" data-box="public/logos/tech/${logo}.svg"></i>${esc(name)}</li>`).join("")}</ul></dd></div>
<div class="row"><dt data-role="muted">CLIENTS</dt><dd data-role="text2">${strong(CLIENTS)}</dd></div>
<div class="row"><dt data-role="muted">RELOCATING</dt><dd data-role="text2">${strong(MOVING)}</dd></div>
</dl></div></div>`;

// In the page: every run of text on one line in one style, with where it
// starts and its baseline; the boxes the art goes in; and the hairlines.
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
    if (!node.data.trim()) continue;
    const el = node.parentElement, cs = getComputedStyle(el);
    const style = {
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, ls: parseFloat(cs.letterSpacing) || 0,
      role: el.closest("[data-role]").dataset.role,
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
        continue;
      }
      push();
      if (!ch.trim()) continue;
      run = { ...style, text: ch, left: b.left, top: b.top, base: b.top + ascent(cs) };
    }
    push();
  }
  const boxes = [...document.querySelectorAll("[data-box]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { name: el.dataset.box, x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const rules = [...document.querySelectorAll(".row")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width };
  });
  return { runs, boxes, rules, height: document.getElementById("root").offsetHeight };
})()`;

// Widths of the buttons' labels, and the cap height.
const MEASURE = (items) => `(async () => {
  await document.fonts.ready;
  const c = document.createElement("canvas").getContext("2d");
  return ${JSON.stringify(items)}.map(([t, size, weight, ls]) => {
    c.font = weight + " " + size + "px G";
    c.letterSpacing = ls + "px";
    return { w: c.measureText(t).width, cap: c.measureText("H").actualBoundingBoxAscent };
  });
})()`;

const BTN = { h: 40, pad: 16, icon: 15, gap: 8, size: 14.5, weight: 500, ls: -0.15 };

const page = join(TMP, "brief.html");
writeFileSync(page, PAGE);
const { L, buttons } = await withChrome(async ({ send, evaluate }) => {
  await send("Page.enable");
  await send("Page.navigate", { url: `file://${page}` });
  await wait(800);
  return {
    L: await evaluate(LAYOUT),
    buttons: await evaluate(MEASURE(LINKS.map((b) => [b.label, BTN.size, BTN.weight, BTN.ls]))),
  };
});

// The ƒ mark, as the site draws it.
const logoSrc = readFileSync(join(SITE, "src/components/logo.tsx"), "utf8");
const MARK = {
  viewBox: Number(logoSrc.match(/MARK_VIEWBOX = "0 0 (\d+)/)[1]),
  stroke: Number(logoSrc.match(/MARK_STROKE = ([\d.]+)/)[1]),
  paths: [...logoSrc.slice(logoSrc.indexOf("MARK_PATHS")).split("];")[0].matchAll(/"(M[^"]+)"/g)].map((m) => m[1]),
};

// Marks drawn here, for work whose own icon can't be shown ("drawn:…"):
// on the site's icon grid (24 units, round strokes), in ink on white, so
// they sit with the app icons in either theme.
const DRAWN = {
  "drawn:car.webp":
    '<path d="M19 17h2a1 1 0 0 0 1-1v-3a2 2 0 0 0-1.4-1.9L18 10.2l-2.1-3.1A2 2 0 0 0 14.2 6H9.8a2 2 0 0 0-1.7.9L6 10.2l-2.6.9A2 2 0 0 0 2 13v3a1 1 0 0 0 1 1h2M9 17h6M6 10.2h12"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
};
const iconSource = (icon) =>
  DRAWN[icon]
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><rect width="24" height="24" fill="#fff"/><g transform="translate(4.2 3.8) scale(0.65)" fill="none" stroke="${THEMES.light.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${DRAWN[icon]}</g></svg>`)
    : join(SITE, icon);

// Each product's icon, at twice its size for a sharp screen.
const ICONS = Object.fromEntries(await Promise.all(SHIPPED.map(async (p) =>
  [p.icon, (await sharp(iconSource(p.icon)).resize(72, 72).webp({ quality: 88 }).toBuffer()).toString("base64")])));

let ids = 0;
/** A tool's logo drawn into its box, its ids kept apart from the others'. */
function inlineLogo(b) {
  const src = readFileSync(join(SITE, b.name), "utf8"), id = `l${++ids}`;
  const inner = src
    .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "")
    .replace(/id="([^"]+)"/g, `id="${id}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${id}$1)`);
  return `<svg x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" viewBox="${src.match(/viewBox="([^"]+)"/)[1]}">${inner}</svg>`;
}

const text = (runs) => runs.map(([t]) => t).join("");
const LABEL = [
  `Faseeh Hyder, open to roles. ${LEAD.join(" ")}`,
  `Shipped: ${SHIPPED.map((p) => `${p.name}, ${p.what.toLowerCase()}: ${text(p.proof)}. ${p.role}.`).join(" ")}`,
  `Stack: ${STACK.map(([n]) => n).join(", ")}.`,
  `Clients: ${text(CLIENTS)}.`,
  `Relocating: ${text(MOVING)}.`,
].join(" ");
const cardFont = subset(L.runs.map((r) => r.text).join(""));

function brief(t) {
  const H = Math.ceil(L.height), box = (name) => L.boxes.find((b) => b.name === name);
  const card = box("card"), mark = box("mark"), pill = box("pill"), dot = box("dot");
  const icons = L.boxes.filter((b) => b.name.endsWith(".webp"));
  const logos = L.boxes.filter((b) => b.name.endsWith(".svg"));
  const k = mark.w / MARK.viewBox;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(LABEL)}">
<defs><style>${fontFace(cardFont)}text{font-family:G,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}</style>
<filter id="ink" color-interpolation-filters="sRGB"><feFlood flood-color="${t.ink}"/><feComposite in2="SourceAlpha" operator="in"/></filter>
${icons.map((b, i) => `<clipPath id="icon${i}"><rect x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" rx="${n1(b.w * 0.24)}"/></clipPath>`).join("")}
</defs>
<rect x="${n1(card.x + 0.5)}" y="${n1(card.y + 0.5)}" width="${n1(card.w - 1)}" height="${n1(card.h - 1)}" rx="16" fill="${t.bg}" stroke="${t.line}"/>
${L.rules.map((r) => `<rect x="${n1(r.x)}" y="${n1(r.y)}" width="${n1(r.w)}" height="1" fill="${t.line}"/>`).join("")}
<g transform="translate(${n1(mark.x)} ${n1(mark.y)}) scale(${n2(k)})" fill="none" stroke="${t.ink}" stroke-width="${MARK.stroke}" stroke-linecap="round">${MARK.paths.map((d) => `<path d="${d}"/>`).join("")}</g>
<rect x="${n1(pill.x + 0.5)}" y="${n1(pill.y + 0.5)}" width="${n1(pill.w - 1)}" height="${n1(pill.h - 1)}" rx="${n1((pill.h - 1) / 2)}" fill="${t.card}" stroke="${t.line}"/>
<circle cx="${n1(dot.x + dot.w / 2)}" cy="${n1(dot.y + dot.h / 2)}" r="${n1(dot.w / 2)}" fill="${t.ok}"/>
${icons.map((b, i) => `<image xlink:href="data:image/webp;base64,${ICONS[b.name]}" x="${n1(b.x)}" y="${n1(b.y)}" width="${n1(b.w)}" height="${n1(b.h)}" clip-path="url(#icon${i})"/><rect x="${n1(b.x + 0.5)}" y="${n1(b.y + 0.5)}" width="${n1(b.w - 1)}" height="${n1(b.h - 1)}" rx="${n1(b.w * 0.24 - 0.5)}" fill="none" stroke="${t.ring}"/>`).join("\n")}
<g filter="url(#ink)">${logos.map(inlineLogo).join("")}</g>
${L.runs.map((r) => `<text x="${n1(r.left)}" y="${n1(r.base)}" font-size="${r.size}" font-weight="${r.weight}"${r.ls ? ` letter-spacing="${n2(r.ls)}"` : ""} fill="${t[r.role]}">${esc(r.text)}</text>`).join("\n")}
</svg>
`;
}

// ------------------------------------------------------------- buttons --

// Icons on the site's grid (src/components/icons.tsx): 24 units, a 1.75
// stroke with round ends.
const ICON = {
  globe: () => `<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>`,
  stack: () => `<rect x="3" y="8" width="14" height="13" rx="2.5"/><path d="M7 4.5h10.5A3 3 0 0 1 20.5 7.5V17"/>`,
  doc: () => `<path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>`,
  mail: () => `<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/>`,
  linkedin: (fg, bg) =>
    `<rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="${fg}" stroke="none"/>` +
    `<g fill="${bg}" stroke="none"><circle cx="8" cy="7.9" r="1.45"/><rect x="6.75" y="10.2" width="2.5" height="7.6" rx=".4"/>` +
    `<path d="M11.2 10.2h2.35v1.05c.45-.75 1.35-1.3 2.55-1.3 2.15 0 2.9 1.35 2.9 3.4v4.45h-2.5v-3.95c0-1.05-.3-1.75-1.35-1.75s-1.45.75-1.45 1.75v3.95h-2.5z"/></g>`,
};

function button(b, m, t, font) {
  const { h, pad, icon, gap } = BTN, w = Math.ceil(pad + icon + gap + m.w + pad);
  const fg = b.primary ? t.bg : t.ink, fill = b.primary ? t.ink : t.card;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(b.label)}">
<defs><style>${fontFace(font)}text{font-family:G,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}</style></defs>
<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="9.5" fill="${fill}"${b.primary ? "" : ` stroke="${t.line2}"`}/>
<g transform="translate(${pad} ${(h - icon) / 2}) scale(${icon / 24})" fill="none" stroke="${fg}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICON[b.icon](fg, fill)}</g>
<text x="${pad + icon + gap}" y="${n1(h / 2 + m.cap / 2)}" font-size="${BTN.size}" font-weight="${BTN.weight}" letter-spacing="${BTN.ls}" fill="${fg}">${esc(b.label)}</text>
</svg>
`;
}

// --------------------------------------------------------------- write --

mkdirSync(join(HERE, "buttons"), { recursive: true });
const sizes = {};
LINKS.forEach((b, i) => {
  const font = subset(b.label);
  for (const [name, t] of Object.entries(THEMES)) {
    const svg = button(b, buttons[i], t, font);
    writeFileSync(join(HERE, "buttons", `${b.file}-${name}.svg`), svg);
    sizes[b.file] = Number(svg.match(/width="(\d+)"/)[1]);
  }
});
for (const [name, t] of Object.entries(THEMES)) writeFileSync(join(HERE, `brief-${name}.svg`), brief(t));
console.log(JSON.stringify({ card: [W, Math.ceil(L.height)], buttons: sizes }));
