<p align="center">
  <img src="logo.png" alt="Zenon Logo" width="220" />
  <img src="logo_polis_zenon.png" alt="Zenon Polis Logo" width="220" />
</p>

<h1 align="center">Zenon AI Assistant & Polis Ecosystem</h1>

<p align="center">
  <strong>Un motor de inteligencia artificial ultraligero y un ecosistema automatizado de CI/CD para auditoría, autocorrección y asistencia de repositorios.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18%2B-blue?style=flat-square&logo=node.js" alt="Node.js version" />
  <img src="https://img.shields.io/badge/GitHub_Actions-Compatible-purple?style=flat-square&logo=github-actions" alt="GitHub Actions compatible" />
  <img src="https://img.shields.io/badge/Zero--Dependencies-100%25-green?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/License-Proprietary-red?style=flat-square" alt="Proprietary License" />
</p>

---

## 📖 Arquitectura de la Solución

El proyecto está estructurado en dos grandes capas integradas pero conceptualmente divididas: **Zenon Principal (el Motor de Inteligencia Artificial)** y **Zenon Polis (el Ecosistema de Agentes y Automatización)**.

```mermaid
graph TD
    subgraph "Zenon Principal (Motor Core)"
        A[zenon.js] --> B[selectModelsWithAI]
        A --> C[callWithFallback]
        A --> D[.zenon_cache.json]
    end

    subgraph "Zenon Polis (Ecosistema)"
        E[Workflows GHA] --> F[GitHub Actions Especializadas]
        G[Wrappers CLI] --> H[Ejecución Local]
        
        F --> |Modo analyzer| I[Zenon Analyzer]
        F --> |Modo helper| J[Zenon Helper]
        F --> |Otros modos| K[Reviewer / Trainer / DevOpser]
        
        H --> A
        F --> A
    end
    
    style A fill:#4F46E5,stroke:#312E81,stroke-width:2px,color:#fff
    style I fill:#0D9488,stroke:#0F766E,stroke-width:1px,color:#fff
    style J fill:#D97706,stroke:#B45309,stroke-width:1px,color:#fff
```

---

## 🧠 1. Zenon Principal (Core Engine)

<p align="center">
  <img src="logo.png" alt="Zenon Principal Core Logo" width="180" />
</p>

**Zenon Principal** es el motor autónomo de inteligencia artificial implementado en un único archivo modular libre de dependencias: [zenon.js](file:///C:/mis-proyectos/Zenon/zenon.js). Es el cerebro encargado de interpretar el código, decidir qué modelos utilizar, orquestar llamadas a APIs de múltiples proveedores y realizar correcciones directas sobre los archivos del disco.

### ⚡ Características Clave de Zenon Principal

1. **Selección Inteligente de Modelos (`selectModelsWithAI`)**:
   Analiza la complejidad de la consulta del usuario antes de ejecutarla. Si se trata de una pregunta sencilla de estructura, selecciona modelos ligeros y rápidos (`gemini-flash-lite-latest`, `gpt-4o-mini`). Si es una tarea compleja de programación o refactorización masiva, prioriza modelos potentes o de razonamiento avanzado como `DeepSeek-V3.2` o `gpt-4o`.
2. **Cascada de Fallbacks Inteligente (`callWithFallback`)**:
   Si un modelo de IA sufre límites de cuota (HTTP 429) o desbordamiento físico de tokens, Zenon reintenta la llamada de forma instantánea sobre una cadena de proveedores alternativos en cascada con backoff exponencial. Soporta de forma nativa:
   * **Google Gemini** (AI Studio)
   * **Groq**
   * **Cohere**
   * **OpenRouter**
   * **SambaNova**
   * **Cerebras**
   * **GitHub Models**
3. **Autoentrenamiento e Incrementalidad**:
   Zenon genera un perfil de conocimiento y resumen del estado del repositorio mediante una firma SHA-256 en el archivo de caché local [.zenon_cache.json](file:///C:/mis-proyectos/Zenon/.zenon_cache.json). Si no hay cambios físicos en los archivos, Zenon lee directamente de esta caché ahorrando más de un 90% del consumo de tokens y acelerando el tiempo de respuesta.

---

## 🏢 2. Zenon Polis (El Ecosistema)

<p align="center">
  <img src="logo_polis_zenon.png" alt="Zenon Polis Logo" width="180" />
</p>

**Zenon Polis** es el ecosistema de automatización construido alrededor del motor core. Proporciona los envoltorios de consola (CLI wrappers) para desarrolladores locales, y las GitHub Actions compuestas que actúan como "agentes" o "pipelines" automatizados en los workflows de integración continua (CI).

### 🛠️ Módulos y Funciones de Zenon Polis

Los siguientes agentes y herramientas especializadas están implementados dentro de la suite de Zenon Polis:

#### 📊 Zenon Analyzer
<p align="left">
  <img src="logo_zenon_analyzer.png" alt="Zenon Analyzer Logo" width="80" align="left" style="margin-right: 15px;" />
  Es el módulo encargado de compilar, trackear y visualizar las estadísticas acumuladas de llamadas a las APIs de IA. Lee del archivo de caché, muestra métricas agregadas de tokens y estima el porcentaje de consumo frente a los límites gratuitos de los planes de cada proveedor.
</p>
<br />

* **Salida Visual**: Genera un informe Markdown interactivo que incluye un gráfico circular dinámico en formato Mermaid detallando el uso por proveedor.
* **Comando CLI**: `--mode analyzer` (Acepta el flag adicional `--reset-stats` para vaciar los contadores).
* **Acción GHA**: [.github/actions/analyzer/action.yml](file:///C:/mis-proyectos/Zenon/.github/actions/analyzer/action.yml).

#### 🤖 Zenon Helper
<p align="left">
  <img src="logo_zenon_helper.png" alt="Zenon Helper Logo" width="80" align="left" style="margin-right: 15px;" />
  Es el asistente interactivo del repositorio. Responde en lenguaje natural a preguntas del desarrollador sobre la arquitectura, funcionamiento o dependencias del código.
</p>
<br />

* **Búsqueda en Vivo (Grounding)**: Para evitar que la caché se desactualice si el usuario pregunta por archivos creados recientemente, realiza una búsqueda contextual en vivo buscando palabras clave dentro de los archivos del repositorio y añade los fragmentos coincidentes como contexto fresco en la consulta a la IA.
* **Comando CLI**: `--mode helper --topic "Tu pregunta aquí"`
* **Acción GHA**: [.github/actions/helper/action.yml](file:///C:/mis-proyectos/Zenon/.github/actions/helper/action.yml).

#### 🔍 Reviewer, Trainer & DevOpsers
<p align="center">
  <img src="logo_zenon_reviewer.png" alt="Reviewer" width="70" />
  <img src="logo_zenon_trainer.png" alt="Trainer" width="70" />
  <img src="logo_zenon_DevOpser.png" alt="DevOpser" width="70" />
  <img src="logo_zenon_updater.png" alt="Updater" width="70" />
  <img src="logo_zenon_tester.png" alt="Tester" width="70" />
</p>

* **Reviewer** (`--mode reviewer`): Analiza las diferencias del código (`git diff`) y publica reportes técnicos con sugerencias y bugs detectados directamente en los Pull Requests de GitHub.
* **Trainer** (`--mode trainer --topic "..."`): Utiliza el grounding de búsqueda de Google Search para actualizar la base de conocimientos con especificaciones técnicas actuales y documentación fresca en la caché.
* **DevOpser/Updater/Tester** (`--mode correct` / `--mode objective`): Agentes encargados de modificar código físico en disco, autogenerar tests unitarios y hacer commits automáticos para cumplir con los objetivos técnicos especificados en Markdown.

---

## 🚀 Guía de Uso de las Funciones

### Uso en Local (Terminal)

Utiliza los wrappers CLI [zenon.ps1](file:///C:/mis-proyectos/Zenon/zenon.ps1) (Windows PowerShell) o [zenon.sh](file:///C:/mis-proyectos/Zenon/zenon.sh) (Linux/macOS) para lanzar las tareas:

```powershell
# 1. Ejecutar una auditoría general del repositorio (Modo Assist)
.\zenon.ps1 --mode assist

# 2. Consultar dudas al asistente del código (Modo Helper)
.\zenon.ps1 --mode helper --topic "¿Cómo funciona el sistema de fallbacks de proveedores?"

# 3. Ver las estadísticas acumuladas de consumo de tokens y llamadas (Modo Analyzer)
.\zenon.ps1 --mode analyzer

# 4. Poner a cero el contador de estadísticas
.\zenon.ps1 --mode analyzer --reset-stats

# 5. Ejecutar la autocorrección automática de bugs en caliente (Modo Correct)
.\zenon.ps1 --mode correct

# 6. Cumplir un objetivo técnico leyendo un archivo Markdown (Modo Objective)
.\zenon.ps1 --mode objective --objective .\zenon_objective.md

# 7. Entrenar a Zenon en una librería o API usando Google Search (Modo Trainer)
.\zenon.ps1 --mode trainer --topic "Next.js 15 App Router routing conventions"
```

### Uso en GitHub Actions (Flujos CI/CD)

Puedes definir workflows independientes en tu carpeta `.github/workflows/` para ejecutar los módulos de Zenon Polis de manera automatizada:

* **Workflow de Asistencia (Helper)**: [zenon-helper.yml](file:///C:/mis-proyectos/Zenon/.github/workflows/zenon-helper.yml)
* **Workflow de Estadísticas (Analyzer)**: [zenon-analyzer.yml](file:///C:/mis-proyectos/Zenon/.github/workflows/zenon-analyzer.yml)

---

## 📥 Entradas y Configuración

| Parámetro | Descripción | Requerido | Por Defecto |
| :--- | :--- | :---: | :--- |
| `zenon-api-key` | API Key para Gemini (AI Studio). | **Sí** | — |
| `groq-api-key` | API Key para Groq (Opcional). | No | — |
| `cohere-api-key` | API Key para Cohere (Opcional). | No | — |
| `openrouter-api-key`| API Key para OpenRouter (Opcional). | No | — |
| `samba-api-key` | API Key para SambaNova (Opcional). | No | — |
| `cerebras-api-key`  | API Key para Cerebras (Opcional). | No | — |
| `gh-models-token`   | Token personal para GitHub Models (GH_MODELS_TOKEN) (Opcional). | No | — |
| `mode` | Modo de ejecución: `assist`, `correct`, `objective`, `trainer`, `reviewer`, `analyzer` o `helper`. | No | `assist` |
| `exclude` | Rutas o archivos separados por comas que se deben excluir del análisis. | No | `""` |

---

## 💻 Cómo Cómo Exportar y Traer Zenon a otros PCs

Puedes usar todo el ecosistema de Zenon en otros ordenadores o proyectos de dos formas: **instalación local en terminal** o **integración remota como acción de GitHub**.

### A. Para Uso Local en la Terminal (Cualquier PC)

Si tienes otro ordenador y quieres usar Zenon en tus proyectos locales:

1. **Copia los archivos mínimos de Zenon**:
   Solo necesitas copiar a una carpeta de tu ordenador (por ejemplo, `C:\Herramientas\Zenon` o `/usr/local/share/zenon`):
   * [zenon.js](file:///C:/mis-proyectos/Zenon/zenon.js)
   * [zenon_models.json](file:///C:/mis-proyectos/Zenon/zenon_models.json)
   * [zenon.ps1](file:///C:/mis-proyectos/Zenon/zenon.ps1) (para Windows)
   * [zenon.sh](file:///C:/mis-proyectos/Zenon/zenon.sh) (para Linux/macOS)
2. **Configura tus credenciales**:
   Crea un archivo `.env` en la misma carpeta donde colocaste `zenon.js` con tus claves API:
   ```env
   ZENON_API_KEY=tu_clave_gemini
   GROQ_API_KEY=tu_clave_groq
   SAMBA_API_KEY=tu_clave_sambanova
   # Añade otros proveedores si lo deseas
   ```
3. **¡No copies los scripts a cada proyecto!** (Uso mediante PATH):
   No es necesario que dupliques los archivos de Zenon dentro de cada uno de tus repositorios. Puedes ejecutarlo de dos formas:
   * **Llamándolo por su ruta absoluta**:
     ```powershell
     # Desde la carpeta de cualquier otro proyecto:
     C:\Herramientas\Zenon\zenon.ps1 --mode helper --topic "Explicame este repo"
     ```
   * **Añadiendo Zenon al PATH**:
     Añade la ruta `C:\Herramientas\Zenon` (o la ruta en tu sistema operativo) al `PATH` de tu sistema. Así podrás escribir simplemente en cualquier consola de cualquier proyecto:
     ```bash
     zenon --mode assist
     ```
4. **Heredar el conocimiento acumulado (Opcional)**:
   Si quieres que Zenon no empiece de cero a analizar tu código en la nueva máquina, puedes copiar el archivo [.zenon_cache.json](file:///C:/mis-proyectos/Zenon/.zenon_cache.json) generado en tu PC anterior a la raíz del nuevo proyecto. De lo contrario, Zenon creará un nuevo archivo de caché automáticamente en su primera ejecución.

---

### B. Para Uso Remoto en GitHub Actions (Cualquier Repositorio)

Para integrar Zenon en el flujo de integración continua (CI) de cualquier otro repositorio de GitHub, haz lo siguiente:

1. **Registrar las claves en los Secrets**:
   En el repositorio destino, ve a **Settings → Secrets and variables → Actions** y añade las claves de API como secretos (ej. `ZENON_API_KEY`, `SAMBA_API_KEY`, etc.).
2. **Configurar el Workflow de GitHub**:
   Crea un archivo de configuración en `.github/workflows/zenon.yml` de tu repositorio. Puedes invocar la acción principal de Zenon directamente apuntando a este repositorio central:

```yaml
name: Zenon AI Assistant

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  run-zenon:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # 1. Recuperar caché acumulada para optimizar costes de API y mantener estadísticas del Analyzer
      - name: Restore Zenon Knowledge Cache
        uses: actions/cache@v4
        with:
          path: .zenon_cache.json
          key: zenon-knowledge-cache-${{ github.ref_name }}-${{ github.run_id }}
          restore-keys: |
            zenon-knowledge-cache-${{ github.ref_name }}-
            zenon-knowledge-cache-

      # 2. Ejecutar la Acción remota desde amglogicalis/Zenon
      - name: Run Zenon Core Action
        uses: amglogicalis/Zenon@main
        with:
          zenon-api-key: ${{ secrets.ZENON_API_KEY }}
          samba-api-key: ${{ secrets.SAMBA_API_KEY }}
          mode: 'assist'
```

3. **Ejecutar Sub-módulos Especializados de Forma Independiente**:
   Si quieres ejecutar específicamente el **Helper** o el **Analyzer** como pasos separados en tus workflows de otros repositorios, puedes invocarlos directamente indicando su sub-ruta en la acción:

* **Para llamar a Zenon Helper**:
  ```yaml
  - name: Run Zenon Helper
    uses: amglogicalis/Zenon/.github/actions/helper@main
    with:
      query: "¿Cuáles son las tecnologías dominantes en este repositorio?"
      zenon-api-key: ${{ secrets.ZENON_API_KEY }}
  ```
* **Para llamar a Zenon Analyzer**:
  ```yaml
  - name: Run Zenon Analyzer
    uses: amglogicalis/Zenon/.github/actions/analyzer@main
    with:
      reset: 'false'
  ```

---

## 🔒 Filtros de Archivos Seguros

Zenon cuida tu cuota y privacidad filtrando de forma automática:
* **Carpetas excluidas**: `.git`, `node_modules`, `dist`, `build`, `venv`, `.venv`, `.env` y similares.
* **Archivos binarios y multimedia**: Imágenes, audio, vídeo, fuentes, comprimidos (`.zip`, `.rar`) y ejecutables.
* **Límite de tamaño**: Cualquier archivo individual superior a **100 KB** se ignora para evitar sobrecargar los límites de tokens de los modelos de IA.

---

## 📄 Licencia

Este proyecto es software propietario y pertenece a **Adrián (amglogicalis)**. Todos los derechos reservados. Consulta el archivo [LICENSE](LICENSE) para más detalles sobre sus términos de uso y exclusión de fines comerciales.
