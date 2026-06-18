# 🤖 Zenon: AI Assistant GitHub Action

**Zenon** is a lightweight, zero-dependency, 100% free AI assistant for your codebases. Named Zenon, it is powered by the Gemini API (using the free tier) and designed to run both as a **GitHub Action** and a **Local CLI Tool**.

Zenon helps small or individual repositories by reviewing code quality, finding bugs, detecting security issues, and optionally rewriting the code directly on disk and pushing the fixes back to your repository.

---

## 🚀 Key Features

- **Double-mode Operation**:
  - **Assist Mode**: Analyzes code files and generates a markdown code review report (Bugs, Security, Performance, Cleanliness). In PRs, it automatically comments with its review.
  - **Correct Mode**: Directly modifies the repository files to fix syntax errors, logical bugs, and other code smell issues, creating a git commit and pushing it automatically.
- **Zero Cost**: Works entirely using Gemini's free tier (Google AI Studio) and GitHub Actions free runner minutes.
- **Zero Dependencies**: Pure Node.js script. Fast startup, no setup time, runs natively on standard runners and local machines.
- **Flexible Invocation**: Trigger automatically on GitHub events (Push, PR) or run manually from your local terminal.

---

## 🛠️ Setup (GitHub Actions)

### 1. Get a Gemini API Key
To use Zenon for free:
1. Go to [Google AI Studio](https://aistudio.google.com/).
2. Create a free API Key.
3. In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions** > **New repository secret**.
4. Add the secret with the name `GEMINI_API_KEY` and paste your key.

### 2. Configure the Workflow
Create a file at `.github/workflows/zenon.yml` in your repository:

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
        description: 'Operation Mode (assist or correct)'
        required: true
        default: 'assist'
        type: choice
        options:
          - assist
          - correct

jobs:
  zenon-assistant:
    runs-on: ubuntu-latest
    
    # REQUIRED: Grant contents and PR comment write permissions to GitHub Actions bot
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0 # Fetch all history for git diff support

      - name: Run Zenon
        uses: amglogicalis/my-github-actions@main
        with:
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          mode: ${{ github.event.inputs.mode || 'assist' }}
          model: 'gemini-1.5-flash' # Default free-tier model
```

---

## 💻 Running Locally in Your Terminal

You can run Zenon directly from your terminal to assist you during development without committing to GitHub.

### Prerequisites
- Node.js (version 18 or higher)
- Git (optional, but highly recommended for auto file filtering)

### Execution Steps
1. Set the `GEMINI_API_KEY` environment variable in your terminal:
   - **PowerShell (Windows)**:
     ```powershell
     $env:GEMINI_API_KEY="your-gemini-api-key-here"
     ```
   - **Bash (Linux/macOS)**:
     ```bash
     export GEMINI_API_KEY="your-gemini-api-key-here"
     ```

2. Run the script:
   - **Assist Mode** (Analyze and create a review report):
     ```bash
     node path/to/zenon.js --mode assist
     ```
     This prints the report in your terminal and saves a detailed markdown report at `zenon_report.md` in the current folder.

   - **Correct Mode** (Identify bugs and fix files on disk):
     ```bash
     node path/to/zenon.js --mode correct
     ```
     This automatically modifies the files in your project. You can run `git diff` afterward to review what changes Zenon applied.

### Local CLI Arguments
- `--mode` or `-m`: `assist` or `correct` (default: `assist`).
- `--model` or `-d`: Gemini model to use (default: `gemini-1.5-flash`).
- `--exclude` or `-e`: Comma-separated list of filenames or paths to ignore (e.g. `--exclude "temp.js,src/legacy/"`).

---

## ⚙️ Configuration Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `gemini-api-key` | Google AI Studio (Gemini) API Key | **Yes** | N/A |
| `mode` | `assist` (reports issues) or `correct` (directly applies fixes) | No | `assist` |
| `model` | Gemini model name | No | `gemini-1.5-flash` |
| `github-token` | GitHub token for PR comments and git push | No | `${{ github.token }}` |
| `exclude` | Comma-separated file names/paths to exclude | No | `""` |

---

## 🔒 Security and Ignored Files

To prevent leaks of secrets and avoid wasting AI tokens on unneeded files, Zenon automatically ignores:
- `.git` and `node_modules` folders.
- Typical build/dependency folders (e.g., `dist`, `build`, `venv`, `target`, `bin`).
- Large lock files (`package-lock.json`, `yarn.lock`, etc.).
- Binary formats (images, audio, video, zip files, PDFs).
- Files larger than **100 KB** (to protect rate limits and prevent minified assets analysis).
- Hidden directories starting with `.` (excluding `.github` files, etc.).
- Files that are explicitly Git-ignored (if running in a git repository).
