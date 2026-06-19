<p align="center">
  <img src="logo.png" alt="Zenon Logo" width="280" />
</p>

<h1 align="center">Zenon AI Assistant</h1>

<p align="center">
  <strong>Un asistente de inteligencia artificial ultraligero, modular y adaptable para análisis y corrección automática de código base.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-v18%2B-blue?style=flat-square&logo=node.js" alt="Node.js version" />
  <img src="https://img.shields.io/badge/GitHub_Actions-Compatible-purple?style=flat-square&logo=github-actions" alt="GitHub Actions compatible" />
  <img src="https://img.shields.io/badge/Zero--Dependencies-100%25-green?style=flat-square" alt="Zero Dependencies" />
  <img src="https://img.shields.io/badge/License-Proprietary-red?style=flat-square" alt="Proprietary License" />
</p>

---

## 🎯 ¿Qué es Zenon?

**Zenon** es un motor de análisis estático inteligente y agente de desarrollo autónomo integrado directamente como una **GitHub Action** o una **herramienta CLI local**. Está diseñado para auditar repositorios, sugerir mejoras, corregir bugs en caliente de forma autónoma y llevar a cabo directivas técnicas específicas descritas en lenguaje natural.

### ⚡ Características Principales

*   **Arquitectura Multi-Proveedor Adaptativa:** Conexión nativa con **Google Gemini**, **Cohere V2**, **Groq** y **OpenRouter**.
*   **Orquestación de Fallbacks Inteligente:** Si un modelo falla por cuotas (429) o límites físicos (413/422), Zenon reintenta en cascada utilizando un backoff exponencial asíncrono sobre otros proveedores hasta encontrar una respuesta válida.
*   **Autoentrenamiento Contextual:** Genera un fingerprint (SHA-256) del repositorio para crear una base de conocimiento contextual (`.zenon_cache.json`). Solo se reentrena si hay cambios en los archivos, ahorrando un 90% de tokens.
*   **Zero Dependencies:** Escrito en Vanilla JavaScript nativo (Node.js). Cero descargas, inicio instantáneo y mínimo consumo de recursos.

---

## 🛠️ Modos de Operación

Zenon puede trabajar de tres formas distintas según lo que necesites en cada flujo de desarrollo:

### 1. Modo `assist` (Auditoría y Reporte)
Analiza todo el repositorio y genera una auditoría completa cubriendo bugs latentes, vulnerabilidades de seguridad, cuellos de botella de rendimiento y legibilidad.
*   **En Local:** Imprime las conclusiones en la consola y las guarda en `zenon_report.md`.
*   **En GitHub Actions:** Si la ejecución se origina desde un Pull Request, publica un comentario de revisión detallado directamente en el PR de GitHub.

### 2. Modo `correct` (Autocorrección Interactiva)
Identifica fallos evidentes de sintaxis, errores lógicos y problemas de seguridad e **implementa las soluciones editando los archivos en el disco**. 
*   **En GitHub Actions:** Genera las correcciones, hace un commit y push automático a la rama actual en segundo plano.

### 3. Modo `objective` (Desarrollo por Objetivos)
Lee un archivo markdown que describe un objetivo de desarrollo técnico específico (por defecto `zenon_objective.md`) y realiza todas las modificaciones necesarias en el código para cumplirlo.
*   **En GitHub Actions:** Aplica las correcciones a los archivos, realiza commit/push y crea un resumen de cambios.

> [!IMPORTANT]
> **Recomendación para el Modo `objective`:**
> Debido a los límites de tokens por petición y cuotas de los tiers gratuitos de las APIs, **se aconseja ser muy específico y acotado** con los objetivos que le encomiendes a Zenon. Es preferible definir tareas granulares y progresivas (por ejemplo: *"Añade validación de tipo string al parámetro email en la función X"*) en lugar de peticiones masivas y ambiguas (ej: *"Reescribe todo el backend"*).

---

## 🚀 Uso Remoto en GitHub Actions (Desde otro Repositorio)

Puedes integrar Zenon en cualquier repositorio privado o público para automatizar las revisiones o la autocorrección.

### 1. Configurar las Claves API en Secrets
Obtén tus credenciales gratuitas de los proveedores que desees usar y añádelas como secretos del repositorio en **Settings → Secrets and variables → Actions → New repository secret**:
*   `ZENON_API_KEY` o `GEMINI_API_KEY` *(Requerido - Clave de Google AI Studio)*
*   `GROQ_API_KEY` *(Opcional - Clave de Groq Console)*
*   `COHERE_API_KEY` *(Opcional - Clave de Cohere Dashboard)*
*   `OPENROUTER_API_KEY` *(Opcional - Clave de OpenRouter)*

### 2. Crear la Carpeta de Workflows y Configurar el Archivo
En el repositorio que quieres auditar, crea las carpetas `.github/workflows/` si no existen y añade el archivo `zenon.yml` con el siguiente contenido:

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
        description: 'Modo: assist (reportar) | correct (autocorregir) | objective (cumplir meta)'
        required: true
        default: 'assist'
        type: choice
        options:
          - assist
          - correct
          - objective
      objective-file:
        description: 'Ruta al archivo Markdown del objetivo (solo para modo objective)'
        required: false
        default: 'zenon_objective.md'

jobs:
  zenon-assistant:
    runs-on: ubuntu-latest
    
    # IMPORTANTE: Estos permisos son necesarios para que Zenon escriba comentarios en PRs
    # y suba los commits de código autogenerado.
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      # Este paso restaura el archivo de conocimiento acumulativo de Zenon (.zenon_cache.json)
      # desde el almacenamiento interno de GitHub (si existe una ejecución previa).
      # Al finalizar el job, GitHub guarda automáticamente el archivo actualizado para la próxima ejecución.
      # Resultado: Zenon aprende de forma incremental sin repetir análisis ya realizados, ahorrando tokens.
      - name: Restore Zenon Knowledge Cache
        uses: actions/cache@v4
        with:
          path: .zenon_cache.json
          key: zenon-knowledge-cache-${{ github.run_id }}
          restore-keys: |
            zenon-knowledge-cache-

      - name: Run Zenon AI
        uses: amglogicalis/Zenon@main
        with:
          zenon-api-key: ${{ secrets.ZENON_API_KEY }}
          groq-api-key: ${{ secrets.GROQ_API_KEY }}
          cohere-api-key: ${{ secrets.COHERE_API_KEY }}
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
          mode: ${{ github.event.inputs.mode || 'assist' }}
          objective-file: ${{ github.event.inputs.objective-file || 'zenon_objective.md' }}
```

> [!IMPORTANT]
> **¿Cómo funciona la caché de GitHub Actions?**
> El paso `actions/cache` es una feature oficial y de producción de GitHub. Su mecanismo es el siguiente:
> 1. **Al iniciar el job:** GitHub busca una caché guardada con la clave `zenon-knowledge-cache-` y, si la encuentra, restaura el archivo `.zenon_cache.json` directamente en el workspace antes de que Zenon arranque.
> 2. **Durante la ejecución:** Zenon lee ese archivo, usa el conocimiento previo acumulado, realiza el análisis incremental y actualiza el archivo con lo aprendido en esta ejecución.
> 3. **Al finalizar el job:** GitHub guarda automáticamente el `.zenon_cache.json` actualizado en su almacenamiento interno de caché bajo una nueva clave (`zenon-knowledge-cache-<run_id>`), listo para ser restaurado en la siguiente ejecución.
>
> De esta forma, **cada ejecución de Zenon es más inteligente que la anterior** y consume menos tokens de API, sin necesidad de commitear el archivo de caché a tu repositorio ni de exponerlo públicamente.

> [!NOTE]
> **La caché local y la caché de GitHub son independientes y no comparten contenido.**
> - La caché **local** (`.zenon_cache.json` en tu PC) crece con cada ejecución del CLI en tu máquina.
> - La caché **de GitHub Actions** crece con cada ejecución del workflow en la nube de GitHub.
> - Lo que Zenon aprende en local **no se sincroniza** automáticamente con GitHub, ni al revés.

---

## 💻 Uso Local en la Terminal

Puedes ejecutar Zenon directamente en tu máquina local durante el desarrollo sin depender de la nube de GitHub.

### Requisitos
*   Node.js v18 o superior.
*   Git (para una correcta detección de cambios y archivos).

### Preparación del Entorno Local
1. Crea un archivo `.env` en la raíz de tu repositorio con tus claves de API:
    ```env
    ZENON_API_KEY=tu_clave_gemini_aqui
    GROQ_API_KEY=tu_clave_groq_aqui
    COHERE_API_KEY=tu_clave_cohere_aqui
    OPENROUTER_API_KEY=tu_clave_openrouter_aqui
    ```

### Ejecutar con los Wrappers CLI
Hemos creado dos scripts ligeros para automatizar la carga de variables del archivo `.env` y llamar a Zenon con cualquier argumento de consola:

*   **En Windows (PowerShell):**
    ```powershell
    # Auditoría (Assist)
    .\zenon.ps1 --mode assist
    
    # Autocorrección (Correct)
    .\zenon.ps1 --mode correct
    
    # Cumplimiento de Objetivo (Objective)
    .\zenon.ps1 --mode objective --objective .\zenon_objective.md
    ```
*   **En Linux / macOS:**
    ```bash
    chmod +x zenon.sh
    
    # Auditoría (Assist)
    ./zenon.sh --mode assist
    
    # Autocorrección (Correct)
    ./zenon.sh --mode correct
    
    # Cumplimiento de Objetivo (Objective)
    ./zenon.sh --mode objective --objective zenon_objective.md
    ```

---

## 📥 Entradas de la GitHub Action (`action.yml`)

| Parámetro | Descripción | Requerido | Por Defecto |
| :--- | :--- | :---: | :--- |
| `zenon-api-key` | API Key para Gemini (AI Studio). | **Sí** | — |
| `groq-api-key` | API Key para Groq. | No | — |
| `cohere-api-key` | API Key para Cohere. | No | — |
| `openrouter-api-key` | API Key para OpenRouter. | No | — |
| `mode` | Modo de ejecución: `assist`, `correct` u `objective`. | No | `assist` |
| `objective-file` | Archivo Markdown de directivas para el modo `objective`. | No | `zenon_objective.md` |
| `exclude` | Archivos/rutas separados por comas que se deben ignorar. | No | `""` |
| `github-token` | Token interno de GitHub para push y comentarios. | No | `${{ github.token }}` |

---

## 🔒 Filtros de Archivos Seguros

Zenon ignora automáticamente archivos pesados y binarios para optimizar el contexto y evitar fugas de información:
*   **Carpetas excluidas:** `.git`, `node_modules`, `dist`, `build`, `venv`, `.venv`, `.env` y similares.
*   **Formatos excluidos:** Imágenes, audio, vídeo, fuentes, archivos comprimidos (`.zip`, `.rar`) y ejecutables.
*   **Límites de tamaño:** Cualquier archivo de texto que supere los **100 KB** se ignora para evitar desbordar los límites de tokens de los modelos más ligeros.

---

## 📄 Licencia

Este proyecto es software propietario y pertenece a **Adrián (amglogicalis)**. Todos los derechos reservados. Consulta el archivo [LICENSE](LICENSE) para más detalles sobre sus términos de uso y exclusión de fines comerciales.
