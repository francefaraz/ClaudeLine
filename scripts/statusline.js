#!/usr/bin/env node
// omp-style status line for Claude Code.
// Claude Code pipes session JSON on stdin and renders whatever we print.
// Requires a Nerd Font in the terminal (same as omp).
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── palette (sampled from omp's dark/red theme; keep in sync with themes/glowline.json) ──
const C = {
  panel: '#0f1216',
  accent: '#ff5f5f',
  hot: '#ff3b3b',
  text: '#e8ecf4',
  muted: '#696c72',
  dim: '#3a3d44',
  folder: '#fcd53f',
  branch: '#ffb347',
  cost: '#d9c49c',
  caveman: '#d7870a',
};

const G = {
  capL: '\ue0b6',
  capR: '\ue0b4',
  time: '\uf017',
  model: '\uf2db',
  folder: '\uf07b',
  branch: '\ue0a0',
  pr: '\uf407',
  title: '\uf075',
  sep: '\u203a',
};

const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16};${(n >> 8) & 255};${n & 255}`;
};
const fg = (hex) => `${ESC}38;2;${rgb(hex)}m`;
const bg = (hex) => `${ESC}48;2;${rgb(hex)}m`;
const width = (s) => [...s.replace(/\x1b\[[0-9;]*m/g, '')].length;
// Strip control bytes from any value we did not produce ourselves.
const clean = (s) => String(s ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, '');

function readInput() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

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
  if (p.length > 40) {
    const parts = p.split('/');
    p = '\u2026/' + parts.slice(-2).join('/');
  }
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
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
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

function panel(content) {
  return `${fg(C.panel)}${G.capL}${bg(C.panel)} ${content} ${RESET}${fg(C.panel)}${G.capR}${RESET}`;
}

function main() {
  const d = readInput();
  const cwd = d.workspace?.current_dir || d.cwd || process.cwd();
  const sep = `${fg(C.muted)} ${G.sep} `;
  const segs = [];

  segs.push(`${fg(C.accent)}${G.time} ${fmtDuration(d.cost?.total_duration_ms)}`);
  if (d.model?.display_name) segs.push(`${fg(C.accent)}${G.model} ${clean(d.model.display_name)}`);
  segs.push(`${fg(C.folder)}${G.folder} ${fg(C.text)}${clean(fmtPath(cwd))}`);

  const git = gitInfo(cwd);
  if (git?.branch) {
    let s = `${fg(C.branch)}${G.branch} ${clean(git.branch)}`;
    const marks = [];
    if (git.ahead) marks.push(`\u2191${git.ahead}`);
    if (git.behind) marks.push(`\u2193${git.behind}`);
    if (git.changed) marks.push(`!${git.changed}`);
    if (git.untracked) marks.push(`?${git.untracked}`);
    if (marks.length) s += ` ${fg(C.muted)}${marks.join(' ')}`;
    segs.push(s);
  }

  if (d.pr?.number) segs.push(`${fg(C.accent)}${G.pr} ${d.pr.kind === 'mr' ? '!' : '#'}${clean(d.pr.number)}`);
  if (typeof d.cost?.total_cost_usd === 'number') segs.push(`${fg(C.cost)}$${d.cost.total_cost_usd.toFixed(2)}`);

  const cave = cavemanBadge();
  if (cave) segs.push(`${fg(C.caveman)}${cave}`);

  const left = panel(segs.join(sep));

  let title = clean(d.session_name);
  const cols = parseInt(process.env.COLUMNS, 10) || 120;
  const budget = cols - 4; // Claude Code adds its own padding around the line

  const ctx = d.context_window || {};
  const pct = Math.max(0, Math.min(100, Math.round(ctx.used_percentage ?? 0)));
  const size = fmtTokens(ctx.context_window_size);
  const gaugeColor = pct >= 85 ? C.hot : C.accent;

  const gauge = (w) => {
    const label = `${pct}%`;
    const tail = size ? ` \u2502 \u2500${size}\u2500` : '';
    const bar = Math.max(0, w - label.length - tail.length - 2);
    const filled = Math.round((bar * pct) / 100);
    return (
      ` ${fg(gaugeColor)}${'\u2500'.repeat(filled)}${label}` +
      `${fg(C.dim)}${'\u2500'.repeat(bar - filled)}` +
      (size ? ` ${fg(gaugeColor)}\u2502 ${fg(C.muted)}\u2500${size}\u2500` : '') +
      ` ${RESET}`
    );
  };

  const MIN_GAUGE = 16;
  const right = () => (title ? panel(`${fg(C.accent)}${G.title} ${title}`) : '');
  let room = budget - width(left) - width(right());
  if (title && room < MIN_GAUGE) {
    const keep = Math.max(0, title.length - (MIN_GAUGE - room) - 1);
    title = keep >= 8 ? title.slice(0, keep) + '\u2026' : '';
    room = budget - width(left) - width(right());
  }

  process.stdout.write(left + gauge(Math.max(MIN_GAUGE, room)) + right());
}

main();
