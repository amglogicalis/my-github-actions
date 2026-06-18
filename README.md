# 🤖 Zenon AI Assistant

**Zenon** is a lightweight, zero-dependency, 100% free AI assistant for your codebases. Designed to run as a **GitHub Action** and as a **Local CLI Tool**, Zenon helps small and individual repositories by reviewing code quality, finding bugs, and optionally rewriting the code and pushing the fixes back automatically.

---

## 🚀 Key Features

- **Two operating modes**:
  - **Assist Mode**: Reads all code files and generates a structured markdown report covering Bugs, Security, Performance, and Code Quality. In Pull Requests, Zenon posts the review as a comment automatically.
  - **Correct Mode**: Directly modifies the repository files to fix syntax errors, logical bugs, and security issues, then creates a git commit and pushes it.
- **Zero Cost**: Uses exclusively free-tier AI and GitHub Actions runner minutes.
- **Zero Dependencies**: Pure Node.js — no `npm install` required. Starts instantly.
- **Smart Model Selection**: Zenon automatically picks the right AI engine for each task — a fast model for analysis and a more capable one for code correction.
- **Flexible Invocation**: Trigger on GitHub events (Push, PR) or run from your local terminal.

---

## 🛠️ Setup (GitHub Actions)

### 1. Get a Zenon API Key
1. Go to [Google AI Studio](https://aistudio.google.com/) — it's free.
2. Create an API Key.
3. In your GitHub repository, go to **Settings → Secrets and variables → Actions → New repository secret**.
4. Add a secret named **`ZENON_API_KEY`** and paste your key.

### 2. Add the Workflow to Your Repository
Create `.github/workflows/zenon.yml` in the repo you want to analyze:

```yaml
name: Zenon AI Assistant

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
  workflow_dispatch:
    inputs:
      mode:
        description: 'Zenon Mode — "assist": analyze & report | "correct": auto-fix & commit'
        required: true
        default: 'assist'
        type: choice
        options:
          - assist
          - correct

jobs:
  zenon-assistant:
    runs-on: ubuntu-latest
    permissions:
      contents: write       # Required for Correct mode (git push)
      pull-requests: write  # Required for PR comment posting

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Zenon
        uses: amglogicalis/my-github-actions@main
        with:
          zenon-api-key: ${{ secrets.ZENON_API_KEY }}
          mode: ${{ github.event.inputs.mode || 'assist' }}
```

---

## 💻 Running Locally in Your Terminal

You can run Zenon directly from your terminal during development — no GitHub needed.

### Prerequisites
- Node.js v18 or higher
- Git (recommended, for smarter file filtering)

### Steps

1. Set the `ZENON_API_KEY` environment variable:
   - **PowerShell (Windows)**:
     ```powershell
     $env:ZENON_API_KEY="your-api-key-here"
     ```
   - **Bash (Linux/macOS)**:
     ```bash
     export ZENON_API_KEY="your-api-key-here"
     ```

2. Run Zenon pointing it at your project directory:
   ```bash
   # Assist Mode — generates zenon_report.md with the code review
   node /path/to/zenon.js --mode assist

   # Correct Mode — modifies files on disk and writes a changes summary
   node /path/to/zenon.js --mode correct
   ```

3. Review results:
   - **Assist**: output is printed to the terminal and saved to `zenon_report.md`.
   - **Correct**: files are modified in place. Use `git diff` to inspect the changes.

### Local CLI Arguments
| Flag | Description | Default |
|------|-------------|---------|
| `--mode` or `-m` | `assist` or `correct` | `assist` |
| `--exclude` or `-e` | Comma-separated paths/files to skip | `""` |

---

## ⚙️ Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `zenon-api-key` | Zenon API Key (stored as a repository secret) | **Yes** | — |
| `mode` | `assist` (report) or `correct` (auto-fix + commit) | No | `assist` |
| `github-token` | Token for PR comments and git push | No | `${{ github.token }}` |
| `exclude` | Comma-separated file names or paths to exclude | No | `""` |

> **Note**: The AI engine is selected automatically based on the mode. No manual model configuration needed.

---

## 🔒 Automatically Ignored Files

Zenon skips the following to protect secrets, respect rate limits, and avoid noise:

- `.git`, `node_modules`, `dist`, `build`, `venv`, `target` directories
- Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, etc.)
- Binary formats: images, audio, video, archives, fonts, executables
- Files over **100 KB** (e.g. minified bundles)
- Any file matching patterns passed via the `exclude` input
