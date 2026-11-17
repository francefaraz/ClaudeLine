# ClaudeLine

> An oh-my-pi (omp) style status bar for Claude Code.

```
( ⏱ 4m › Opus › 📁 ~/project › ⎇ feature/XYZ-123 !2 ?4 › #11 › $1.20 ) ────44%────── │ ─1M─ ( 💬 Session title )
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
- A **Nerd Font** in your terminal (e.g. JetBrainsMono Nerd Font, CaskaydiaCove Nerd Font); otherwise icons show as boxes
- A true-color terminal (Windows Terminal, VS Code, iTerm2, WezTerm, Kitty, …)

## What it shows

| Segment | Source (Claude Code status line JSON) |
| --- | --- |
| Elapsed time | `cost.total_duration_ms` |
| Model | `model.display_name` |
| Folder | `workspace.current_dir`, home shortened to `~` |
| Branch `↑ahead ↓behind !changed ?untracked` | `git status` in the current folder |
| `#PR` / `!MR` | `pr.number`, once Claude Code detects an open PR/MR |
| `$cost` | `cost.total_cost_usd` (estimate at list price) |
| Context gauge + window size | `context_window.used_percentage`, `context_window_size`; bright red at ≥85% |
| Session title | `session_name`; trimmed or hidden on narrow terminals |
| `CAVEMAN` badge | Only when the caveman plugin is active |

The bar stretches to the terminal width (`COLUMNS`) and refreshes every 15 s.

## How it works

```
plugin (this repo)                         your machine
──────────────────                         ────────────
scripts/statusline.js ──setup copies──▶ ~/.claude/hooks/glowline.js
scripts/setup.js      ──setup writes──▶ ~/.claude/settings.json  "statusLine": { "command": "node …/glowline.js" }
hooks/hooks.json      ──SessionStart──▶ re-copies statusline.js after a plugin update
skills/setup/SKILL.md ── /glowline:setup [install|remove|status]
```

Claude Code runs the status line command after each message, pipes session JSON to it on stdin, and shows what it prints.

## Commands

| Command | Effect |
| --- | --- |
| `/glowline:setup` | Install (copy script, set `statusLine`, back up settings) |
| `/glowline:setup status` | Show what is configured |
| `/glowline:setup remove` | Restore your previous `statusLine` (or remove ours) and delete the copied script |

Files it touches:

- `~/.claude/hooks/glowline.js`: the renderer
- `~/.claude/settings.json`: only the `statusLine` key
- `~/.claude/settings.json.glowline.bak`: backup from the first install
- `~/.claude/glowline.previous.json`: your old `statusLine`, if you had one

`CLAUDE_CONFIG_DIR` is respected instead of `~/.claude`.

## Customize

Edit the `C` (colors) and `G` (Nerd Font icons) blocks at the top of `scripts/statusline.js`. To make a local tweak survive plugin updates, uninstall the plugin and keep the copy in `~/.claude/hooks/`.

## Uninstall

```
/glowline:setup remove
/plugin uninstall glowline
```

## Troubleshooting

- **Nothing shows**: run `/glowline:setup status`; run `claude --debug` to see the script's stderr.
- **Boxes instead of icons**: the terminal font is not a Nerd Font.
- **`node` not found**: install Node.js 18+ and re-run setup.
- **Branch missing for `\\wsl.localhost` paths**: git over the WSL share can exceed the 1.5 s timeout; run Claude Code inside WSL instead.

## License

MIT
