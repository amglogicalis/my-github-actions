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
      { id: 'gemini-2.5-flash',        maxInputChars: 4000000 }, // 1M tokens (4M chars)
      { id: 'gemini-flash-lite-latest', maxInputChars: 4000000 }, // 1M tokens (4M chars)
      { id: 'gemini-3.1-flash-lite',   maxInputChars: 4000000 }, // 1M tokens (4M chars)
      { id: 'gemma-4-31b-it',          maxInputChars: 1000000 }  // 256K tokens (1M chars)
    ]
  },
  groq: {
    keyName: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile',                   maxInputChars: 28000 }, // Groq RPM safety limit (~7K tokens)
      { id: 'meta-llama/llama-4-scout-17b-16e-instruct', maxInputChars: 240000 }, // Groq limits to 60K tokens (240K chars)
      { id: 'qwen/qwen3.6-27b',                          maxInputChars: 240000 }, // Groq limits to 60K tokens (240K chars)
      { id: 'llama-3.1-8b-instant',                      maxInputChars: 24000 }  // Groq RPM safety limit (~6K tokens)
    ]
  },
  cohere: {
    keyName: 'COHERE_API_KEY',
    models: [
      { id: 'command-a-plus-05-2026', maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'command-r-plus-08-2024', maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'command-a-03-2025',      maxInputChars: 1000000 }, // 256K tokens (1M chars)
      { id: 'command-r-08-2024',      maxInputChars: 500000 }  // 128K tokens (500K chars)
    ]
  },
  openrouter: {
    keyName: 'OPENROUTER_API_KEY',
    models: [
      { id: 'cohere/north-mini-code:free',            maxInputChars: 500000 }, // 256K tokens, conservative 500K chars for free tier
      { id: 'qwen/qwen3-coder:free',                  maxInputChars: 300000 }, // Free tier rate safety
      { id: 'google/gemma-4-31b-it:free',             maxInputChars: 300000 }, // Free tier rate safety
      { id: 'meta-llama/llama-3.3-70b-instruct:free', maxInputChars: 300000 }, // Free tier rate safety
      { id: 'google/gemini-3.1-flash-lite',           maxInputChars: 400000 }  // Free tier rate safety
    ]
  },
  // ===========================================================================
  // PASO 6: Nuevos Proveedores — SambaNova, Cerebras, GitHub Models
  // ===========================================================================
  samba: {
    keyName: 'SAMBA_API_KEY',
    models: [
      { id: 'DeepSeek-V3.2',               maxInputChars: 500000 }, // 128K tokens typical (500K chars)
      { id: 'gpt-oss-120b',                maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'Meta-Llama-3.3-70B-Instruct', maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'gemma-4-31B-it',              maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'MiniMax-M2.7',                maxInputChars: 500000 }  // 128K tokens typical (500K chars)
    ]
  },
  cerebras: {
    keyName: 'CEREBRAS_API_KEY',
    // max_completion_tokens OBLIGATORIO en Cerebras para evitar rate-limit por token-bucketing
    models: [
      { id: 'gpt-oss-120b', maxInputChars: 500000, max_completion_tokens: 2048 }, // 128K tokens (500K chars)
      { id: 'zai-glm-4.7',  maxInputChars: 500000, max_completion_tokens: 2048 }  // 131K tokens (500K chars)
    ]
  },
  github_models: {
    keyName: 'GH_MODELS_TOKEN',
    models: [
      { id: 'gpt-4o',                       maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'Meta-Llama-3.1-405B-Instruct', maxInputChars:  28000 }, // Llama 405B (strict 8k tokens free tier limit)
      { id: 'gpt-4o-mini',                  maxInputChars: 500000 }, // 128K tokens (500K chars)
      { id: 'Meta-Llama-3.1-8B-Instruct',  maxInputChars:  28000 }  // Llama 8B (strict 8k tokens free tier limit)
    ]
  }
};

// Backoff base en ms para errores 429 (se duplica en cada reintento de la cadena)
const BACKOFF_BASE_MS = 2000;

// Resuelve y agrupa las API keys configuradas en el entorno
function getAvailableKeys(cliArgs) {
  return {
    gemini:        cliArgs.zenonApiKey       || process.env.INPUT_ZENON_API_KEY       || process.env.ZENON_API_KEY   || process.env.GEMINI_API_KEY,
    groq:          cliArgs.groqApiKey        || process.env.INPUT_GROQ_API_KEY        || process.env.GROQ_API_KEY,
    cohere:        cliArgs.cohereApiKey      || process.env.INPUT_COHERE_API_KEY      || process.env.COHERE_API_KEY,
    openrouter:    cliArgs.openrouterApiKey  || process.env.INPUT_OPENROUTER_API_KEY  || process.env.OPENROUTER_API_KEY,
    samba:         cliArgs.sambaApiKey       || process.env.INPUT_SAMBA_API_KEY       || process.env.SAMBA_API_KEY,
    cerebras:      cliArgs.cerebrasApiKey    || process.env.INPUT_CEREBRAS_API_KEY    || process.env.CEREBRAS_API_KEY,
    github_models: cliArgs.ghModelsToken     || cliArgs.githubModelsToken             || process.env.INPUT_TOKEN_GH || process.env.TOKEN_GH || process.env.INPUT_GH_MODELS_TOKEN || process.env.GH_MODELS_TOKEN || process.env.INPUT_GITHUB_MODELS_TOKEN || process.env.GITHUB_MODELS_TOKEN
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

// =============================================================================
// PASO 6: Selector Inteligente de Modelos con BBDD (zenon_models.json)
// =============================================================================

/**
 * Carga el catalogo de modelos desde zenon_models.json.
 * Devuelve array vacio si el archivo falta o esta corrupto.
 */
function loadModelCatalog() {
  const catalogPath = path.join(__dirname, 'zenon_models.json');
  try {
    if (fs.existsSync(catalogPath)) {
      return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    }
  } catch (e) {
    console.warn('  Warning: No se pudo leer zenon_models.json. Usando cadena por defecto.');
  }
  return [];
}

/**
 * Cadena determinista de fallback — usada cuando el selector IA no esta disponible.
 * Cubre todos los proveedores en orden de prioridad y capacidad.
 */
function buildDefaultChain(keys) {
  const chain = [];
  const addModel = (provider, modelObj) => {
    if (keys[provider] && modelObj) {
      chain.push({
        provider,
        model:                 modelObj.id,
        maxInputChars:         modelObj.maxInputChars,
        max_completion_tokens: modelObj.max_completion_tokens,
        apiKey:                keys[provider]
      });
    }
  };
  const getAt = (provider, index) => PROVIDERS[provider] && PROVIDERS[provider].models[index];

  // Fase 1: Insignia — los mejores modelos de cada proveedor disponible
  addModel('gemini',        getAt('gemini', 0));        // gemini-2.5-flash (1M ctx)
  addModel('samba',         getAt('samba', 0));         // DeepSeek-V3.2
  addModel('cerebras',      getAt('cerebras', 0));      // gpt-oss-120b ultra-rapido
  addModel('github_models', getAt('github_models', 0)); // gpt-4o
  addModel('cohere',        getAt('cohere', 0));        // command-a-plus-05-2026
  addModel('groq',          getAt('groq', 0));          // llama-3.3-70b-versatile

  // Fase 2: Fallbacks de Nivel Medio
  addModel('gemini',        getAt('gemini', 1));        // gemini-flash-lite-latest
  addModel('samba',         getAt('samba', 1));         // gpt-oss-120b (samba)
  addModel('github_models', getAt('github_models', 1)); // Meta-Llama-3.1-405B
  addModel('cohere',        getAt('cohere', 1));        // command-r-plus-08-2024
  addModel('groq',          getAt('groq', 1));          // llama-4-scout
  addModel('openrouter',    getAt('openrouter', 0));    // cohere/north-mini-code:free
  addModel('openrouter',    getAt('openrouter', 1));    // qwen3-coder:free

  // Fase 3: Ultimo Recurso
  addModel('gemini',        getAt('gemini', 2));        // gemini-3.1-flash-lite
  addModel('samba',         getAt('samba', 2));         // Meta-Llama-3.3-70B (samba)
  addModel('cerebras',      getAt('cerebras', 1));      // zai-glm-4.7
  addModel('github_models', getAt('github_models', 2)); // gpt-4o-mini
  addModel('github_models', getAt('github_models', 3)); // Meta-Llama-3.1-8B
  addModel('cohere',        getAt('cohere', 2));        // command-a-03-2025
  addModel('cohere',        getAt('cohere', 3));        // command-r-08-2024
  addModel('groq',          getAt('groq', 2));          // qwen3.6-27b
  addModel('groq',          getAt('groq', 3));          // llama-3.1-8b-instant
  addModel('openrouter',    getAt('openrouter', 2));    // gemma-4-31b-it:free
  addModel('openrouter',    getAt('openrouter', 3));    // llama-3.3-70b-instruct:free
  addModel('openrouter',    getAt('openrouter', 4));    // gemini-3.1-flash-lite
  addModel('gemini',        getAt('gemini', 3));        // gemma-4-31b-it
  addModel('samba',         getAt('samba', 3));         // gemma-4-31B-it (samba)
  addModel('samba',         getAt('samba', 4));         // MiniMax-M2.7

  // Deduplicar manteniendo orden de prioridad
  const seen = new Set();
  return chain.filter(e => {
    if (!e.model) return false;
    const k = e.provider + ':' + e.model;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Modelos fijos ligeros usados UNICAMENTE para la fase de seleccion inteligente.
 * Son rapidos y baratos; su unica tarea es elegir la cadena optima del catalogo.
 */
const SELECTOR_MODELS = [
  { provider: 'gemini',        model: 'gemini-3.1-flash-lite' },
  { provider: 'groq',          model: 'llama-3.1-8b-instant'  },
  { provider: 'github_models', model: 'gpt-4o-mini'           }
];

/**
 * Convierte una seleccion de IA al formato interno de cadena de callWithFallback.
 */
function buildChainFromSelection(selection, keys) {
  const chain = [];
  const seen  = new Set();

  for (const item of selection) {
    const { provider, api_model_id } = item;
    if (!provider || !api_model_id || !keys[provider]) continue;
    const uniqueKey = provider + ':' + api_model_id;
    if (seen.has(uniqueKey)) continue;

    const providerData = PROVIDERS[provider];
    if (!providerData) continue;
    const modelObj = providerData.models.find(m => m.id === api_model_id);
    if (!modelObj) continue;

    seen.add(uniqueKey);
    chain.push({
      provider,
      model:                 api_model_id,
      maxInputChars:         modelObj.maxInputChars,
      max_completion_tokens: modelObj.max_completion_tokens,
      apiKey:                keys[provider]
    });
  }
  return chain;
}

/**
 * Selector inteligente: llama a un modelo ligero para que analice el contexto
 * del repo y elija la cadena optima consultando zenon_models.json.
 * Devuelve null si el selector falla (el caller usa buildDefaultChain).
 */
async function selectModelsWithAI(keys, stackInfo, mode, totalSize) {
  // Sub-cadena del selector con los modelos fijos disponibles
  const selectorChain = SELECTOR_MODELS
    .filter(s => keys[s.provider])
    .map(s => {
      const providerData = PROVIDERS[s.provider];
      if (!providerData) return null;
      const modelObj = providerData.models.find(m => m.id === s.model);
      if (!modelObj) return null;
      return {
        provider:              s.provider,
        model:                 s.model,
        maxInputChars:         modelObj.maxInputChars,
        max_completion_tokens: modelObj.max_completion_tokens,
        apiKey:                keys[s.provider]
      };
    })
    .filter(Boolean);

  if (selectorChain.length === 0) return null;

  const catalog = loadModelCatalog();
  if (catalog.length === 0) return null;

  // Solo incluir modelos de proveedores con key configurada
  const availableProviders = Object.keys(keys).filter(p => keys[p]);
  const availableModels = catalog
    .map(entry => ({
      model_id:       entry.model_id,
      description:    entry.description,
      specialization: entry.specialization,
      providers:      (entry.providers || []).filter(p => availableProviders.includes(p.provider))
    }))
    .filter(entry => entry.providers.length > 0);

  if (availableModels.length === 0) return null;

  const sizeMB    = (totalSize / 1048576).toFixed(2);
  const sizeLabel = totalSize > 500000 ? 'MUY GRANDE (>500KB)'
                  : totalSize > 100000 ? 'GRANDE (>100KB)'
                  : totalSize > 30000  ? 'MEDIO (>30KB)'
                  : 'PEQUENO (<30KB)';

  const modeDesc = mode === 'correct'   ? 'correccion automatica de bugs, salida JSON estructurada'
                 : mode === 'objective' ? 'implementacion de objetivo de desarrollo, salida JSON estructurada'
                 : 'revision de codigo, produce informe Markdown';

  const selectorSystemInstruction =
    'Eres el motor de seleccion de modelos de IA de Zenon, una herramienta de analisis de codigo. ' +
    'Tu UNICA tarea es seleccionar la lista ordenada de mejores modelos para una tarea concreta. ' +
    'Devuelve SOLO JSON valido. Sin explicaciones. Sin markdown.';

  const selectorPrompt =
    'Selecciona los 4-5 mejores modelos del catalogo disponible para esta tarea:\n\n' +
    'CONTEXTO DE TAREA:\n' +
    '- Modo: "' + mode + '" -- ' + modeDesc + '\n' +
    '- Stack dominante: ' + stackInfo.dominant.toUpperCase() + '\n' +
    '- Tamano del codebase: ' + sizeMB + ' MB (' + sizeLabel + ')\n\n' +
    'MODELOS DISPONIBLES (solo estos tienen API keys configuradas):\n' +
    JSON.stringify(availableModels, null, 2) + '\n\n' +
    'REGLAS DE SELECCION:\n' +
    '1. Para modo "correct" u "objective": prioriza modelos con especializacion "code" o "reasoning"\n' +
    '2. Para codebases GRANDES o MUY GRANDES (>100KB): prioriza providers con maxInputChars mas alto\n' +
    '3. El primer modelo de la cadena debe ser el mas capaz disponible\n' +
    '4. Incluye modelos de al menos 2 providers diferentes para resilencia\n' +
    '5. No repitas el mismo par provider+api_model_id\n\n' +
    'Devuelve SOLO este JSON (sin markdown, sin explicacion):\n' +
    '{\n' +
    '  "chain": [\n' +
    '    { "provider": "<nombre_provider>", "api_model_id": "<api_model_id_del_catalogo>" },\n' +
    '    { "provider": "<nombre_provider>", "api_model_id": "<api_model_id_del_catalogo>" }\n' +
    '  ]\n' +
    '}';

  try {
    const selLabel = selectorChain[0].provider.toUpperCase() + '/' + selectorChain[0].model;
    console.log('  🧠 Selector IA ejecutandose con: ' + selLabel);
    const result = await callWithFallback(selectorChain, 'assist', selectorSystemInstruction, selectorPrompt);
    const parsed = extractJSON(result.text);
    if (parsed && Array.isArray(parsed.chain) && parsed.chain.length > 0) {
      const chainStr = parsed.chain.map(m => m.provider + '/' + m.api_model_id).join(' -> ');
      console.log('  ✅ Seleccion IA: ' + parsed.chain.length + ' modelos -> ' + chainStr);
      return parsed.chain;
    }
    console.warn('  ⚠️  Selector IA devolvio JSON invalido. Usando cadena por defecto...');
  } catch (err) {
    console.warn('  ⚠️  Selector IA fallo (' + err.message + '). Usando cadena por defecto...');
  }
  return null;
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

  const parts = candidate.content ? candidate.content.parts : undefined;
  if (Array.isArray(parts) && parts.length > 0) {
    const extracted = extractTextFromContent(parts[0].text);
    if (extracted) {
      return extracted;
    }
  }
  throw new Error('Gemini API returned an empty or invalid content parts.');
}

// =============================================================================
// PASO 5: Smart Token Management — per-model profiles, file-level truncation,
//         and adaptive system instruction compression.
// =============================================================================

/**
 * Context tier per model — controls instruction verbosity and truncation budget.
 * Tiers: 'large' ≥200K chars | 'medium' 50K-199K | 'small' <50K
 */
  const MODEL_PROFILES = {
    // Google Gemini
    'gemini-2.5-flash':         { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    'gemini-flash-lite-latest':  { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    'gemini-3.1-flash-lite':     { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    'google/gemini-3.1-flash-lite': { tier: 'large', maxTokens: 1048576, maxChars: 4000000 },
    // Google Gemma
    'gemma-4-31b-it':            { tier: 'large', maxTokens: 256000, maxChars: 1000000 },
    'gemma-4-31b':               { tier: 'large', maxTokens: 256000, maxChars: 1000000 },
    // OpenAI / GitHub Models
    'gpt-4o':                    { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'gpt-4o-mini':               { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'gpt-oss-120b':              { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    // Meta Llama
    'meta-llama-3.1-405b-instruct': { tier: 'medium', maxTokens: 8000, maxChars: 28000 }, // strict limit for free tier
    'meta-llama-3.1-8b-instruct':   { tier: 'small', maxTokens: 8000, maxChars: 28000 },  // strict limit for free tier
    'llama-3.1-405b-instruct':   { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'llama-3.1-8b-instant':      { tier: 'small', maxTokens: 128000, maxChars: 500000 },
    'llama-3.3-70b-versatile':   { tier: 'small', maxTokens: 131072, maxChars: 520000 },
    'meta-llama-3.3-70b-instruct': { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'meta-llama/llama-3.3-70b-instruct:free': { tier: 'medium', maxTokens: 256000, maxChars: 1000000 },
    'meta-llama/llama-4-scout-17b-16e-instruct': { tier: 'medium', maxTokens: 10000000, maxChars: 40000000 },
    // Qwen (Alibaba)
    'qwen/qwen3-coder:free':     { tier: 'medium', maxTokens: 256000, maxChars: 1000000 },
    'qwen/qwen3.6-27b':          { tier: 'medium', maxTokens: 262144, maxChars: 1050000 },
    // Cohere
    'command-a-plus-05-2026':    { tier: 'large', maxTokens: 128000, maxChars: 500000 },
    'command-r-plus-08-2024':    { tier: 'large', maxTokens: 128000, maxChars: 500000 },
    'command-a-03-2025':         { tier: 'large', maxTokens: 256000, maxChars: 1000000 },
    'command-r-08-2024':         { tier: 'large', maxTokens: 128000, maxChars: 500000 },
    'cohere/north-mini-code:free': { tier: 'medium', maxTokens: 256000, maxChars: 1000000 },
    // Cerebras
    'zai-glm-4.7':               { tier: 'medium', maxTokens: 131072, maxChars: 500000 },
    // SambaNova / OpenRouter / MiniMax
    'deepseek-v3.2':             { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'deepseek-v3-0324':          { tier: 'medium', maxTokens: 128000, maxChars: 500000 },
    'minimax-m2.7':              { tier: 'medium', maxTokens: 128000, maxChars: 500000 }
  };

  /**
   * Adapts the system instruction to the model's context tier and available tokens.
   * For models with smaller context, it removes the verbose REPORT FORMAT block
   * and can truncate further if a precise maxChars limit is known.
   */
  function adaptSystemInstruction(systemInstruction, model) {
    const modelKey = model.toLowerCase();
    const profile = MODEL_PROFILES[modelKey] || MODEL_PROFILES[model] || { tier: 'medium', maxTokens: 128000, maxChars: 500000 }; // Default profile
    if (profile.tier === 'large') return systemInstruction;

    let adapted = systemInstruction;

    // Strip the REPORT FORMAT section for small/medium context models
    if (profile.tier === 'small' || profile.tier === 'medium') {
      adapted = adapted
        .replace(/REPORT FORMAT[\s\S]*?Every code snippet must be in a fenced block with the correct language tag\./,
                 'Return a concise Markdown report with sections: Bugs, Security, Performance, Code Quality. Use bullet points. Include file paths and code snippets only for critical issues.')
        .replace(/\n{3,}/g, '\n\n'); // Collapse excess blank lines
    }

    if (profile.tier === 'small') {
      // Further compress: strip the CRITICAL RULES block header, keep only the DO NOTs
      adapted = adapted
        .replace(/CRITICAL RULES — follow without exception:\n/, '')
        .replace(/YOUR TASK:\n/, '')
        .trim();
    }

    // If a precise maxChars is defined, ensure adapted instruction fits
    if (profile.maxChars && adapted.length > profile.maxChars * 0.1) { // Reserve 10% for instruction
      adapted = adapted.substring(0, profile.maxChars * 0.1);
      console.warn(`System instruction truncated for ${model} to fit maxChars.`);
    }

    return adapted;
  }

/**
 * Smart codebase truncation: cuts at file boundaries instead of mid-content,
 * and appends a manifest of omitted files so the model knows what was excluded.
 * Uses a dynamic buffer: 8% of maxInputChars or 3000 chars, whichever is larger.
 * Approximation: 1 token ≈ 3.5 chars (conservative for code).
 */
function smartTruncateCodebase(codebasePayload, systemInstruction, maxInputChars) {
  if (!maxInputChars) return codebasePayload;

  const sysLen = systemInstruction ? systemInstruction.length : 0;
  // Calcular el tamaño del buffer como un porcentaje de maxInputChars, con un mínimo de 3000 chars.
  // Esto asegura que el buffer es proporcional al límite de contexto del modelo.
  const BUFFER_PERCENTAGE = 0.08; // 8%
  const MIN_BUFFER_CHARS = 3000;
  const BUFFER = Math.max(Math.floor(maxInputChars * BUFFER_PERCENTAGE), MIN_BUFFER_CHARS);
  const available = maxInputChars - sysLen - BUFFER;

  if (available <= 0) {
    return '⚠️  [Codebase omitido: el system instruction supera el límite de contexto del modelo.]';
  }
  if (codebasePayload.length <= available) return codebasePayload;

  // Split into individual file blocks
  const FILE_SEPARATOR = '--- FILE: ';
  const blocks = codebasePayload.split(FILE_SEPARATOR).filter(Boolean);

  let result = '';
  const omittedFiles = [];

  for (const block of blocks) {
    const fileBlock = FILE_SEPARATOR + block;
    if (result.length + fileBlock.length <= available) {
      result += fileBlock;
    } else {
      // Extract just the filename from the block header (first line)
      const filename = block.split('\n')[0].trim();
      omittedFiles.push(filename);
    }
  }

  if (omittedFiles.length > 0) {
    result += `\n\n⚠️  [TRUNCATED: The following ${omittedFiles.length} file(s) were omitted due to context limits: ${omittedFiles.join(', ')}. Focus analysis on the files provided above.]`;
  }

  return result;
}

// Ayudante ultra-defensivo para extraer texto de la respuesta de cualquier IA (String, Array o Estructura Compleja)
function extractTextFromContent(content) {
  if (content === null || content === undefined) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map(item => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'string') return item;
      if (typeof item.text === 'string') return item.text;
      if (item.text) return String(item.text);
      return '';
    }).join('').trim();
  }
  if (typeof content.text === 'string') {
    return content.text;
  }
  if (content.text) {
    return String(content.text);
  }
  return '';
}

// Llama de forma adaptativa a cualquier modelo y proveedor del catálogo
async function callProviderModel(entry, mode, systemInstruction, prompt, enableGrounding = false) {
  const { provider, model, apiKey, maxInputChars, max_completion_tokens } = entry;

  // Adapt system instruction verbosity to this model's context tier
  const adaptedInstruction = adaptSystemInstruction(systemInstruction, model);
  if (adaptedInstruction.length < systemInstruction.length) {
    const saved = systemInstruction.length - adaptedInstruction.length;
    const profile = MODEL_PROFILES[model] || { tier: 'medium' };
    console.log(`    🔧 System instruction comprimida para modelo ${profile.tier.toUpperCase()} (ahorro: ${saved} chars)`);
  }

  // Smart file-boundary truncation of the codebase payload
  const safePrompt = smartTruncateCodebase(prompt, adaptedInstruction, maxInputChars);
  if (safePrompt.length < prompt.length) {
    console.log(`    ✂️  Codebase truncado en límite de archivo: ${prompt.length} → ${safePrompt.length} chars para [${provider.toUpperCase()}] ${model}`);
  }

  // 1. Google Gemini
  if (provider === 'gemini') {
    return await callGeminiModel(apiKey, model, mode, adaptedInstruction, safePrompt, enableGrounding);
  }

  // 2. Cohere API V2
  if (provider === 'cohere') {
    const url = 'https://api.cohere.com/v2/chat';
    const body = {
      model: model,
      messages: [
        { role: 'system', content: adaptedInstruction },
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
    if (data.message && data.message.content !== undefined && data.message.content !== null) {
      const extracted = extractTextFromContent(data.message.content);
      if (extracted) {
        return extracted;
      }
    }
    throw new Error('Cohere V2 API returned an empty or invalid message content.');
  }

  // 3. Proveedores compatibles con formato OpenAI (Groq, OpenRouter, SambaNova, Cerebras, GitHub Models)
  let apiBase = '';
  if (provider === 'groq') {
    apiBase = 'https://api.groq.com/openai/v1';
  } else if (provider === 'openrouter') {
    apiBase = 'https://openrouter.ai/api/v1';
  } else if (provider === 'samba') {
    apiBase = 'https://api.sambanova.ai/v1';
  } else if (provider === 'cerebras') {
    apiBase = 'https://api.cerebras.ai/v1';
  } else if (provider === 'github_models') {
    apiBase = 'https://models.inference.ai.azure.com';
  }

  const url = `${apiBase}/chat/completions`;
  const body = {
    model: model,
    messages: [
      { role: 'system', content: adaptedInstruction },
      { role: 'user', content: safePrompt }
    ]
  };

  if (max_completion_tokens !== undefined) {
    body.max_completion_tokens = max_completion_tokens;
  }

  if (mode.toLowerCase() === 'correct' || mode.toLowerCase() === 'objective') {
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

  const content = data.choices[0].message ? data.choices[0].message.content : undefined;
  const extracted = extractTextFromContent(content);
  if (extracted) {
    return extracted;
  }
  throw new Error(`${provider.toUpperCase()} returned an empty or invalid content in message choices.`);
}

// =============================================================================
// PASO 1 y 3: Fallback Chain across Providers with Exponential Backoff
// =============================================================================
/**
 * Extracts the first valid JSON object or array from a raw string.
 * Handles markdown fences (```json ... ```) and leading/trailing garbage text.
 */
function extractJSON(raw) {
  if (!raw) return null;
  // Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleaned = fenceMatch ? fenceMatch[1].trim() : raw.trim();
  // Try direct parse first
  try { return JSON.parse(cleaned); } catch (_) {}
  // Find the outermost { ... } or [ ... ] block
  for (const [open, close] of [['{', '}'], ['[', ']']]) {
    const start = cleaned.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    for (let i = start; i < cleaned.length; i++) {
      if (cleaned[i] === open) depth++;
      else if (cleaned[i] === close) depth--;
      if (depth === 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch (_) { break; }
      }
    }
  }
  return null;
}

/**
 * Detects infinite-loop responses or repetitive structural output (e.g., repeating Markdown tables).
 * Returns true if the model is clearly stuck in a loop.
 */
function isLoopingResponse(text) {
  if (!text || text.length < 200) return false;

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 5) return false;

  // 1. Detección de repetición de líneas exactas (como antes)
  const freq = {};
  for (const line of lines) { freq[line] = (freq[line] || 0) + 1; }
  const maxFreq = Math.max(...Object.values(freq));
  if (maxFreq > 5 && (maxFreq / lines.length) > 0.4) {
    return true; // Bucle de líneas exactas
  }

  // 2. Detección de patrones repetitivos en estructuras Markdown (ej. tablas)
  // Simplificación: si encontramos un patrón de líneas que se repiten en bloques
  // y cubren una parte significativa del texto, es un bucle estructural.
  for (let i = 0; i < lines.length - 2; i++) {
    const block = lines.slice(i, i + 3).join('\n'); // Bloque de 3 líneas
    let count = 0;
    for (let j = i; j < lines.length - 2; j++) {
      if (lines.slice(j, j + 3).join('\n') === block) {
        count++;
      }
    }
    if (count > 3 && (count * 3 / lines.length) > 0.3) {
      return true; // Bucle de bloques de líneas
    }
  }

  // 3. Detección de repetición de frases consecutivas (ej. bucle en una sola línea o entre líneas)
  const normalized = text.replace(/\s+/g, ' ');
  const match = normalized.match(/(.{15,200}?)\1{3,}/);
  if (match) {
    const repeatingUnit = match[1];
    // Evitar falsos positivos con repeticiones de un solo carácter (ej. "=================")
    const isSingleChar = /^(.)\1+$/.test(repeatingUnit);
    if (!isSingleChar) {
      return true; // Bucle de frase detectado
    }
  }

  return false;
}

async function callWithFallback(chain, mode, systemInstruction, prompt, enableGrounding = false) {
  if (chain.length === 0) {
    throw new Error('No API keys configured. Please configure at least one of: ZENON_API_KEY, GROQ_API_KEY, COHERE_API_KEY, OPENROUTER_API_KEY, SAMBA_API_KEY, CEREBRAS_API_KEY, GH_MODELS_TOKEN / TOKEN_GH.');
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

      // Detect infinite-loop responses before accepting the result
      if (isLoopingResponse(result)) {
        console.warn(`  ⚠️  Modelo "${modelLabel}" devolvió una respuesta en bucle infinito. Descartando y cambiando al siguiente...`);
        lastError = new Error('Looping response detected');
        continue;
      }

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
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló con error de servidor (${statusCode}). Detalle: ${err.message}. Cambiando al siguiente de inmediato...`);
        } else {
          // Other errors: switch immediately
          console.warn(`  ⚠️  Modelo "${modelLabel}" falló (${statusCode || 'error de red'}). Detalle: ${err.message}. Cambiando al siguiente...`);
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

    const commentBody = `### <img src="https://raw.githubusercontent.com/amglogicalis/my-github-actions/main/logo.png" height="22" align="absmiddle" /> Zenon (AI Assistant) Code Review\n\n${report}`;

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
    console.error('     ZENON_API_KEY, GROQ_API_KEY, COHERE_API_KEY, OPENROUTER_API_KEY, SAMBA_API_KEY, CEREBRAS_API_KEY, GH_MODELS_TOKEN / TOKEN_GH');
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

  // Intentar la selección inteligente mediante IA primero
  const aiSelection = await selectModelsWithAI(keys, stackInfo, mode, totalSize);
  let chain = null;
  if (aiSelection) {
    chain = buildChainFromSelection(aiSelection, keys);
  }
  if (!chain || chain.length === 0) {
    chain = buildDefaultChain(keys);
  }

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
  let previousKnowledge = '';

  if (!fs.existsSync(CACHE_FILE)) {
    try {
      ensureGitignore();
      fs.writeFileSync(CACHE_FILE, JSON.stringify({
        fingerprint: '',
        knowledge: '',
        updatedAt: ''
      }, null, 2), 'utf8');
      console.log('ℹ️  Creado archivo de caché inicial (.zenon_cache.json) en la raíz del repositorio.');
    } catch (e) {
      // Ignorar fallos de inicialización silenciosamente
    }
  }

  if (fs.existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (cacheData.knowledge) {
        previousKnowledge = cacheData.knowledge;
      }
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

    let trainingUserPrompt = '';
    if (previousKnowledge) {
      console.log('🧠 Detectado conocimiento previo acumulado en la caché. Iniciando entrenamiento incremental...');
      trainingUserPrompt = `We have an existing knowledge profile for this codebase:

--- PREVIOUS KNOWLEDGE PROFILE ---
${previousKnowledge}
---------------------------------

And here is the current state of the codebase files:

${codebasePayload}

Analyze the codebase files above and compare them with the previous knowledge profile. 
Based on the current files and your engineering knowledge:
- Update, refine, and enrich the previous knowledge profile.
- Preserve correct structural patterns and architectural findings that remain valid.
- Update any tech stack descriptions, conventions, libraries, risks, or code gaps that have changed or are new.
- Return a single, updated, and consolidated codebase knowledge profile.
Return the updated project knowledge profile now.`;
    } else {
      trainingUserPrompt = `Here are the codebase files for training:

${codebasePayload}

Analyze the codebase above. Based on the files and your engineering knowledge:
- Summarize the tech stack and architecture.
- Identify the most important patterns and conventions used.
- Flag any notable risks, known library issues, or best-practice gaps you can infer.
- Return a concise, structured knowledge profile that will help a future AI code reviewer understand this project.
Return the learned project knowledge profile now.`;
    }

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
    systemInstruction = `You are Zenon, a principal-level software engineer implementing a precise development objective.

CRITICAL RULES — follow without exception:
- Do NOT introduce yourself, explain your reasoning process, or write any preamble. Start working immediately.
- Do NOT hallucinate APIs, libraries, or patterns that do not exist in the codebase.
- Do NOT truncate file content — every 'content' field must contain the complete, production-ready file.
- Do NOT include files that were not changed.
- Preserve all existing code style, naming conventions, and architectural patterns exactly.
- All changes must be additive or safe drop-in replacements — never break existing functionality.

YOUR TASK:
1. Read the codebase to understand architecture, frameworks, conventions, and dependencies.
2. Implement the objective completely and correctly in the fewest, most precise changes possible.
3. Return ONLY the raw JSON schema — no markdown fences, no explanation, no commentary.`;

    if (cachedKnowledge) {
      systemInstruction += `\n\n=== CONTEXTO DEL REPOSITORIO (AUTOENTRENADO) ===\n${cachedKnowledge}\n================================================`;
    }

    userPrompt = `=== CODEBASE ===
${codebasePayload}

=== OBJECTIVE TO IMPLEMENT ===
${objectiveContent}

Implement the objective fully. Return ONLY the raw JSON (no markdown, no explanation) with this exact schema:
{
  "files": [
    { "path": "relative/path/to/file", "content": "<complete file content>", "reason": "<one-line explanation>" }
  ]
}`;

    console.log('🎯 Zenon is implementing the objective...');
  } else {
    systemInstruction = isCorrectMode
      ? `You are Zenon, a principal-level software engineer performing automated code correction.

CRITICAL RULES — follow without exception:
- Do NOT introduce yourself, explain your approach, or write any preamble. Return JSON immediately.
- Do NOT hallucinate fixes — only correct real, demonstrable bugs, errors, or security flaws.
- Do NOT truncate file content — every 'content' field must be the complete, corrected, production-ready file.
- Do NOT include files that require no changes.
- Do NOT add comments like "// ... rest stays the same" — write the full file every time.
- Preserve all existing formatting, naming conventions, and architectural patterns.
- Return ONLY raw JSON — no markdown fences, no explanation text, no commentary outside the JSON.`
      : `You are Zenon, a principal-level software engineer performing a deep technical code review.

CRITICAL RULES — follow without exception:
- Do NOT introduce yourself, explain your process, or write any preamble or conclusion paragraph.
- Do NOT produce vague or generic advice. Every finding must be specific, actionable, and reference actual code.
- Do NOT hallucinate issues that don't exist in the provided files.
- Go straight to findings. Start your report with the first section heading.

REPORT FORMAT — use this exact structure in clean Markdown:

## 🛠️ Bugs & Functional Issues
| Severity | File | Line | Issue | Fix |
|----------|------|------|-------|-----|

## 🔒 Security Vulnerabilities
| Risk | File | Description | Remediation |
|------|------|-------------|-------------|

## ⚡ Performance Improvements
For each issue: describe the bottleneck, show the problematic code snippet, and provide the optimized replacement.

## 🧼 Code Quality & Best Practices
For each issue: reference the specific file/function, explain why it is a problem, and provide a corrected code snippet.

## 📊 Summary
| Category | Issues Found | Critical |
|----------|-------------|----------|

Use \`> [!WARNING]\` for critical security or data-loss risks.
Use \`> [!IMPORTANT]\`  for breaking changes or high-impact refactors.
Every code snippet must be in a fenced block with the correct language tag.`;

    // Inyectar el conocimiento adquirido al systemInstruction principal
    if (cachedKnowledge) {
      systemInstruction += `\n\n=== APRENDIZAJE CONTEXTUAL DEL REPOSITORIO (AUTOENTRENADO) ===\n${cachedKnowledge}\n=============================================================`;
    }

    userPrompt = isCorrectMode
      ? `=== CODEBASE ===
${codebasePayload}

Correct all real bugs, errors, and security flaws found. Return ONLY the raw JSON (no markdown, no explanation) with this exact schema:
{
  "files": [
    { "path": "relative/path/to/file", "content": "<complete corrected file content>", "reason": "<one-line explanation of what was fixed>" }
  ]
}`
      : `=== CODEBASE ===
${codebasePayload}

Perform a deep technical review. Return ONLY the Markdown report — no preamble, no introduction, no closing paragraph. Start directly with the first section heading.`;

    console.log('Zenon is analyzing your codebase...');
  }

  try {
    // Objective mode reuses the 'correct' JSON schema (files array) for output
    const callMode = isObjectiveMode ? 'correct' : mode;
    const analysisResult = await callWithFallback(chain, callMode, systemInstruction, userPrompt);
    const rawResponse = analysisResult.text;
    console.log(`\n✅ Análisis completado con éxito utilizando la IA: [${analysisResult.provider.toUpperCase()}] ${analysisResult.model}`);

    if (isCorrectMode || isObjectiveMode) {
      let result = extractJSON(rawResponse);
      if (!result) {
        // The model that responded could not produce valid JSON. Retry with the remaining chain.
        console.warn(`  ⚠️  El modelo [${analysisResult.provider.toUpperCase()}] ${analysisResult.model} no devolvió JSON válido. Reintentando con el resto de la cadena...`);
        const usedIndex = chain.findIndex(e => e.provider === analysisResult.provider && e.model === analysisResult.model);
        const remainingChain = usedIndex >= 0 ? chain.slice(usedIndex + 1) : [];
        if (remainingChain.length === 0) {
          console.error('Failed to parse correction response. Raw output was:');
          console.log(rawResponse.slice(0, 500));
          throw new Error('No remaining models in chain could produce valid JSON.');
        }
        const retryResult = await callWithFallback(remainingChain, callMode, systemInstruction, userPrompt);
        result = extractJSON(retryResult.text);
        if (!result) {
          console.error('Failed to parse correction response after retry. Raw output was:');
          console.log(retryResult.text.slice(0, 500));
          throw new Error('No model in the fallback chain produced valid JSON.');
        }
        console.log(`  ✅ JSON válido obtenido tras reintento con [${retryResult.provider.toUpperCase()}] ${retryResult.model}`);
      }

      if (!result.files || !Array.isArray(result.files)) {
        console.log('Zenon did not find any files that require changes.');
        if (isCI && process.env.GITHUB_STEP_SUMMARY) {
          const header = isObjectiveMode ? 'Zenon Objective Completion' : 'Zenon Auto-Correction';
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="https://raw.githubusercontent.com/amglogicalis/my-github-actions/main/logo.png" height="22" align="absmiddle" /> ${header}\n\nNo changes were found necessary for this codebase.\n`);
        }
        return;
      }

      const modifiedFiles = [];
      console.log(`Zenon proposes changes in ${result.files.length} files.`);

      for (const file of result.files) {
        const filePath = file.path;
        const newContent = file.content;
        const explanation = file.reason || file.explanation || 'No explanation provided.';

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

      console.log('\nAll changes applied to local files.');

      if (isCI) {
        // Write report to step summary
        let summaryContent = '';
        if (isObjectiveMode) {
          summaryContent = `### <img src="https://raw.githubusercontent.com/amglogicalis/my-github-actions/main/logo.png" height="22" align="absmiddle" /> Zenon Objective Completed\n\n`;
          summaryContent += `**Goal/Objective**:\n> ${objectiveContent.replace(/\n/g, '\n> ')}\n\n`;
          summaryContent += `Zenon has successfully implemented the objective by making changes to the following files:\n\n`;
        } else {
          summaryContent = `### <img src="https://raw.githubusercontent.com/amglogicalis/my-github-actions/main/logo.png" height="22" align="absmiddle" /> Zenon Auto-Correction Applied\n\n`;
          summaryContent += `Zenon has analyzed your code and applied corrections to the following files:\n\n`;
        }
        for (const file of result.files) {
          const reason = file.reason || file.explanation || 'Applied improvements';
          summaryContent += `- **${file.path}**: ${reason}\n`;
        }
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryContent);

        // Commit and push changes
        commitAndPushChanges(modifiedFiles);
      } else {
        console.log('\n[Local Mode] Changes applied. You can use "git diff" to review changes.');
        // Write a local changes report
        let localReport = '';
        if (isObjectiveMode) {
          localReport = `# Zenon Objective Implementation Report\n\n`;
          localReport += `**Goal/Objective**:\n> ${objectiveContent.replace(/\n/g, '\n> ')}\n\n`;
          localReport += `The following changes were applied to your local files to achieve the objective:\n\n`;
        } else {
          localReport = `# Zenon Auto-Corrections Report\n\nThe following changes were applied to your local files:\n\n`;
        }
        for (const file of result.files) {
          const reason = file.reason || file.explanation || 'Applied improvements';
          localReport += `## File: ${file.path}\n**Explanation**: ${reason}\n\n`;
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
          fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### <img src="https://raw.githubusercontent.com/amglogicalis/my-github-actions/main/logo.png" height="22" align="absmiddle" /> Zenon (AI Assistant) Code Review\n\n${rawResponse}`);
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