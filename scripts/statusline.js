#!/usr/bin/env node
// Glowline: omp-style status line for Claude Code.
// Claude Code pipes session JSON on stdin and renders whatever we print.
// Runs locally; uses no API tokens.
//
// Optional config: <claude config dir>/glowline.json (see README).
//   node glowline.js --preview   prints every theme with sample data.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── themes ────────────────────────────────────────────────────────────────
// accent: time/model/PR/title · gaugeLow/Mid/High: context bar by fill level
const THEMES = {
  omp: {
    panel: '#0f1216', accent: '#ff5f5f', text: '#e8ecf4', muted: '#696c72', dim: '#3a3d44',
    folder: '#fcd53f', branch: '#ffb347', cost: '#d9c49c', ok: '#8ae0a5', bad: '#ff3b3b',
    gaugeLow: '#ff5f5f', gaugeMid: '#ff5f5f', gaugeHigh: '#ff3b3b',
  },
  dracula: {
    panel: '#282a36', accent: '#bd93f9', text: '#f8f8f2', muted: '#6272a4', dim: '#44475a',
    folder: '#f1fa8c', branch: '#ffb86c', cost: '#50fa7b', ok: '#50fa7b', bad: '#ff5555',
    gaugeLow: '#50fa7b', gaugeMid: '#f1fa8c', gaugeHigh: '#ff5555',
  },
  catppuccin: {
    panel: '#1e1e2e', accent: '#cba6f7', text: '#cdd6f4', muted: '#7f849c', dim: '#45475a',
    folder: '#f9e2af', branch: '#fab387', cost: '#a6e3a1', ok: '#a6e3a1', bad: '#f38ba8',
    gaugeLow: '#a6e3a1', gaugeMid: '#f9e2af', gaugeHigh: '#f38ba8',
  },
  'tokyo-night': {
    panel: '#1a1b26', accent: '#7aa2f7', text: '#c0caf5', muted: '#565f89', dim: '#3b4261',
    folder: '#e0af68', branch: '#ff9e64', cost: '#9ece6a', ok: '#9ece6a', bad: '#f7768e',
    gaugeLow: '#9ece6a', gaugeMid: '#e0af68', gaugeHigh: '#f7768e',
  },
  nord: {
    panel: '#2e3440', accent: '#88c0d0', text: '#eceff4', muted: '#7b88a1', dim: '#434c5e',
    folder: '#ebcb8b', branch: '#d08770', cost: '#a3be8c', ok: '#a3be8c', bad: '#bf616a',
    gaugeLow: '#a3be8c', gaugeMid: '#ebcb8b', gaugeHigh: '#bf616a',
  },
  gruvbox: {
    panel: '#282828', accent: '#fe8019', text: '#ebdbb2', muted: '#928374', dim: '#504945',
    folder: '#fabd2f', branch: '#8ec07c', cost: '#b8bb26', ok: '#b8bb26', bad: '#fb4934',
    gaugeLow: '#b8bb26', gaugeMid: '#fabd2f', gaugeHigh: '#fb4934',
  },
  mono: {
    panel: '#1c1c1c', accent: '#d0d0d0', text: '#e4e4e4', muted: '#808080', dim: '#3a3a3a',
    folder: '#bcbcbc', branch: '#bcbcbc', cost: '#bcbcbc', ok: '#bcbcbc', bad: '#ffffff',
    gaugeLow: '#bcbcbc', gaugeMid: '#d0d0d0', gaugeHigh: '#ffffff',
  },
};
const CAVEMAN_COLOR = '#d7870a';

const ICONS = {
  nerd: {
    time: '\uf252', model: '\uf2db', path: '\uf07b', git: '\ue0a0', pr: '\uf407', lines: '\uf044',
    effort: '\uf0e7', limits: '\uf0e4', clock: '\uf017', title: '\uf075', capL: '\ue0b6', capR: '\ue0b4',
  },
  emoji: {
    time: '\u23f3', model: '\u{1f916}', path: '\u{1f4c1}', git: '\u{1f33f}', pr: '\u{1f500}', lines: '\u{1f4dd}',
    effort: '\u26a1', limits: '\u{1f4ca}', clock: '\u{1f550}', title: '\u{1f4ac}', capL: '', capR: '',
  },
  plain: {
    time: '', model: '', path: '', git: '', pr: '', lines: '', effort: '', limits: '', clock: '', title: '',
    capL: '', capR: '',
  },
};

const SEPARATORS = { chevron: '\u203a', powerline: '\ue0b1', slash: '/', dot: '\u00b7', pipe: '\u2502', space: '' };
const GAUGES = ['line', 'blocks', 'percent', 'off'];
const SEGMENTS = ['time', 'model', 'path', 'git', 'pr', 'cost', 'lines', 'effort', 'limits', 'clock', 'caveman'];

const DEFAULTS = Object.freeze({
  theme: 'omp',
  segments: ['time', 'model', 'path', 'git', 'pr', 'cost', 'caveman'],
  gauge: 'line',
  title: true,
  icons: 'nerd',
  separator: 'chevron',
  links: true,
  colors: {},
});

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const HEX = /^#[0-9a-f]{6}$/i;

// Unknown keys and bad values fall back to defaults, so a typo can't break the bar.
function normalize(raw) {
  const c = { ...DEFAULTS, segments: [...DEFAULTS.segments], colors: {} };
  if (!raw || typeof raw !== 'object') return c;
  if (has(THEMES, raw.theme)) c.theme = raw.theme;
  if (Array.isArray(raw.segments)) c.segments = raw.segments.filter((s, i, a) => SEGMENTS.includes(s) && a.indexOf(s) === i);
  if (GAUGES.includes(raw.gauge)) c.gauge = raw.gauge;
  if (typeof raw.title === 'boolean') c.title = raw.title;
  if (has(ICONS, raw.icons)) c.icons = raw.icons;
  if (has(SEPARATORS, raw.separator)) c.separator = raw.separator;
  if (typeof raw.links === 'boolean') c.links = raw.links;
  if (raw.colors && typeof raw.colors === 'object') {
    for (const [k, v] of Object.entries(raw.colors)) if (has(THEMES.omp, k) && HEX.test(v)) c.colors[k] = v;
  }
  if (typeof raw.previewUntil === 'number') c.previewUntil = raw.previewUntil;
  return c;
}

const configDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const configPath = () => path.join(configDir(), 'glowline.json');

function readConfigFile() {
  try {
    const p = configPath();
    if (fs.statSync(p).size > 64 * 1024) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

// ── terminal helpers ──────────────────────────────────────────────────────
const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16};${(n >> 8) & 255};${n & 255}`;
};
const fg = (hex) => `${ESC}38;2;${rgb(hex)}m`;
const bg = (hex) => `${ESC}48;2;${rgb(hex)}m`;
// Strip control bytes from any value we did not produce ourselves.
const clean = (s) => String(s ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');

const ANSI = /\x1b\[[0-9;]*m|\x1b\]8;;[^\x1b]*\x1b\\/g;
const WIDE = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3], [0x25fd, 0x25fe],
  [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab],
  [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3],
  [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728],
  [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797], [0x27b0, 0x27b0],
  [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0xa4cf], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff],
  [0x1f900, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
];
function cpWidth(cp) {
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || (cp >= 0xfe00 && cp <= 0xfe0f)) return 0;
  for (const [lo, hi] of WIDE) if (cp >= lo && cp <= hi) return 2;
  return 1;
}
const width = (s) => {
  let w = 0;
  for (const ch of s.replace(ANSI, '')) w += cpWidth(ch.codePointAt(0));
  return w;
};
function truncate(s, cols) {
  if (width(s) <= cols) return s;
  let out = '';
  let w = 0;
  for (const ch of s) {
    const cw = cpWidth(ch.codePointAt(0));
    if (w + cw > cols - 1) break;
    out += ch;
    w += cw;
  }
  return out + '\u2026';
}

// ── data helpers ──────────────────────────────────────────────────────────
function fmtDuration(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h${m}m`;
  if (m) return `${m}m`;
  return `${s}s`;
}

function fmtTokens(n) {
  if (!n) return '';
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

function fmtPath(dir) {
  if (!dir) return '';
  let p = dir.replace(/\\/g, '/');
  const home = os.homedir().replace(/\\/g, '/');
  if (p.toLowerCase().startsWith(home.toLowerCase())) p = '~' + p.slice(home.length);
  // WSL UNC paths: //wsl.localhost/<distro>/home/<user>/... -> ~/...
  p = p.replace(/^\/\/wsl(?:\.localhost|\$)\/[^/]+\/home\/[^/]+/i, '~');
  if (p.length > 40) p = '\u2026/' + p.split('/').slice(-2).join('/');
  return p;
}

function gitInfo(cwd) {
  if (!cwd) return null;
  let out;
  try {
    out = execFileSync('git', ['-C', cwd, 'status', '--porcelain=v2', '--branch'], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
  } catch {
    return null;
  }
  const info = { branch: '', ahead: 0, behind: 0, changed: 0, untracked: 0 };
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) info.branch = line.slice(14).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) [info.ahead, info.behind] = [+m[1], +m[2]];
    } else if (line.startsWith('? ')) info.untracked++;
    else if (/^[12u] /.test(line)) info.changed++;
  }
  if (info.branch === '(detached)') info.branch = 'detached';
  return info;
}

// Same hardening as caveman-statusline.ps1: no reparse points, tiny files,
// whitelisted mode, control bytes stripped.
function cavemanBadge() {
  const dir = configDir();
  const flag = path.join(dir, '.caveman-active');
  try {
    const st = fs.lstatSync(flag);
    if (st.isSymbolicLink() || st.size > 64) return '';
    const mode = fs.readFileSync(flag, 'utf8').split(/\r?\n/)[0].trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const valid = ['off', 'lite', 'full', 'ultra', 'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra', 'commit', 'review', 'compress'];
    if (!valid.includes(mode)) return '';
    let badge = mode === 'full' ? 'CAVEMAN' : `CAVEMAN:${mode.toUpperCase()}`;
    if (process.env.CAVEMAN_STATUSLINE_SAVINGS !== '0') {
      const sf = path.join(dir, '.caveman-statusline-suffix');
      const sst = fs.lstatSync(sf, { throwIfNoEntry: false });
      if (sst && !sst.isSymbolicLink() && sst.size <= 64) {
        const savings = clean(fs.readFileSync(sf, 'utf8')).trim();
        if (savings) badge += ` ${savings}`;
      }
    }
    return badge;
  } catch {
    return '';
  }
}

function safeUrl(url) {
  const u = clean(url);
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : '';
}

function branchUrl(repo, branch) {
  if (!repo?.host || !repo?.owner || !repo?.name || !branch || branch === 'detached') return '';
  const tree = /gitlab/i.test(repo.host) ? '-/tree' : 'tree';
  const ref = branch.split('/').map(encodeURIComponent).join('/');
  return safeUrl(`https://${repo.host}/${repo.owner}/${repo.name}/${tree}/${ref}`);
}

// ── rendering ─────────────────────────────────────────────────────────────
// When the line doesn't fit, segments go in this order (git last).
const DROP_ORDER = ['clock', 'effort', 'lines', 'limits', 'caveman', 'cost', 'time', 'pr', 'path', 'model'];

// opts: { cols, git, caveman, titleOverride, now }
function render(d, cfg, opts) {
  const C = { ...THEMES[cfg.theme], ...cfg.colors };
  const I = ICONS[cfg.icons];
  const sepKey = cfg.separator === 'powerline' && cfg.icons !== 'nerd' ? 'chevron' : cfg.separator;
  const sepGlyph = SEPARATORS[sepKey];
  const sep = sepGlyph ? `${fg(C.muted)} ${sepGlyph} ` : '  ';
  const ic = (name) => (I[name] ? `${I[name]} ` : '');
  const link = (url, text) => (cfg.links && url ? `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\` : text);

  const cwd = d.workspace?.current_dir || d.cwd || process.cwd();
  const pctOf = (v) => Math.max(0, Math.min(100, Math.round(v ?? 0)));
  const levelColor = (pct) => (pct >= 80 ? C.gaugeHigh : pct >= 50 ? C.gaugeMid : C.gaugeLow);

  const build = {
    time: () => `${fg(C.accent)}${ic('time')}${fmtDuration(d.cost?.total_duration_ms)}`,
    model: () => (d.model?.display_name ? `${fg(C.accent)}${ic('model')}${clean(d.model.display_name)}` : ''),
    path: () => `${fg(C.folder)}${ic('path')}${fg(C.text)}${clean(fmtPath(cwd))}`,
    git: () => {
      const g = opts.git === undefined ? gitInfo(cwd) : opts.git;
      if (!g?.branch) return '';
      const name = link(branchUrl(d.workspace?.repo, g.branch), clean(g.branch));
      let s = `${fg(C.branch)}${ic('git')}${name}`;
      const marks = [];
      if (g.ahead) marks.push(`\u2191${g.ahead}`);
      if (g.behind) marks.push(`\u2193${g.behind}`);
      if (g.changed) marks.push(`!${g.changed}`);
      if (g.untracked) marks.push(`?${g.untracked}`);
      if (marks.length) s += ` ${fg(C.muted)}${marks.join(' ')}`;
      return s;
    },
    pr: () => {
      if (!d.pr?.number) return '';
      const label = `${d.pr.kind === 'mr' ? '!' : '#'}${clean(d.pr.number)}`;
      return `${fg(C.accent)}${ic('pr')}${link(safeUrl(d.pr.url), label)}`;
    },
    cost: () => (typeof d.cost?.total_cost_usd === 'number' ? `${fg(C.cost)}$${d.cost.total_cost_usd.toFixed(2)}` : ''),
    lines: () => {
      const add = d.cost?.total_lines_added || 0;
      const del = d.cost?.total_lines_removed || 0;
      if (!add && !del) return '';
      return `${fg(C.muted)}${ic('lines')}${fg(C.ok)}+${add} ${fg(C.bad)}\u2212${del}`;
    },
    effort: () => (d.effort?.level ? `${fg(C.muted)}${ic('effort')}${fg(C.text)}${clean(d.effort.level)}` : ''),
    limits: () => {
      const rl = d.rate_limits || {};
      const parts = [];
      for (const [key, label] of [['five_hour', '5h'], ['seven_day', '7d']]) {
        if (typeof rl[key]?.used_percentage !== 'number') continue;
        const pct = pctOf(rl[key].used_percentage);
        parts.push(`${fg(C.muted)}${label} ${fg(levelColor(pct))}${pct}%`);
      }
      return parts.length ? `${fg(C.muted)}${ic('limits')}${parts.join(' ')}` : '';
    },
    clock: () => {
      const t = opts.now || new Date();
      return `${fg(C.muted)}${ic('clock')}${fg(C.text)}${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    },
    caveman: () => {
      const badge = opts.caveman === undefined ? cavemanBadge() : opts.caveman;
      return badge ? `${fg(CAVEMAN_COLOR)}${badge}` : '';
    },
  };

  const panel = (content) => `${I.capL ? fg(C.panel) + I.capL : ''}${bg(C.panel)} ${content} ${RESET}${I.capR ? fg(C.panel) + I.capR + RESET : ''}`;

  let segs = cfg.segments.map((name) => [name, build[name]()]).filter(([, s]) => s);
  const leftOf = () => (segs.length ? panel(segs.map(([, s]) => s).join(sep)) : '');
  let left = leftOf();

  const ctx = d.context_window || {};
  const pct = pctOf(ctx.used_percentage);
  const size = fmtTokens(ctx.context_window_size);
  const gc = levelColor(pct);

  // Each style returns exactly `w` columns so the title stays right-aligned.
  const fill = (s, w) => s + ' '.repeat(Math.max(0, w - width(s)));
  const gauges = {
    line: (w) => {
      const label = `${pct}%`;
      const tail = size ? ` \u2502 \u2500${size}\u2500` : '';
      const bar = Math.max(0, w - label.length - tail.length - 2);
      const filled = Math.round((bar * pct) / 100);
      return (
        ` ${fg(gc)}${'\u2500'.repeat(filled)}${label}${fg(C.dim)}${'\u2500'.repeat(bar - filled)}` +
        (size ? ` ${fg(gc)}\u2502 ${fg(C.muted)}\u2500${size}\u2500` : '') +
        ` ${RESET}`
      );
    },
    blocks: (w) => {
      const n = 10;
      const filled = Math.round((n * pct) / 100);
      const s = ` ${fg(gc)}${'\u25b0'.repeat(filled)}${fg(C.dim)}${'\u25b1'.repeat(n - filled)} ${fg(gc)}${pct}%` +
        (size ? `${fg(C.muted)} \u2502 ${size}` : '') + RESET;
      return fill(s, w);
    },
    percent: (w) => fill(` ${fg(gc)}${pct}%${size ? `${fg(C.muted)} \u2502 ${size}` : ''}${RESET}`, w),
    off: (w) => ' '.repeat(Math.max(1, w)),
  };
  const MIN = { line: 16, blocks: 24, percent: 12, off: 1 };

  let title = cfg.title ? clean(opts.titleOverride ?? d.session_name) : '';
  const right = () => (title ? panel(`${fg(C.accent)}${ic('title')}${title}`) : '');
  const budget = (opts.cols || 120) - 4; // Claude Code adds its own padding around the line
  const min = MIN[cfg.gauge];
  let room = budget - width(left) - width(right());
  if (title && room < min) {
    const keep = width(title) - (min - room);
    title = keep >= 8 ? truncate(title, keep) : '';
    room = budget - width(left) - width(right());
  }
  // Still too narrow: drop the least important segments, git and model last.
  for (const drop of DROP_ORDER) {
    if (room >= min || segs.length <= 1) break;
    if (!segs.some(([name]) => name === drop)) continue;
    segs = segs.filter(([name]) => name !== drop);
    left = leftOf();
    room = budget - width(left) - width(right());
  }

  return left + gauges[cfg.gauge](Math.max(min, room)) + right();
}

const SAMPLE = {
  model: { display_name: 'Opus 5.5' },
  workspace: { current_dir: path.join(os.homedir(), 'projects', 'demo-app') },
  cost: { total_cost_usd: 0.88, total_duration_ms: 240000, total_lines_added: 156, total_lines_removed: 23 },
  context_window: { used_percentage: 44, context_window_size: 1000000 },
  pr: { number: 11 },
  effort: { level: 'high' },
  rate_limits: { five_hour: { used_percentage: 23 }, seven_day: { used_percentage: 61 } },
  session_name: 'Theme preview',
};
const SAMPLE_GIT = { branch: 'feature/demo', ahead: 1, behind: 0, changed: 2, untracked: 4 };

function previewLines(cfg, cols, d = SAMPLE, git = SAMPLE_GIT, caveman = '') {
  return Object.keys(THEMES).map((theme) =>
    render(d, { ...cfg, theme }, { cols, git, caveman, titleOverride: `theme: ${theme}` }),
  );
}

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function main() {
  const cfg = normalize(readConfigFile());

  if (process.argv.includes('--preview')) {
    const cols = process.stdout.columns || parseInt(process.env.COLUMNS, 10) || 120;
    process.stdout.write(previewLines(cfg, cols).join('\n') + '\n');
    return;
  }

  const d = readInput();
  const cols = parseInt(process.env.COLUMNS, 10) || 120;

  // `/glowline:setup preview`: show every theme in the real status line for a minute.
  if (cfg.previewUntil && Date.now() < cfg.previewUntil) {
    const cwd = d.workspace?.current_dir || d.cwd || process.cwd();
    process.stdout.write(previewLines(cfg, cols, d, gitInfo(cwd), cavemanBadge()).join('\n'));
    return;
  }

  process.stdout.write(render(d, cfg, { cols }));
}

module.exports = { THEMES, ICONS, SEPARATORS, GAUGES, SEGMENTS, DEFAULTS, normalize, configPath, readConfigFile, render, width };

if (require.main === module) main();
