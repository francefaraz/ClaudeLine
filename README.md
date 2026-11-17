# ClaudeLine

> An oh-my-pi (omp) style status bar for Claude Code.

```
( ⏳ 4m › Opus › 📁 ~/project › ⎇ feature/XYZ-123 !2 ?4 › #11 › $1.20 ) ────44%────── │ ─1M─ ( 💬 Session title )
```

A Claude Code **plugin** (installed as `glowline`): it uses Claude Code's official extension points (plugin + status line + hook) and does not patch or modify Claude Code itself.

## Install

In Claude Code:

```
/plugin marketplace add francefaraz/ClaudeLine
/plugin install glowline
/glowline:setup
```

On Claude Code 2.1.275+ the first two lines can be one: `/plugin install glowline --marketplace francefaraz/ClaudeLine`.

The third command writes the `statusLine` entry in your `~/.claude/settings.json` (backup first). Plugins can't set the status line themselves, so this step is needed once.

Requirements:

- Node.js 18+ as `node` on your PATH
- `git` on PATH (optional; branch segment is skipped without it)
- A **Nerd Font** in your terminal (e.g. JetBrainsMono Nerd Font, CaskaydiaCove Nerd Font) for the default icons; without one, use `/glowline:setup set icons emoji` or `plain`
- A true-color terminal (Windows Terminal, VS Code, iTerm2, WezTerm, Kitty, …)

## Quick start

After install, try these (each change shows on the next message, or within 15 s):

```
/glowline:setup preview                                     # see all 7 themes in your bar for 60 s
/glowline:setup theme catppuccin                            # pick one
/glowline:setup set segments time,model,git,pr,lines,limits,clock
/glowline:setup set gauge blocks
/glowline:setup help                                        # everything you can change
```

Settings are saved, so they stay across sessions and restarts. `/glowline:setup reset` undoes everything.

## What it shows

Default segments, left to right:

| Segment | Name | Source (Claude Code status line JSON) |
| --- | --- | --- |
| Elapsed time | `time` | `cost.total_duration_ms` |
| Model | `model` | `model.display_name` |
| Folder | `path` | `workspace.current_dir`, home shortened to `~` |
| Branch `↑ahead ↓behind !changed ?untracked` | `git` | `git status` in the current folder; Ctrl+click opens the branch |
| `#PR` / `!MR` | `pr` | `pr.number`, once Claude Code detects an open PR/MR; Ctrl+click opens it |
| `$cost` | `cost` | `cost.total_cost_usd` (estimate at list price) |
| `CAVEMAN` badge | `caveman` | Only when the separate [caveman](https://github.com/JuliusBrussee/caveman) plugin is active (see [FAQ](#faq)) |

Optional segments (add with `set segments`):

| Segment | Name | Shows |
| --- | --- | --- |
| Lines changed | `lines` | `+156 −23` this session |
| Effort | `effort` | Reasoning effort level, e.g. `high` |
| Usage limits | `limits` | `5h 23% 7d 61%` (Claude subscription usage windows; hidden when not reported) |
| Clock | `clock` | Local time `HH:MM` |

Right side: the context gauge (fill level and window size, colored low → mid → high at 50% / 80%) and the session title. The bar fits the terminal width: on narrow terminals the title shortens first, then low-priority segments drop out. It refreshes every 15 s.

The status line runs locally and uses **no API tokens**.

## Color theme

The plugin also ships a Claude Code color theme, **Glowline**: red accent and prompt border, mint/orange/yellow mode colors, dark message panels, and red/green diffs, using the same colors as the status bar.

Turn it on in Claude Code: `/theme` → **Glowline** (listed as from `glowline`). Switch back the same way.

### Terminal background (optional)

Claude Code themes can't change the terminal's own background. For the full look (aubergine `#300A24` background, mint cursor), add the scheme in [`extras/windows-terminal-glowline.json`](extras/windows-terminal-glowline.json) to Windows Terminal:

1. Windows Terminal → Settings → **Open JSON file**.
2. Paste the scheme object into the `"schemes": [ … ]` array.
3. Set `"colorScheme": "Glowline"` on the profile you run Claude Code in (or pick it under that profile's *Appearance*).

Other terminals: copy the same hex values into their color settings.

## How it works

```
plugin (this repo)                         your machine
──────────────────                         ────────────
scripts/statusline.js ──setup copies──▶ ~/.claude/hooks/glowline.js
scripts/setup.js      ──setup copies──▶ ~/.claude/hooks/glowline-setup.js
scripts/setup.js      ──setup writes──▶ ~/.claude/settings.json  "statusLine": { "command": "node …/glowline.js" }
hooks/hooks.json      ──SessionStart──▶ re-copies both scripts after a plugin update
skills/setup/SKILL.md ── /glowline:setup <command>
themes/glowline.json  ── listed in /theme as "Glowline" (no setup needed)
extras/…scheme.json   ── optional Windows Terminal background scheme
```

Claude Code runs the status line command after each message, pipes session JSON to it on stdin, and shows what it prints.

## Commands

| Command | Effect |
| --- | --- |
| `/glowline:setup` | Install (copy scripts, set `statusLine`, back up settings) |
| `/glowline:setup status` | Show what is configured |
| `/glowline:setup remove` | Restore your previous `statusLine` (or remove ours) and delete the copied scripts |
| `/glowline:setup theme [name]` | List themes, or switch theme |
| `/glowline:setup preview` | Show every theme in your status bar for 60 seconds |
| `/glowline:setup set <key> <value>` | Change one preference (see below) |
| `/glowline:setup config` | Print current preferences |
| `/glowline:setup reset` | Back to defaults |
| `/glowline:setup help` | List commands and allowed values |

Each `/glowline:setup …` call is a short Claude turn (a few hundred tokens). To change settings **without a Claude turn**, run the installed script yourself: from your own shell (no tokens at all), or with Claude Code's `!` prefix (only the short output joins the conversation):

```
!node ~/.claude/hooks/glowline-setup.js theme dracula
```

Files it touches:

- `~/.claude/hooks/glowline.js`, `~/.claude/hooks/glowline-setup.js`: the renderer and setup script
- `~/.claude/glowline.json`: your preferences (created on first change; kept on `remove`)
- `~/.claude/settings.json`: only the `statusLine` key
- `~/.claude/settings.json.glowline.bak`: backup from the first install
- `~/.claude/glowline.previous.json`: your old `statusLine`, if you had one

`CLAUDE_CONFIG_DIR` is respected instead of `~/.claude`.

## Customize

### Themes

`omp` (default) · `dracula` · `catppuccin` · `tokyo-night` · `nord` · `gruvbox` · `mono`

```
/glowline:setup preview          # compare all themes in the real status bar
/glowline:setup theme catppuccin
```

Outside Claude Code, `node ~/.claude/hooks/glowline.js --preview` prints every theme with sample data.

### Preferences

| Key | Values | Default |
| --- | --- | --- |
| `theme` | see above | `omp` |
| `segments` | comma list, in display order: `time,model,path,git,pr,cost,lines,effort,limits,clock,caveman` | `time,model,path,git,pr,cost,caveman` |
| `gauge` | `line` · `blocks` (`▰▰▰▱▱`) · `percent` · `off` | `line` |
| `icons` | `nerd` · `emoji` · `plain` | `nerd` |
| `separator` | `chevron` (›) · `powerline` (needs `icons nerd`) · `slash` · `dot` · `pipe` · `space` | `chevron` |
| `title` | `on` · `off` | `on` |
| `links` | `on` · `off` (Ctrl+click PR/branch; terminal must support OSC 8 links) | `on` |
| `colors.<name>` | hex without `#` (e.g. `00d7af`), or `default` | theme's |

Color names: `panel accent text muted dim folder branch cost ok bad gaugeLow gaugeMid gaugeHigh`.

Examples:

```
/glowline:setup set segments model,git,pr,limits,clock   # hide cost (screen sharing) and add usage + clock
/glowline:setup set gauge blocks
/glowline:setup set icons plain                           # no Nerd Font needed
/glowline:setup set colors.accent 00d7af
```

Or edit `~/.claude/glowline.json` directly. Unknown keys or bad values fall back to defaults, so a typo can't break the bar:

```json
{
  "theme": "tokyo-night",
  "segments": ["model", "git", "pr", "limits"],
  "gauge": "blocks",
  "colors": { "accent": "#00d7af" }
}
```

## Update

```
/plugin update glowline
```

Restart Claude Code. The new scripts are copied in automatically when the session starts; no need to run setup again, and your preferences are kept.

## Uninstall

```
/glowline:setup remove
/plugin uninstall glowline
```

## FAQ

**Does the status bar use tokens?**
No. It runs locally on your machine; redraws, refreshes, themes, and preview cost nothing. Only a `/glowline:setup …` command costs a few hundred tokens, once, when you run it, because Claude runs the script for you. Use the `!node ~/.claude/hooks/glowline-setup.js …` form (or your own terminal) to avoid even that.

**Do I run `/glowline:setup` every time?**
No, once per machine. It saves the `statusLine` entry in `settings.json`, which Claude Code reads on every start. Run it again only after `remove`, on a new machine, or if another tool replaced your status line.

**Is this a mod?**
No. It's a standard Claude Code plugin: a status line script, a SessionStart hook, a setup skill, and a color theme. Claude Code itself isn't modified, and uninstalling removes everything. (Claude Code [mods](https://code.claude.com/docs/en/plugins/mods/overview) can draw inside the UI, but still can't restyle the prompt box, so a mod wouldn't add anything here.)

**What is `CAVEMAN` in my bar?**
A badge from a different plugin, [caveman](https://github.com/JuliusBrussee/caveman), which makes Claude answer in short "caveman" style to save output tokens. Glowline only shows its mode (`CAVEMAN`, `CAVEMAN:ULTRA`, …); without caveman installed, the badge never appears. Hide it with `/glowline:setup set segments time,model,path,git,pr,cost`, or disable caveman itself in `/plugin`.

**Why is the repo ClaudeLine but the plugin `glowline`?**
Claude Code reserves plugin names starting with `claude-` for Anthropic, so the plugin needs its own name.

**Can teammates use different themes?**
Yes. Preferences live in each person's own `~/.claude/glowline.json`.

## Troubleshooting

- **Nothing shows**: run `/glowline:setup status`; run `claude --debug` to see the script's stderr.
- **Boxes instead of icons**: the terminal font is not a Nerd Font.
- **`node` not found**: install Node.js 18+ and re-run setup.
- **Branch missing for `\\wsl.localhost` paths**: git over the WSL share can exceed the 1.5 s timeout; run Claude Code inside WSL instead.

## License

MIT
