#!/usr/bin/env node
// Installs / removes / syncs the omp-style status line.
//
// Plugins can't set `statusLine` themselves, so this script:
//   install  copies scripts/statusline.js to <config>/hooks/glowline.js
//            (a stable path that survives plugin updates) and points
//            settings.json `statusLine` at it. Backs up settings first and
//            remembers any previous statusLine so `remove` can restore it.
//   remove   restores the previous statusLine (or deletes ours) and the copy.
//   sync     SessionStart hook: refreshes the copy after a plugin update.
//            Silent and never fails the session.
//   status   prints what is configured.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const settingsPath = path.join(configDir, 'settings.json');
const backupPath = settingsPath + '.glowline.bak';
const previousPath = path.join(configDir, 'glowline.previous.json');
const bundled = path.join(__dirname, 'statusline.js');
const target = path.join(configDir, 'hooks', 'glowline.js');
const command = `node "${target.replace(/\\/g, '/')}"`;

const isOurs = (sl) => typeof sl?.command === 'string' && sl.command.includes('glowline.js');

function readSettings() {
  if (!fs.existsSync(settingsPath)) return {};
  const raw = fs.readFileSync(settingsPath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${settingsPath} is not valid JSON (${e.message}); fix it first, nothing was changed.`);
  }
}

function writeSettings(settings) {
  const tmp = settingsPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tmp, settingsPath);
}

function install() {
  const settings = readSettings();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(bundled, target);

  if (fs.existsSync(settingsPath) && !fs.existsSync(backupPath)) fs.copyFileSync(settingsPath, backupPath);
  if (settings.statusLine && !isOurs(settings.statusLine) && !fs.existsSync(previousPath)) {
    fs.writeFileSync(previousPath, JSON.stringify(settings.statusLine, null, 2) + '\n');
  }

  settings.statusLine = { type: 'command', command, refreshInterval: 15 };
  writeSettings(settings);

  console.log(`Installed status line script: ${target}`);
  console.log(`settings.json statusLine -> ${command}`);
  if (fs.existsSync(backupPath)) console.log(`Settings backup: ${backupPath}`);
  if (fs.existsSync(previousPath)) console.log(`Previous statusLine saved to: ${previousPath} (restored by "remove")`);
  console.log('Done. The status line appears on the next update (send a message, or restart Claude Code).');
}

function remove() {
  const settings = readSettings();
  if (fs.existsSync(previousPath)) {
    settings.statusLine = JSON.parse(fs.readFileSync(previousPath, 'utf8'));
    fs.unlinkSync(previousPath);
    writeSettings(settings);
    console.log('Restored your previous statusLine.');
  } else if (isOurs(settings.statusLine)) {
    delete settings.statusLine;
    writeSettings(settings);
    console.log('Removed statusLine from settings.json.');
  } else {
    console.log('settings.json statusLine is not ours; left untouched.');
  }
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log(`Deleted ${target}`);
  }
}

function sync() {
  try {
    if (!fs.existsSync(target)) return; // not installed: do nothing
    const fresh = fs.readFileSync(bundled);
    if (!fresh.equals(fs.readFileSync(target))) fs.writeFileSync(target, fresh);
  } catch {
    // never block session start
  }
}

function status() {
  const settings = readSettings();
  console.log(`Script ${fs.existsSync(target) ? 'installed' : 'missing'}: ${target}`);
  console.log(`statusLine: ${settings.statusLine ? JSON.stringify(settings.statusLine) : '(not set)'}`);
  console.log(isOurs(settings.statusLine) ? 'glowline is active.' : 'glowline is NOT active. Run /glowline:setup');
}

const actions = { install, remove, sync, status };
const action = actions[(process.argv[2] || 'install').toLowerCase()];
if (!action) {
  console.error('Usage: setup.js [install|remove|status|sync]');
  process.exit(2);
}
try {
  action();
} catch (e) {
  console.error(`glowline: ${e.message}`);
  process.exit(1);
}
