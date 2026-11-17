#!/usr/bin/env node
// Glowline setup and customization.
//
// Plugins can't set `statusLine` themselves, so this script:
//   install   copies the renderer to <config>/hooks/glowline.js and itself to
//             <config>/hooks/glowline-setup.js (stable paths that survive plugin
//             updates), then points settings.json `statusLine` at the renderer.
//             Backs up settings first and remembers any previous statusLine.
//   remove    restores the previous statusLine (or deletes ours) and the copies.
//   sync      SessionStart hook: refreshes the copies after a plugin update.
//   status    prints what is configured.
// Customization (writes <config>/glowline.json; no Claude Code restart needed):
//   theme [name] · preview · set <key> <value> · config · reset
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// Runs from the plugin (scripts/statusline.js) or from the installed copy (hooks/glowline.js).
const libFile = fs.existsSync(path.join(__dirname, 'statusline.js')) ? 'statusline.js' : 'glowline.js';
const lib = require(path.join(__dirname, libFile));

const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const settingsPath = path.join(configDir, 'settings.json');
const backupPath = settingsPath + '.glowline.bak';
const previousPath = path.join(configDir, 'glowline.previous.json');
const hooksDir = path.join(configDir, 'hooks');
const target = path.join(hooksDir, 'glowline.js');
const setupTarget = path.join(hooksDir, 'glowline-setup.js');
const command = `node "${target.replace(/\\/g, '/')}"`;
const runningInstalled = path.resolve(__dirname) === path.resolve(hooksDir);

const isOurs = (sl) => typeof sl?.command === 'string' && sl.command.includes('glowline.js');
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function fail(msg) {
  throw new Error(msg);
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`${file} is not valid JSON (${e.message}); fix it first, nothing was changed.`);
  }
}

function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function copyScripts() {
  if (runningInstalled) return;
  fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'statusline.js'), target);
  fs.copyFileSync(__filename, setupTarget);
}

// ── install / remove / sync / status ──────────────────────────────────────
function install() {
  const settings = readJson(settingsPath, {});
  copyScripts();

  if (fs.existsSync(settingsPath) && !fs.existsSync(backupPath)) fs.copyFileSync(settingsPath, backupPath);
  if (settings.statusLine && !isOurs(settings.statusLine) && !fs.existsSync(previousPath)) {
    writeJson(previousPath, settings.statusLine);
  }

  settings.statusLine = { type: 'command', command, refreshInterval: 15 };
  writeJson(settingsPath, settings);

  console.log(`Installed status line script: ${target}`);
  console.log(`settings.json statusLine -> ${command}`);
  if (fs.existsSync(backupPath)) console.log(`Settings backup: ${backupPath}`);
  if (fs.existsSync(previousPath)) console.log(`Previous statusLine saved to: ${previousPath} (restored by "remove")`);
  console.log('Done. The status line appears on the next update (send a message, or restart Claude Code).');
}

function remove() {
  const settings = readJson(settingsPath, {});
  if (fs.existsSync(previousPath)) {
    settings.statusLine = readJson(previousPath, undefined);
    fs.unlinkSync(previousPath);
    writeJson(settingsPath, settings);
    console.log('Restored your previous statusLine.');
  } else if (isOurs(settings.statusLine)) {
    delete settings.statusLine;
    writeJson(settingsPath, settings);
    console.log('Removed statusLine from settings.json.');
  } else {
    console.log('settings.json statusLine is not ours; left untouched.');
  }
  for (const f of [target, setupTarget]) {
    if (fs.existsSync(f)) {
      fs.unlinkSync(f);
      console.log(`Deleted ${f}`);
    }
  }
  if (fs.existsSync(lib.configPath())) console.log(`Kept your preferences: ${lib.configPath()} (delete it if you don't need it)`);
}

function sync() {
  try {
    if (runningInstalled || !fs.existsSync(target)) return; // not installed: do nothing
    for (const [src, dst] of [[path.join(__dirname, 'statusline.js'), target], [__filename, setupTarget]]) {
      const fresh = fs.readFileSync(src);
      if (!fs.existsSync(dst) || !fresh.equals(fs.readFileSync(dst))) fs.writeFileSync(dst, fresh);
    }
  } catch {
    // never block session start
  }
}

function status() {
  const settings = readJson(settingsPath, {});
  console.log(`Script ${fs.existsSync(target) ? 'installed' : 'missing'}: ${target}`);
  console.log(`statusLine: ${settings.statusLine ? JSON.stringify(settings.statusLine) : '(not set)'}`);
  console.log(isOurs(settings.statusLine) ? 'glowline is active.' : 'glowline is NOT active. Run /glowline:setup');
  const cfg = lib.normalize(lib.readConfigFile());
  console.log(`Theme: ${cfg.theme} · icons: ${cfg.icons} · gauge: ${cfg.gauge} · segments: ${cfg.segments.join(',')}`);
}

// ── customization ─────────────────────────────────────────────────────────
function readPrefs() {
  const raw = readJson(lib.configPath(), {});
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${lib.configPath()} must hold a JSON object.`);
  delete raw.previewUntil; // any change ends a running preview
  return raw;
}

function savePrefs(raw) {
  fs.mkdirSync(path.dirname(lib.configPath()), { recursive: true });
  writeJson(lib.configPath(), raw);
}

const oneOf = (key, value, allowed) => {
  if (!allowed.includes(value)) fail(`Unknown ${key} "${value}". Choose one of: ${allowed.join(', ')}`);
  return value;
};

function parseBool(key, value) {
  const v = String(value).toLowerCase();
  if (['on', 'true', 'yes', '1'].includes(v)) return true;
  if (['off', 'false', 'no', '0'].includes(v)) return false;
  fail(`${key} takes on or off.`);
}

const SETTERS = {
  theme: (v) => oneOf('theme', v, Object.keys(lib.THEMES)),
  icons: (v) => oneOf('icons', v, Object.keys(lib.ICONS)),
  separator: (v) => oneOf('separator', v, Object.keys(lib.SEPARATORS)),
  gauge: (v) => oneOf('gauge', v, lib.GAUGES),
  title: (v) => parseBool('title', v),
  links: (v) => parseBool('links', v),
  segments: (v) => {
    const list = v.split(/[,\s]+/).filter(Boolean);
    if (!list.length) fail(`segments needs a list, e.g. time,model,path,git. Available: ${lib.SEGMENTS.join(', ')}`);
    for (const s of list) oneOf('segment', s, lib.SEGMENTS);
    return [...new Set(list)];
  },
};

function set(key, ...rest) {
  const value = rest.join(' ').trim();
  if (!key || !value) fail(`Usage: set <key> <value>. Keys: ${[...Object.keys(SETTERS), 'colors.<name>'].join(', ')}`);
  const raw = readPrefs();

  if (key.startsWith('colors.')) {
    const name = key.slice(7);
    if (!has(lib.THEMES.omp, name)) fail(`Unknown color "${name}". Colors: ${Object.keys(lib.THEMES.omp).join(', ')}`);
    const colors = { ...(raw.colors || {}) };
    if (value === 'default') delete colors[name];
    else {
      const hex = value.startsWith('#') ? value : `#${value}`;
      if (!/^#[0-9a-f]{6}$/i.test(hex)) fail(`${key} takes a hex color like ff5f5f (or "default").`);
      colors[name] = hex.toLowerCase();
    }
    raw.colors = colors;
    savePrefs(raw);
    console.log(`Set ${key} = ${colors[name] || 'theme default'}`);
    return;
  }

  if (!has(SETTERS, key)) fail(`Unknown key "${key}". Keys: ${[...Object.keys(SETTERS), 'colors.<name>'].join(', ')}`);
  raw[key] = SETTERS[key](value);
  savePrefs(raw);
  console.log(`Set ${key} = ${Array.isArray(raw[key]) ? raw[key].join(',') : raw[key]}`);
  if (key === 'separator' && raw[key] === 'powerline' && lib.normalize(raw).icons !== 'nerd') {
    console.log('Note: powerline separators need icons=nerd; showing chevrons until then.');
  }
}

function theme(name) {
  if (name) return set('theme', name);
  const current = lib.normalize(lib.readConfigFile()).theme;
  console.log('Themes (current marked *):');
  for (const t of Object.keys(lib.THEMES)) console.log(`  ${t === current ? '*' : ' '} ${t}`);
  console.log('Change: /glowline:setup theme <name> · compare: /glowline:setup preview');
}

function preview() {
  const raw = readPrefs();
  raw.previewUntil = Date.now() + 60_000;
  savePrefs(raw);
  console.log('Preview on: the status bar shows every theme (one per row) for 60 seconds, starting after this reply.');
  console.log(`Then pick one: /glowline:setup theme <name>  (${Object.keys(lib.THEMES).join(', ')})`);
}

function config() {
  const cfg = lib.normalize(lib.readConfigFile());
  delete cfg.previewUntil;
  console.log(`Preferences file: ${lib.configPath()}${fs.existsSync(lib.configPath()) ? '' : ' (not created yet; using defaults)'}`);
  console.log(JSON.stringify(cfg, null, 2));
}

function reset() {
  if (fs.existsSync(lib.configPath())) fs.unlinkSync(lib.configPath());
  console.log('Preferences reset to defaults (omp theme, default segments).');
}

function help() {
  console.log(`Glowline commands (/glowline:setup <command>):
  install | remove | status
  theme [name]            list themes or switch: ${Object.keys(lib.THEMES).join(', ')}
  preview                 show every theme in the status bar for 60 s
  set <key> <value>       keys:
    segments  ${lib.SEGMENTS.join(',')}
    gauge     ${lib.GAUGES.join(' | ')}
    icons     ${Object.keys(lib.ICONS).join(' | ')}
    separator ${Object.keys(lib.SEPARATORS).join(' | ')}
    title     on | off
    links     on | off
    colors.<name> <hex>|default   names: ${Object.keys(lib.THEMES.omp).join(', ')}
  config                  show current preferences
  reset                   back to defaults`);
}

const actions = { install, remove, sync, status, theme, preview, set, config, reset, help };
const [name = 'install', ...args] = process.argv.slice(2);
const action = has(actions, name.toLowerCase()) ? actions[name.toLowerCase()] : null;
if (!action) {
  help();
  process.exit(2);
}
try {
  action(...args);
} catch (e) {
  console.error(`glowline: ${e.message}`);
  process.exit(1);
}
