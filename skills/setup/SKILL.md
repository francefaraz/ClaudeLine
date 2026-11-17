---
name: setup
description: Install, remove, or check the omp-style status line (writes the statusLine entry in the user's Claude Code settings.json).
argument-hint: "[install|remove|status]"
disable-model-invocation: true
---

Run exactly this command with the Bash tool, then report its output to the user in one or two lines:

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.js" $ARGUMENTS
```

With no argument it installs. Do not edit settings.json yourself; the script handles backup and restore.
If the command fails because `node` is missing, tell the user to install Node.js 18+ and retry.
