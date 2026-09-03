# suqo-claude-plugin

Claude Code plugin that ships skills for building apps on top of the **SUQO SDKs**.

## What this is

This repo is a Claude Code plugin (and its own marketplace source), so it can be installed with:

```
/plugin marketplace add Code-Pros-AI/suqo-claude-plugin
/plugin install suqo-claude-plugin
```

Once installed, Claude can read the skills here to understand the SUQO SDK and use it to scaffold or build apps a developer asks for.

## Structure

```
suqo-claude-plugin/
  .claude-plugin/
    plugin.json         # plugin metadata
    marketplace.json     # marketplace source definition
  skills/
    ts-sdk-usage/         # teaches Claude how to use the SUQO TypeScript SDK
      SKILL.md
      references/         # chunked SDK API reference docs
      templates/           # boilerplate app snippets
  README.md
```

## Adding more skills

Add new skills under `skills/<skill-name>/SKILL.md` following the same pattern. Keep this repo as the single place we ship all SUQO Claude skills from — don't spin up separate plugin repos per skill.

