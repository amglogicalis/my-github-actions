const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

// Default exclusions
const IGNORED_EXTENSIONS = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tiff',
  // Audio/Video
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  // Archives
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2', 'xz',
  // Fonts
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  // Executables/Binaries
  'exe', 'dll', 'so', 'dylib', 'bin', 'pdf', 'docx', 'xlsx', 'pptx',
  // Lock files
  'lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'composer.lock',
  // Databases
  'db', 'sqlite', 'sqlite3', 'sqlitedb'
]);

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'venv',
  '.venv',
  'env',
  '.env',
  'target',
  'bin',
  'obj'
]);

// Helper to safely run git commands
function runGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch (err) {
    throw new Error(`Git command failed: git ${args.join(' ')}. Error: ${err.message}`);
  }
}

// Helper to parse CLI arguments (e.g. node zenon.js --mode correct)
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if ((arg === '--mode' || arg === '-m') && i + 1 < process.argv.length) {
      args.mode = process.argv[++i];
    } else if ((arg === '--model' || arg === '-d') && i + 1 < process.argv.length) {
      args.model = process.argv[++i];
    } else if ((arg === '--exclude' || arg === '-e') && i + 1 < process.argv.length) {
      args.exclude = process.argv[++i];
    }
  }
  return args;
}

// Recursively traverse directory if not a Git repository
function traverseDirectory(dir, fileList) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      const relativePath = path.relative('.', fullPath);
      const parts = relativePath.split(/[/\\]/);
      if (parts.some(part => IGNORED_DIRS.has(part) || part.startsWith('.'))) {
        continue;
      }
      traverseDirectory(fullPath, fileList);
    } else {
      const relativePath = path.relative('.', fullPath);
      fileList.push(relativePath);
    }
  }
}

// Get the files to be analyzed, prioritizing git files if in a repo
function getProjectFiles(userExcludes) {
  let files = [];
  try {
    // Check if git is initialized and working
    runGit(['status']);
    const tracked = runGit(['ls-files']).split('\n').filter(Boolean);
    const untracked = runGit(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
    files = [...new Set([...tracked, ...untracked])];
  } catch (err) {
    console.log('Not a git repository or git command failed. Traversing directory recursively...');
    traverseDirectory('.', files);
  }

  return filterFiles(files, userExcludes);
}

// Filter out binary, locked, large, and user-excluded files
function filterFiles(fileList, userExcludes) {
  const userExcludeSet = new Set(
    userExcludes ? userExcludes.split(',').map(s => s.trim().replace(/\\/g, '/')) : []
  );

  return fileList.filter(file => {
    const normFile = file.replace(/\\/g, '/');
    const parts = normFile.split('/');
    
    // Skip ignored directories (e.g. node_modules, .git)
    if (parts.some(part => IGNORED_DIRS.has(part) || (part.startsWith('.') && part !== '.' && part !== '..'))) {
      return false;
    }

    // Skip ignored extensions
    const ext = normFile.split('.').pop().toLowerCase();
    if (IGNORED_EXTENSIONS.has(ext)) {
      return false;
    }

    // Skip minified files
    if (normFile.includes('.min.')) {
      return false;
    }

    // Skip user excludes
    if (userExcludeSet.has(normFile) || Array.from(userExcludeSet).some(pattern => normFile.includes(pattern))) {
      return false;
    }

    // Read details and check if binary / oversized
    try {
      if (!fs.existsSync(file)) return false;
      const stats = fs.statSync(file);
      if (stats.size > 102400) { // Limit to 100KB per file
        return false;
      }

      // Read a chunk to inspect for null bytes (binary file check)
      const buffer = Buffer.alloc(512);
      const fd = fs.openSync(file, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
      fs.closeSync(fd);
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return false;
        }
      }
    } catch (e) {
      return false;
    }

    return true;
  });
}

async function callGemini(apiKey, model, mode, systemInstruction, prompt) {
  const apiBase = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';
  const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ]
  };

  const isCorrectMode = mode.toLowerCase() === 'correct';
  if (isCorrectMode) {
    requestBody.generationConfig = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          files: {
            type: 'ARRAY',
            description: 'List of files that require correction or improvements.',
            items: {
              type: 'OBJECT',
              properties: {
                path: {
                  type: 'STRING',
                  description: 'The relative path of the file to modify.'
                },
                content: {
                  type: 'STRING',
                  description: 'The complete, corrected content of the file. Do not truncate. You must write the full file contents.'
                },
                explanation: {
                  type: 'STRING',
                  description: 'A brief explanation of what was changed and why.'
                }
              },
              required: ['path', 'content']
            }
          }
        },
        required: ['files']
      }
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Zenon AI engine error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('No response candidates returned. The request may have been blocked by safety filters.');
  }

  const candidate = data.candidates[0];
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    console.warn(`Warning: Generation completed with reason: ${candidate.finishReason}`);
  }

  return candidate.content.parts[0].text;
}

// Send PR comment on GitHub
async function postPRComment(report, token) {
  if (!token) {
    console.log('No GitHub Token provided. Skipping PR comment.');
    return;
  }
  
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) {
    console.log('No GITHUB_EVENT_PATH found. Skipping PR comment.');
    return;
  }

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
    const prNumber = event.pull_request ? event.pull_request.number : null;
    
    if (!prNumber) {
      console.log('Event is not a Pull Request. Skipping PR comment.');
      return;
    }

    const repo = process.env.GITHUB_REPOSITORY;
    const apiUrl = process.env.GITHUB_API_URL || 'https://api.github.com';
    const url = `${apiUrl}/repos/${repo}/issues/${prNumber}/comments`;

    const commentBody = `### 🤖 Zenon (AI Assistant) Code Review\n\n${report}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Zenon-AI-Assistant',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ body: commentBody })
    });

    if (response.ok) {
      console.log(`Successfully posted code analysis report to PR #${prNumber}`);
    } else {
      const errText = await response.text();
      console.error(`Failed to post PR comment (${response.status}): ${errText}`);
    }
  } catch (err) {
    console.error('Error posting PR comment:', err);
  }
}

// Commit and push changes back in CI
function commitAndPushChanges(modifiedFiles) {
  try {
    console.log('Configuring git credentials...');
    runGit(['config', '--local', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
    runGit(['config', '--local', 'user.name', 'github-actions[bot]']);

    // Stage changes
    for (const file of modifiedFiles) {
      console.log(`Staging: ${file}`);
      runGit(['add', file]);
    }

    // Verify if there are staged differences
    const staged = runGit(['diff', '--name-only', '--cached']);
    if (!staged) {
      console.log('No changes were staged. Nothing to commit.');
      return;
    }

    console.log('Committing changes...');
    runGit(['commit', '-m', 'Zenon: Auto-corrections and improvements']);

    console.log('Pushing changes...');
    runGit(['push']);
    console.log('Successfully committed and pushed corrections to the repository!');
  } catch (err) {
    console.error('Error committing and pushing changes:', err.message);
    console.log('Please ensure the GitHub Action has write permissions in your workflow configuration (e.g. "permissions: contents: write").');
  }
}

// Main function
async function main() {
  const cliArgs = parseArgs();
  
  // Resolve configurations prioritizing CLI args over GHA Inputs over Env Vars
  const apiKey = cliArgs.apiKey || process.env.INPUT_ZENON_API_KEY || process.env.ZENON_API_KEY || process.env.GEMINI_API_KEY;
  const mode = (cliArgs.mode || process.env.INPUT_MODE || 'assist').toLowerCase();
  const exclude = cliArgs.exclude || process.env.INPUT_EXCLUDE || '';
  const githubToken = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const isCI = !!process.env.GITHUB_ACTIONS;

  // Auto-select the best model for each task (no user input needed)
  // Assist: lighter & faster model — ideal for reading and explaining code
  // Correct: smarter model — better reasoning for rewriting and fixing code
  const model = mode === 'correct' ? 'gemini-2.5-flash' : 'gemini-1.5-flash';

  if (!apiKey) {
    console.error('Error: ZENON_API_KEY is not defined. Please configure it as a repository secret named ZENON_API_KEY.');
    process.exit(1);
  }

  if (mode !== 'assist' && mode !== 'correct') {
    console.error(`Error: Invalid mode "${mode}". Supported modes are "assist" and "correct".`);
    process.exit(1);
  }

  console.log(`Zenon starting...`);
  console.log(`Mode: ${mode}`);
  console.log(`Context: ${isCI ? 'GitHub Actions CI' : 'Local Terminal'}`);

  console.log('Scanning repository for code files...');
  const files = getProjectFiles(exclude);
  console.log(`Found ${files.length} code files to analyze.`);

  if (files.length === 0) {
    console.log('No suitable code files found for analysis. Exiting.');
    return;
  }

  // Build the code payload
  let codebasePayload = '';
  let totalSize = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      codebasePayload += `--- FILE: ${file}\n${content}\n--- END OF FILE ---\n\n`;
      totalSize += content.length;
    } catch (e) {
      console.warn(`Warning: Could not read file ${file}: ${e.message}`);
    }
  }

  console.log(`Total codebase size: ${(totalSize / 1024).toFixed(2)} KB | Engine: ${mode === 'correct' ? 'precision' : 'analysis'} mode`);

  // Prompt logic
  const isCorrectMode = mode === 'correct';
  
  const systemInstruction = `You are "Zenon", a highly capable AI assistant for code analysis and review.
You analyze the user's project files, find bugs, vulnerabilities, performance regressions, syntax errors, and architectural flaws, and resolve them.
You must adapt your output to the requested mode:

${isCorrectMode ? 
  `MODE: CORRECT
  Analyze the codebase, detect bugs, poor patterns, syntax errors, or logical mistakes.
  Provide corrected versions of the files.
  You MUST return a JSON object listing files that need corrections.
  Always return the FULL file content in the 'content' field. Do not truncate the code, do not add comments like '// ... rest of the file stays same'. You must provide a clean drop-in replacement.
  Do not include files that do not need changes.`
  : 
  `MODE: ASSIST
  Analyze the codebase, detect bugs, security issues, performance bottlenecks, and design/cleanliness issues.
  Generate a helpful and detailed Markdown report with your findings.
  Use clear sections:
  - 🛠️ Bugs and Functional Issues
  - 🔒 Security Vulnerabilities
  - ⚡ Performance Improvements
  - 🧼 Code Cleanliness and Best Practices
  For each recommendation, give a clear explanation and code snippets indicating how to apply it.`
}`;

  const userPrompt = `Here is the codebase files:
  
${codebasePayload}

Analyze these files and perform the requested actions for mode: ${mode.toUpperCase()}.
${isCorrectMode ? 'Return the files schema JSON.' : 'Return the Markdown code review report.'}`;

  console.log('Zenon is analyzing your codebase...');
  
  try {
    const rawResponse = await callGemini(apiKey, model, mode, systemInstruction, userPrompt);
    console.log('Analysis complete.');

    if (isCorrectMode) {
      let result;
      try {
        result = JSON.parse(rawResponse);
      } catch (parseErr) {
        console.error('Failed to parse correction response. Raw output was:');
        console.log(rawResponse);
        throw new Error('Response was not valid JSON: ' + parseErr.message);
      }

      if (!result.files || !Array.isArray(result.files)) {
        console.log('Zenon did not find any files that require corrections.');
        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### 🤖 Zenon Auto-Correction\n\nNo corrections were found necessary for this codebase.\n');
        }
        return;
      }

      const modifiedFiles = [];
      console.log(`Zenon proposes corrections in ${result.files.length} files.`);

      for (const file of result.files) {
        const filePath = file.path;
        const newContent = file.content;
        const explanation = file.explanation || 'No explanation provided.';

        console.log(`\nApplying changes to: ${filePath}`);
        console.log(`Reason: ${explanation}`);

        // Ensure parent directories exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the file
        fs.writeFileSync(filePath, newContent, 'utf8');
        modifiedFiles.push(filePath);
      }

      console.log('\nAll corrections applied to local files.');

      if (isCI) {
        // Write report to step summary
        let summaryContent = `### 🤖 Zenon Auto-Correction Applied\n\nZenon has analyzed your code and applied corrections to the following files:\n\n`;
        for (const file of result.files) {
          summaryContent += `- **${file.path}**: ${file.explanation || 'Applied improvements'}\n`;
        }
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);

        // Commit and push changes
        commitAndPushChanges(modifiedFiles);
      } else {
        console.log('\n[Local Mode] Corrections applied. You can use "git diff" to review changes.');
        // Write a local changes report
        let localReport = `# Zenon Auto-Corrections Report\n\nThe following changes were applied to your local files:\n\n`;
        for (const file of result.files) {
          localReport += `## File: ${file.path}\n**Explanation**: ${file.explanation || 'Applied improvements'}\n\n`;
        }
        fs.writeFileSync('zenon_report.md', localReport, 'utf8');
        console.log('Details written to zenon_report.md');
      }

    } else {
      // Assist mode: Markdown review report
      console.log('\n--- Zenon Code Review Summary ---\n');
      console.log(rawResponse);
      console.log('\n----------------------------------\n');

      if (isCI) {
        // Write report to GHA Job Summary
        if (process.env.GITHUB_STEP_SUMMARY) {
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🤖 Zenon (AI Assistant) Code Review\n\n${rawResponse}`);
        }

        // Post comment to PR if event is PR
        const eventName = process.env.GITHUB_EVENT_NAME;
        if (eventName === 'pull_request' || eventName === 'pull_request_target') {
          await postPRComment(rawResponse, githubToken);
        }
      } else {
        // Write locally to zenon_report.md
        fs.writeFileSync('zenon_report.md', rawResponse, 'utf8');
        console.log('Full report written to zenon_report.md');
      }
    }

  } catch (err) {
    console.error('Error during execution:', err.message);
    process.exit(1);
  }
}

main();
