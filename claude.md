# Firefly III MCP Server — Claude Code Integration (v3.0.0)

## Setup

**1. Fill in your credentials in `.mcp.json`:**

```json
{
  "mcpServers": {
    "firefly-iii": {
      "command": "node",
      "args": ["./index.js"],
      "env": {
        "FIREFLY_URL": "http://YOUR_HOST:YOUR_PORT",
        "FIREFLY_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

**2. Start Claude Code from this directory:**

```powershell
claude
```

The `firefly-iii` server is auto-approved via `~/.claude/settings.json`.

## Using from other projects

Copy `.mcp.json` to any project directory, updating the `args` path to absolute:

```json
{
  "mcpServers": {
    "firefly-iii": {
      "command": "node",
      "args": ["W:/ai/firefly-iii/mcp-server/index.js"],
      "env": {
        "FIREFLY_URL": "http://YOUR_HOST:YOUR_PORT",
        "FIREFLY_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

## Verify connection

```
> get_about
```

Should return Firefly III system info and version.
