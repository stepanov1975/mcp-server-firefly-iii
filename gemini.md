# Firefly III Universal Bridge Extension - Project State (v3.0.0)

This project is an AI-agnostic bridge connecting [Firefly III](https://github.com/firefly-iii/firefly-iii) to MCP and HTTP clients.

## 🚀 Accomplishments
- **Tool coverage**: 69 tools implemented, covering the major Firefly III capabilities used by this bridge.
- **Strategic Mastery**: Advanced documentation in `docs/USE_CASES.md` providing high-level financial intelligence strategies.
- **Modular Architecture**: Professional modular structure for maximum maintainability and scalability.
- **AI-Agnostic Core**: Native support for MCP (stdio/SSE) and OpenAPI (Custom GPTs).
- **Sanitized & Secure**: Wiped Git history and environment-agnostic configuration.

## 📜 Process & Documentation Standards (INTERNAL)
1.  **Conventional Commits**: Standard prefixes used for a professional audit trail.
2.  **Full Synchronization**: 100% parity maintained across README, API, PROMPTS, and USE_CASES.
3.  **Maximum Information Density**: Detailed technical retrospectives in GitHub issues and commits.
4.  **Privacy First**: No local paths or environment details ever committed.

## 🗺️ Product Roadmap
- [x] Initial foundations and basic tools.
- [x] Full CRUD Lifecycle Management.
- [x] Currencies & System Metadata.
- [x] Automation, Rules & Webhooks.
- [x] Attachments & Advanced Insights.
- [x] Power User logic: Linking, Limits, Groups, and Split Transactions.
- [x] Official Docker Image & GitHub Actions CI/CD.

## 🛠️ Global Setup Instructions
```powershell
gemini extensions install https://github.com/stepanov1975/mcp-server-firefly-iii
```
Configure:
```powershell
gemini config set extensions.firefly-iii-universal-bridge.settings.FIREFLY_URL "http://YOUR_HOST:YOUR_PORT"
gemini config set extensions.firefly-iii-universal-bridge.settings.FIREFLY_TOKEN "YOUR_TOKEN"
```
