---
name: setup
description: Install, remove, or customize the Glowline status line (themes, segments, icons, separators, context gauge, links, colors).
argument-hint: "[install|remove|status|theme <name>|preview|set <key> <value>|config|reset|help]"
disable-model-invocation: true
---

Run exactly this command with the Bash tool, then report its output to the user briefly:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" $ARGUMENTS
```

With no argument it installs. Do not edit settings.json or glowline.json yourself; the script validates input and handles backup and restore.
If the command fails because `node` is missing, tell the user to install Node.js 18+ and retry.
