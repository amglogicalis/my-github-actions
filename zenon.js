const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

// =============================================================================
// PASO 2: Autoentrenamiento y Aprendizaje Contextual (Caché & Grounding)
// =============================================================================
const CACHE_FILE = path.join(process.cwd(), '.zenon_cache.json');

// Calcula una firma SHA-256 del estado actual del repositorio
function computeFingerprint(files) {
  const fileData = files.map(file => {
    try {
      const stats = fs.statSync(file);
      return `${file}:${stats.size}:${stats.mtimeMs}`;
    } catch (e) {
      return `${file}:0:0`;
    }
  }).sort().join('|');

  return crypto.createHash('sha256').update(fileData).digest('hex');
}

// Asegura que .zenon_cache.json esté registrado en el .gitignore local
function ensureGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');
  try {
    let content = '';
    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8');
    }
    if (!content.includes('.zenon_cache.json')) {
      const separator = content.endsWith('\n') || content === '' ? '' : '\n';
      fs.appendFileSync(gitignorePath, `${separator}.zenon_cache.json\n`, 'utf8');
      console.log('ℹ️  Agregado .zenon_cache.json al archivo .gitignore');
    }
  } catch (e) {
    // Continuar en silencio si no se puede modificar
  }
}

// =============================================================================
// PASO 3: Evolución y Multi-proveedor (Selector Inteligente y APIs externas)
// =============================================================================
// maxInputChars = límite máximo de caracteres en el prompt de usuario (≈ tokens × 4).
// Se usa para truncar automáticamente el codebase antes de enviarlo al modelo.
// Esto previene errores 413 (Groq) y 422 (Cohere) por exceso de tokens.
const PROVIDERS = {
  gemini: {
    keyName: 'ZENON_API_KEY',
    alternateKeyName: 'GEMINI_API_KEY',
    models: [
      { id: 'gemini-2.5-flash',        maxInputChars: 3000000 }, // 1M tokens
      { id: 'gemini-flash-lite-latest', maxInputChars: 1000000 }, // 256K tokens
      { id: 'gemini-3.1-flash-lite',   maxInputChars: 1000000 }, // 256K tokens
      { id: 'gemma-4-31b-it',          maxInputChars:  400000 }  // 128K tokens
    ]
  },
  groq: {
    keyName: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile',                   maxInputChars: 28000 }, // ~7K tokens (safe free tier)
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', maxInputChars: 60000 }, // ~15K tokens
      { id: 'qwen/qwen3.6-27b',                          maxInputChars: 60000 }, // ~15K tokens
      { id: 'llama-3.1-8b-instant',                      maxInputChars: 24000 }  // ~6K tokens
    ]
  },
  cohere: {
    keyName: 'COHERE_API_KEY',
    models: [
      { id: 'command-a-plus-05-2026', maxInputChars: 200000 }, // ~50K tokens (conservador)
      { id: 'command-r-plus-08-2024', maxInputChars: 500000 }, // ~128K tokens
      { id: 'command-a-03-2025',      maxInputChars: 200000 }, // ~50K tokens
      { id: 'command-r-08-2024',      maxInputChars: 500000 }  // ~128K tokens
    ]
  },
  openrouter: {
    keyName: 'OPENROUTER_API_KEY',
    models: [
      { id: 'cohere/north-mini-code:free',            maxInputChars: 200000 }, // código, gratuito
      { id: 'qwen/qwen3-coder:free',                  maxInputChars: 300000 }, // Qwen Coder gratuito
      { id: 'google/gemma-4-31b-it:free',             maxInputChars: 300000 }, // Gemma 4 gratuito
      { id: 'meta-llama/llama-3.3-70b-instruct:free', maxInputChars: 300000 }, // Llama 3.3 70B gratuito
      { id: 'google/gemini-3.1-flash-lite',           maxInputChars: 400000 }  // Gemini Lite
    ]
  }
};

// Backoff base en ms para errores 429 (se duplica en cada reintento de la cadena)
const BACKOFF_BASE_MS = 2000;

// Resuelve y agrupa las API keys configuradas en el entorno
function getAvailableKeys(cliArgs) {
  return {
    gemini: cliArgs.zenonApiKey || process.env.INPUT_ZENON_API_KEY || process.env.ZENON_API_KEY || process.env.GEMINI_API_KEY,
    groq: cliArgs.groqApiKey || process.env.INPUT_GROQ_API_KEY || process.env.GROQ_API_KEY,
    cohere: cliArgs.cohereApiKey || process.env.INPUT_COHERE_API_KEY || process.env.COHERE_API_KEY,
    openrouter: cliArgs.openrouterApiKey || process.env.INPUT_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
  };
}

// Analiza los tipos de archivos en el repositorio para inferir el stack tecnológico dominante
function analyzeRepositoryStack(files) {
  let javascript = 0;
  let python = 0;
  let go = 0;
  let devops = 0;

  for (const file of files) {
    const ext = file.split('.').pop().toLowerCase();
    const base = path.basename(file).toLowerCase();

    if (['js', 'ts', 'jsx', 'tsx', 'json'].includes(ext) || base === 'package.json') {
      javascript++;
    } else if (['py', 'ipynb'].includes(ext) || ['requirements.txt', 'pipfile', 'pyproject.toml'].includes(base)) {
      python++;
    } else if (ext === 'go' || base === 'go.mod') {
      go++;
    } else if (['yml', 'yaml', 'dockerfile'].includes(ext) || base.includes('docker-compose') || file.includes('.github/workflows')) {
      devops++;
    }
  }

  const scores = { javascript, python, go, devops };
  let dominant = 'javascript';
  let maxScore = -1;
  for (const [key, val] of Object.entries(scores)) {
    if (val > maxScore) {
      maxScore = val;
      dominant = key;
    }
  }

  return { dominant, scores };
}

// Construye una cadena priorizada de modelos ejecutables basada en los tokens disponibles y el stack
function buildExecutionChain(keys, stackInfo, totalSize) {
  const chain = [];

  // addModel ahora recibe el objeto completo {id, maxInputChars} de PROVIDERS
  const addModel = (provider, modelObj) => {
    if (keys[provider] && modelObj) {
      chain.push({ provider, model: modelObj.id, maxInputChars: modelObj.maxInputChars, apiKey: keys[provider] });
    }
  };

  // Ayudante para obtener el objeto de modelo en un índice específico de PROVIDERS
  const getModelAt = (provider, index) => {
    return PROVIDERS[provider] && PROVIDERS[provider].models[index];
  };

  // Fase 1: Modelos Insignia (Los mejores para cada tarea)
  // Siempre ponemos Gemini-2.5-Flash al principio por su ventana de contexto masiva.
  addModel('gemini', getModelAt('gemini', 0)); // gemini-2.5-flash

  // Alternamos los modelos insignia de los demás proveedores
  if (keys['cohere']) {
    addModel('cohere', getModelAt('cohere', 0)); // command-a-plus-05-2026
  }

  // Groq siempre se incluye — el prompt se truncará según maxInputChars del modelo
  if (keys['groq']) {
    addModel('groq', getModelAt('groq', 0)); // llama-3.3-70b-versatile
  }

  // Fase 2: Fallbacks de Nivel Medio (Alta disponibilidad y velocidad)
  addModel('gemini', getModelAt('gemini', 1)); // gemini-flash-lite-latest

  if (keys['cohere']) {
    addModel('cohere', getModelAt('cohere', 1)); // command-r-plus-08-2024
  }

  if (keys['groq']) {
    addModel('groq', getModelAt('groq', 1)); // llama-4-scout
  }

  if (keys['openrouter']) {
    addModel('openrouter', getModelAt('openrouter', 0)); // cohere/north-mini-code:free
    addModel('openrouter', getModelAt('openrouter', 1)); // qwen3-coder:free
  }

  // Fase 3: Fallbacks de Nivel Bajo y Último Recurso
  addModel('gemini', getModelAt('gemini', 2)); // gemini-3.1-flash-lite

  if (keys['cohere']) {
    addModel('cohere', getModelAt('cohere', 2)); // command-a-03-2025
    addModel('cohere', getModelAt('cohere', 3)); // command-r-08-2024
  }

  if (keys['groq']) {
    addModel('groq', getModelAt('groq', 2)); // qwen3.6-27b
    addModel('groq', getModelAt('groq', 3)); // llama-3.1-8b-instant
  }

  if (keys['openrouter']) {
    addModel('openrouter', getModelAt('openrouter', 2)); // gemma-4-31b-it:free
    addModel('openrouter', getModelAt('openrouter', 3)); // llama-3.3-70b-instruct:free
    addModel('openrouter', getModelAt('openrouter', 4)); // gemini-3.1-flash-lite
  }

  addModel('gemini', getModelAt('gemini', 3)); // gemma-4-31b-it

  // Filtrar duplicados en la cadena (manteniendo el primer orden de prioridad)
  const seen = new Set();
  const uniqueChain = [];
  for (const entry of chain) {
    if (entry.model) { // Evitar modelos indefinidos si el índice no existe
      const uniqueKey = `${entry.provider}:${entry.model}`;
      if (!seen.has(uniqueKey)) {
        seen.add(uniqueKey);
        uniqueChain.push(entry);
      }
    }
  }

  return uniqueChain;
}

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
    } else if ((arg === '--exclude' || arg === '-e') && i + 1 < process.argv.length) {
      args.exclude = process.argv[++i];
    } else if ((arg === '--objective' || arg === '-o') && i + 1 < process.argv.length) {
      args.objectiveFile = process.argv[++i];
    }
    // Note: --model / -d intentionally removed. Zenon selects models automatically.
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
      // Ensure that actual ignored directories are skipped, not just any part that starts with '.'
      if (parts.some(part => IGNORED_DIRS.has(part))) {
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
    // This check is refined to only skip explicit IGNORED_DIRS, not all directories starting with '.'
    if (parts.some(part => IGNORED_DIRS.has(part))) {
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

// Async sleep helper (used for exponential backoff on 429 errors)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Build the Gemini request body for a given mode
function buildRequestBody(mode, systemInstruction, prompt, model, enableGrounding = false) {
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ parts: [{ text: prompt }] }]
  };

  // Habilitar Google Search Grounding si el modelo lo soporta (gemini-*)
  if (enableGrounding && model.toLowerCase().includes('gemini')) {
    body.tools = [{ googleSearch: {} }];
  }

  if (mode.toLowerCase() === 'correct') {
    body.generationConfig = {
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

  return body;
}

// Single model call — throws with statusCode property on HTTP errors
async function callGeminiModel(apiKey, model, mode, systemInstruction, prompt, enableGrounding = false) {
  const apiBase = process.env.GEMINI_API_BASE_URL || 'https://generativelanguage.googleapis.com';
  const url = `${apiBase}/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = buildRequestBody(mode, systemInstruction, prompt, model, enableGrounding);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    const err = new Error(`Zenon AI engine error (${response.status}): ${errText}`);
    err.statusCode = response.status;
    throw err;
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

// Trunca el prompt de usuario si excede el límite del modelo, preservando el sistema intacto.
// La IA siempre recibe instrucciones completas; solo el codebase puede ser recortado.
function truncatePrompt(prompt, systemInstruction, maxInputChars) {
  if (!maxInputChars) return prompt;
  // Reservamos espacio para el systemInstruction + separador + margen de seguridad
  const sysLen = systemInstruction ? systemInstruction.length : 0;
  const BUFFER = 2000; // chars de margen para metadatos y estructura JSON del request
  const available = maxInputChars - sysLen - BUFFER;
  if (available <= 0 || prompt.length <= available) return prompt;
  const truncated = prompt.substring(0, available);
  return truncated + '\n\n⚠️  [Contenido del codebase truncado para ajustarse al límite de contexto del modelo. Los archivos más importantes están incluidos arriba.]';
}

// Llama de forma adaptativa a cualquier modelo y proveedor del catálogo
async function callProviderModel(entry, mode, systemInstruction, prompt, enableGrounding = false) {
  const { provider, model, apiKey, maxInputChars } = entry;

  // Truncar prompt si el modelo tiene un límite de contexto definido
  const safePrompt = truncatePrompt(prompt, systemInstruction, maxInputChars);
  if (safePrompt.length < prompt.length) {
    console.log(`    ✂️  Prompt truncado de ${prompt.length} a ${safePrompt.length} chars para [${provider.toUpperCase()}] ${model}`);
  }

  // 1. Google Gemini
  if (provider === 'gemini') {
    return await callGeminiModel(apiKey, model, mode, systemInstruction, safePrompt, enableGrounding);
  }

  // 2. Cohere API V2
  if (provider === 'cohere') {
    const url = 'https://api.cohere.com/v2/chat';
    const body = {
      model: model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: safePrompt }
      ]
    };
    // response_format solo para modos que requieren JSON; command-a-plus puede rechazarlo en otros modos
    if (mode.toLowerCase() === 'correct' || mode.toLowerCase() === 'objective') {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text();
      const err = new Error(`Cohere API error (${response.status}): ${text}`);
      err.statusCode = response.status;
      throw err;
    }

    const data = await response.json();
    if (data.message && data.message.content && data.message.content.length > 0) {
      return data.message.content[0].text;
    }
    throw new Error('Cohere V2 API returned an empty or invalid message content.');
  }

  // 3. Proveedores compatibles con formato OpenAI (Groq, OpenRouter)
  let apiBase = '';
  if (provider === 'groq') {
    apiBase = 'https://api.groq.com/openai/v1';
  } else if (provider === 'openrouter') {
    apiBase = 'https://openrouter.ai/api/v1';
  }

  const url = `${apiBase}/chat/completions`;
  const body = {
    model: model,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: safePrompt }
    ]
  };

  if (mode.toLowerCase() === 'correct') {
    body.response_format = { type: 'json_object' };
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/amglogicalis/my-github-actions';
    headers['X-Title'] = 'Zenon AI Assistant';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    const err = new Error(`${provider.toUpperCase()} API error (${response.status}): ${text}`);
    err.statusCode = response.status;
    throw err;
  }

  const data = await response.json();
  if (!data.choices || data.choices.length === 0) {
    throw new Error(`${provider.toUpperCase()} returned no choices in response.`);
  }

  return data.choices[0].message.content;
}

// =============================================================================
// PASO 1 y 3: Fallback Chain across Providers with Exponential Backoff
// =============================================================================
async function callWithFallback(chain, mode, systemInstruction, prompt, enableGrounding = false) {
  if (chain.length === 0) {
    throw new Error('No API keys configured. Please configure at least one of: ZENON_API_KEY, GROQ_API_KEY, COHERE_API_KEY, OPENROUTER_API_KEY.');
  }

  let lastError;

  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    const isLastModel = i === chain.length - 1;
    const modelLabel = `[${entry.provider.toUpperCase()}] ${entry.model}`;

    try {
      if (i > 0) {
        console.log(`  ↳ Intentando fallback [${i}/${chain.length - 1}]: ${modelLabel}`);
      } else {
        console.log(`  Usando modelo principal: ${modelLabel}`);
      }

      const result = await callProviderModel(entry, mode, systemInstruction, prompt, enableGrounding);
      if (i > 0) {
        console.log(`  ✅ Fallback exitoso con modelo: ${modelLabel}`);
      }
      return {
        text: result,
        provider: entry.provider,
        model: entry.model
      };

      } catch (err) {
        lastError = err;
        const statusCode = err.statusCode || 0;
        const isPayloadTooLarge = statusCode === 413 || 
                                  (statusCode === 400 && (
                                    err.message.toLowerCase().includes('context') ||
                                    err.message.toLowerCase().includes('token') ||
                                    err.message.toLowerCase().includes('limit') ||
                                    err.message.toLowerCase().includes('length') ||
                                    err.message.toLowerCase().includes('too large')
                                  )) ||
                                  err.message.toLowerCase().includes('too large') || 
                                  err.message.toLowerCase().includes('context_length_exceeded');

        if (isLastModel) {
          console.error(`  ❌ Todos los modelos del catálogo de proveedores fallaron.`);
          break;
        }

        if (isPayloadTooLarge) {
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló por límite de tamaño/tokens (413 o context limit). Saltando todos los modelos de ${entry.provider.toUpperCase()} en esta ejecución...`);
          // Remover todos los modelos futuros de este mismo proveedor de la cadena de fallback
          for (let j = chain.length - 1; j > i; j--) {
            if (chain[j].provider === entry.provider) {
              chain.splice(j, 1);
            }
          }
        } else if (statusCode === 429) {
          // Rate-limited: wait a short constant time to clear RPM slot, then try next fallback
          // Since the next model is on a different provider/quota, we do not scale wait times globally
          const delayMs = BACKOFF_BASE_MS; // Constant 2s wait
          console.warn(`  ⚠️  Modelo "${modelLabel}" superó límite de cuota (429). Esperando ${delayMs / 1000}s antes de reintentar...`);
          await sleep(delayMs);
        } else if (statusCode >= 500) {
          // Server error: switch immediately
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló con error de servidor (${statusCode}). Cambiando al siguiente de inmediato...`);
        } else {
          // Other errors: switch immediately
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló (${statusCode || 'error de red'}). Cambiando al siguiente...`);
        }
      }
  }

  throw lastError;
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
  const keys = getAvailableKeys(cliArgs);
  const mode = (cliArgs.mode || process.env.INPUT_MODE || 'assist').toLowerCase();
  const exclude = cliArgs.exclude || process.env.INPUT_EXCLUDE || '';
  const objectiveFile = cliArgs.objectiveFile || process.env.INPUT_OBJECTIVE_FILE || 'zenon_objective.md';
  const githubToken = process.env.INPUT_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const isCI = !!process.env.GITHUB_ACTIONS;

  // --- Startup diagnostics (visible in CI logs) ---
  console.log('=== Zenon startup ===');
  console.log(`Node.js      : ${process.version}`);
  console.log(`Mode         : ${mode}`);
  console.log(`Context      : ${isCI ? 'GitHub Actions CI' : 'Local Terminal'}`);
  console.log(`Keys found   : ${Object.keys(keys).filter(k => keys[k]).map(k => k.toUpperCase()).join(', ') || 'NINGUNA ❌'}`);
  console.log(`GitHub Token : ${githubToken ? 'found ✅' : 'not set (PR comments disabled)'}`);
  console.log(`Exclude      : "${exclude || '(none)'}"`);
  if (mode === 'objective') {
    console.log(`Objective    : "${objectiveFile}"`);
  }
  console.log('=====================');

  const hasAtLeastOneKey = Object.values(keys).some(Boolean);
  if (!hasAtLeastOneKey) {
    console.error('');
    console.error('❌ Ninguna API Key de proveedor está configurada.');
    console.error('   Configura al menos una de las siguientes variables de entorno:');
    console.error('     ZENON_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, COHERE_API_KEY, OPENROUTER_API_KEY');
    process.exit(1);
  }

  if (!['assist', 'correct', 'objective'].includes(mode)) {
    console.error(`❌ Modo "${mode}" no reconocido. Modos disponibles: "assist", "correct", "objective".`);
    process.exit(1);
  }

  // =============================================================================
  // PASO 4: Modo Objective — Leer el archivo de objetivos
  // =============================================================================
  let objectiveContent = '';
  if (mode === 'objective') {
    const objectivePath = path.resolve(process.cwd(), objectiveFile);
    if (!fs.existsSync(objectivePath)) {
      console.error(`❌ Archivo de objetivos no encontrado: "${objectiveFile}"`);
      console.error(`   Crea el archivo "${objectiveFile}" en la raíz del repositorio y describe el objetivo.`);
      console.error(`   O indica la ruta correcta con --objective <ruta>`);
      process.exit(1);
    }
    objectiveContent = fs.readFileSync(objectivePath, 'utf8').trim();
    if (!objectiveContent) {
      console.error(`❌ El archivo de objetivos "${objectiveFile}" está vacío. Escribe el objetivo antes de ejecutar Zenon.`);
      process.exit(1);
    }
    console.log(`🎯 Objetivo cargado desde: ${objectiveFile} (${objectiveContent.length} caracteres)`);
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

  // Analizar la pila tecnológica dominante y construir el catálogo prioritario
  const stackInfo = analyzeRepositoryStack(files);
  let totalSize = 0;
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        totalSize += fs.statSync(file).size;
      }
    } catch (e) {}
  }

  const chain = buildExecutionChain(keys, stackInfo, totalSize);
  console.log(`Dominant stack detected: ${stackInfo.dominant.toUpperCase()}`);
  console.log(`Execution chain: ${chain.map(c => `${c.provider.toUpperCase()}:${c.model}`).join(' → ')}`);
  console.log(`🤖 IA Principal elegida para tu stack: [${chain[0].provider.toUpperCase()}] ${chain[0].model}`);

  if (chain.length === 0) {
    console.error('❌ Ninguno de los proveedores configurados coincide con los modelos disponibles.');
    process.exit(1);
  }

  const engineLabel = mode === 'correct' ? 'precision' : mode === 'objective' ? 'objective' : 'analysis';
  console.log(`Total codebase size: ${(totalSize / 1024).toFixed(2)} KB | Engine: ${engineLabel} mode`);

  // Construir el payload del repositorio completo
  let codebasePayload = '';
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        codebasePayload += `--- FILE: ${file}\n${content}\n--- END OF FILE ---\n\n`;
      }
    } catch (e) {
      console.warn(`Warning: Could not read file ${file}: ${e.message}`);
    }
  }

  // =============================================================================
  // PASO 2: Autoentrenamiento y Carga de Conocimiento Contextual (Caché & Grounding)
  // =============================================================================
  const fingerprint = computeFingerprint(files);
  let cachedKnowledge = '';
  let cacheLoaded = false;

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cacheData.fingerprint === fingerprint && cacheData.knowledge) {
        cachedKnowledge = cacheData.knowledge;
        cacheLoaded = true;
        console.log('ℹ️  Cargada base de conocimiento contextual desde la caché (.zenon_cache.json)');
      }
    } catch (e) {
      console.log('ℹ️  No se pudo leer la caché o está corrupta. Iniciando re-entrenamiento...');
    }
  }

  if (!cacheLoaded) {
    console.log('🧠 Base de conocimiento no encontrada o desactualizada. Iniciando autoentrenamiento...');
    ensureGitignore();

    // El system instruction NO menciona "Google Search tool" porque:
    //  - Gemini recibe el tool real vía enableGrounding=true en el body de la API (no necesita que el prompt lo pida).
    //  - Cohere/Groq/OpenRouter no tienen ese tool y un prompt que lo mencione causa error 422/400.
    // En su lugar, todos los modelos son instruidos a usar su conocimiento entrenado, lo cual funciona universalmente.
    const trainingSystemInstruction = `You are "Zenon", a codebase architect and senior software engineer.
Your task is to analyze the user's repository files and build a comprehensive knowledge profile of the codebase.
Identify:
1. The main programming languages, packages, frameworks, and runtimes used.
2. The architectural design patterns, folder structure, entry points, and module boundaries.
3. Crucial third-party APIs, libraries, and external services integrated, with notes on their versions and usage patterns.
4. Any custom conventions, error handling mechanisms, configuration patterns, or coding styles present in the project.
5. Known risks, potential bugs, security concerns, or anti-patterns based on your engineering knowledge.

Apply your training knowledge of software engineering best practices, security guidelines, and documentation for the specific technologies found in this codebase to enrich your analysis.
Provide a clear, concise, and structured summary of your findings. This summary will be cached and used by Zenon to guide code reviews and corrections.`;

    const trainingUserPrompt = `Here are the codebase files for training:

${codebasePayload}

Analyze the codebase above. Based on the files and your engineering knowledge:
- Summarize the tech stack and architecture.
- Identify the most important patterns and conventions used.
- Flag any notable risks, known library issues, or best-practice gaps you can infer.
- Return a concise, structured knowledge profile that will help a future AI code reviewer understand this project.
Return the learned project knowledge profile now.`;

    try {
      console.log('🔍 Realizando búsquedas y autoentrenamiento...');
      // Activamos enableGrounding = true para usar Google Search durante el entrenamiento
      const trainingResult = await callWithFallback(chain, 'assist', trainingSystemInstruction, trainingUserPrompt, true);
      cachedKnowledge = trainingResult.text;
      
      // Guardar en caché
      fs.writeFileSync(CACHE_FILE, JSON.stringify({
        fingerprint: fingerprint,
        knowledge: cachedKnowledge,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
      
      console.log(`✅ Autoentrenamiento completado con éxito utilizando la IA: [${trainingResult.provider.toUpperCase()}] ${trainingResult.model}. Guardado en .zenon_cache.json`);
    } catch (err) {
      console.warn('⚠️  Error durante el autoentrenamiento:', err.message);
      console.log('Continuando con el análisis directo sin base de conocimiento...');
    }
  }

  // Prompt logic
  const isCorrectMode = mode === 'correct';
  const isObjectiveMode = mode === 'objective';

  let systemInstruction;
  let userPrompt;

  if (isObjectiveMode) {
    // ==========================================================================
    // PASO 4: Modo Objective — System Instruction y Prompt específicos
    // ==========================================================================
    systemInstruction = `You are "Zenon", a senior software engineer and AI coding assistant.
The user has given you a specific development objective to implement in their repository.
Your job is to:
1. Analyze the entire codebase to understand the existing architecture, patterns, and conventions.
2. Implement the requested objective in the most logical, optimized, and coherent way possible, respecting the existing code style.
3. Create new files or modify existing ones as needed to fully fulfill the objective.
4. Do NOT break existing functionality — all changes must be additive or safe replacements.
5. You MUST return a JSON object listing ALL files you created or modified.
6. Always return the FULL file content in the 'content' field. Do not truncate — write the entire file.
7. Do not include files that were not changed.`;

    if (cachedKnowledge) {
      systemInstruction += `\n\n=== CONTEXTO DEL REPOSITORIO (AUTOENTRENADO) ===\n${cachedKnowledge}\n================================================`;
    }

    userPrompt = `Here is the current codebase:\n\n${codebasePayload}\n\n=== OBJECTIVE ===\n${objectiveContent}\n=================\n\nImplement the objective above. Return the JSON schema with the files to create or modify.`;

    console.log('🎯 Zenon is implementing the objective...');
  } else {
    systemInstruction = `You are "Zenon", a highly capable AI assistant for code analysis and review.\nYou analyze the user's project files, find bugs, vulnerabilities, performance regressions, syntax errors, and architectural flaws, and resolve them.\nYou must adapt your output to the requested mode:\n\n${isCorrectMode ?
  `MODE: CORRECT\n  Analyze the codebase, detect bugs, poor patterns, syntax errors, or logical mistakes.\n  Provide corrected versions of the files.\n  You MUST return a JSON object listing files that need corrections.\n  Always return the FULL file content in the 'content' field. Do not truncate the code, do not add comments like '// ... rest of the file stays same'. You must provide a clean drop-in replacement.\n  Do not include files that do not need changes.`
    :
  `MODE: ASSIST\n  Analyze the codebase, detect bugs, security issues, performance bottlenecks, and design/cleanliness issues.\n  Generate a helpful and detailed Markdown report with your findings.\n  Use clear sections:\n  - 🛠️ Bugs and Functional Issues\n  - 🔒 Security Vulnerabilities\n  - ⚡ Performance Improvements\n  - 🧼 Code Cleanliness and Best Practices\n  For each recommendation, give a clear explanation and code snippets indicating how to apply it.`
}`;

    // Inyectar el conocimiento adquirido al systemInstruction principal
    if (cachedKnowledge) {
      systemInstruction += `\n\n=== APRENDIZAJE CONTEXTUAL DEL REPOSITORIO (AUTOENTRENADO) ===\n${cachedKnowledge}\n=============================================================`;
    }

    userPrompt = `Here is the codebase files:\n  \n${codebasePayload}\n\nAnalyze these files and perform the requested actions for mode: ${mode.toUpperCase()}.\n${isCorrectMode ? 'Return the files schema JSON.' : 'Return the Markdown code review report.'}`;

    console.log('Zenon is analyzing your codebase...');
  }

  try {
    // Objective mode reuses the 'correct' JSON schema (files array) for output
    const callMode = isObjectiveMode ? 'correct' : mode;
    const analysisResult = await callWithFallback(chain, callMode, systemInstruction, userPrompt);
    const rawResponse = analysisResult.text;
    console.log(`\n✅ Análisis completado con éxito utilizando la IA: [${analysisResult.provider.toUpperCase()}] ${analysisResult.model}`);

    if (isCorrectMode || isObjectiveMode) {
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

// Global safety net — catch any unhandled promise rejection or exception
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled promise rejection in Zenon:');
  console.error(reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception in Zenon:');
  console.error(err.message);
  console.error(err.stack);
  process.exit(1);
});

main();