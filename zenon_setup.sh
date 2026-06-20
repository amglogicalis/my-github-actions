#!/bin/bash
# =============================================================================
# Zenon Polis — Setup Helper (Linux / macOS / Bash)
# =============================================================================
# Este script te ayuda a importar de forma rápida y sencilla los módulos de
# Zenon Polis en cualquier repositorio local. Crea los archivos de workflow
# en .github/workflows/ y los archivos de configuración requeridos.
# =============================================================================

set -e

# Colores para la salida
PURPLE='\033[0;35m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${PURPLE}=========================================================${NC}"
echo -e "${PURPLE}        ⚡ Bienvenido al Asistente de Zenon Setup ⚡${NC}"
echo -e "${PURPLE}=========================================================${NC}"
echo "Este script configurará las acciones de Zenon Polis en este repo."
echo ""

# 1. Asegurar directorios
WORKFLOWS_DIR=".github/workflows"
if [ ! -d "$WORKFLOWS_DIR" ]; then
    mkdir -p "$WORKFLOWS_DIR"
    echo -e "${CYAN}📁 Creada la carpeta de flujos de trabajo: .github/workflows/${NC}"
fi

# 2. Menú de Selección de Módulos
echo ""
echo -e "${YELLOW}Selecciona qué módulos de Zenon Polis deseas importar:${NC}"
echo "1) Reviewer (Auditoría automática de PRs y commits)"
echo "2) DevOpser (Plataforma lambda de automatización de tareas)"
echo "3) Tester (Ejecución y auto-corrección de pruebas unitarias)"
echo "4) Updater (Sincronización de documentación con código)"
echo "5) Helper (Asistente de consultas interactivas del repo)"
echo "6) Analyzer (Visualizador gráfico de estadísticas de consumo)"
echo "7) Core Action (Ejecutor general de Zenon Principal)"
echo ""
echo "Elige las opciones deseadas separadas por comas (ej. 1,2,5) o escribe 'todos':"

read -p "Opción [todos]: " choice_input
if [ -z "$choice_input" ]; then
    choice_input="todos"
fi
choice_input=$(echo "$choice_input" | tr -d '\r')

# Parsear las opciones elegidas
selected_options=()
choice_input_lower=$(echo "$choice_input" | tr '[:upper:]' '[:lower:]' | xargs)

if [ "$choice_input_lower" = "todos" ] || [ "$choice_input_lower" = "all" ]; then
    selected_options=(1 2 3 4 5 6 7)
else
    # Dividir por comas
    IFS=',' read -ra ADDR <<< "$choice_input"
    for i in "${ADDR[@]}"; do
        val=$(echo "$i" | xargs)
        if [[ "$val" =~ ^[1-7]$ ]]; then
            selected_options+=("$val")
        fi
    done
fi

if [ ${#selected_options[@]} -eq 0 ]; then
    echo -e "${RED}❌ Selección no válida. Saliendo.${NC}"
    exit 1
fi

# 3. Preguntar por Proveedores de IA
echo ""
echo -e "${YELLOW}Configuración de Proveedores de IA:${NC}"
echo "1) Solo Gemini (Recomendado, gratis y con búsqueda web)"
echo "2) Multiproveedor (Gemini, Groq, SambaNova, Cohere, Cerebras, etc.)"
read -p "Elige una opción [1-2, por defecto 1]: " provider_choice
if [ -z "$provider_choice" ]; then
    provider_choice="1"
fi
provider_choice=$(echo "$provider_choice" | tr -d '\r' | xargs)
use_multi_provider=false
if [ "$provider_choice" = "2" ]; then
    use_multi_provider=true
fi

# 4. Plantillas de workflows
# Claves de IA a inyectar en el YAML
if [ "$use_multi_provider" = true ]; then
    keys_yaml="          zenon-api-key: \${{ secrets.ZENON_API_KEY }}
          groq-api-key: \${{ secrets.GROQ_API_KEY }}
          cohere-api-key: \${{ secrets.COHERE_API_KEY }}
          openrouter-api-key: \${{ secrets.OPENROUTER_API_KEY }}
          samba-api-key: \${{ secrets.SAMBA_API_KEY }}
          cerebras-api-key: \${{ secrets.CEREBRAS_API_KEY }}
          gh-models-token: \${{ secrets.GH_MODELS_TOKEN }}"
else
    keys_yaml="          zenon-api-key: \${{ secrets.ZENON_API_KEY }}"
fi

created_files=()
warnings_list=()

# Función para verificar si un array contiene un elemento
contains_element() {
  local e match="$1"
  shift
  for e; do [[ "$e" == "$match" ]] && return 0; done
  return 1
}

# Escribir los workflows correspondientes
for opt in "${selected_options[@]}"; do
    case $opt in
        1)
            # REVIEWER
            filename="zenon-reviewer.yml"
            content="name: 🔍 Zenon Reviewer

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  reviewer:
    name: 🔍 Zenon Reviewer — PR Audit
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Zenon Reviewer
        uses: amglogicalis/Zenon/.github/actions/reviewer@main
        with:
$keys_yaml
          github-token: \${{ secrets.GITHUB_TOKEN }}"
            ;;
        2)
            # DEVOPSER
            filename="zenon-devopser.yml"
            content="name: ⚡ Zenon DevOpser

on:
  workflow_dispatch:
    inputs:
      devops-plan-file:
        description: 'Plan file path (default: zenon_devops.md)'
        required: false
        default: 'zenon_devops.md'
      self-heal:
        description: 'Enable AI Self-Healing?'
        required: false
        default: 'true'
        type: choice
        options:
          - 'true'
          - 'false'
      notify-email:
        description: 'Email to send the execution report to'
        required: false
        default: ''

jobs:
  devopser:
    name: ⚡ Zenon DevOpser Pipeline
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon DevOpser
        uses: amglogicalis/Zenon/.github/actions/devopser@main
        with:
$keys_yaml
          devops-plan-file: \${{ inputs.devops-plan-file }}
          self-heal: \${{ inputs.self-heal }}
          notify-email: \${{ inputs.notify-email }}
          github-token: \${{ secrets.GITHUB_TOKEN }}

      - name: Send Email Report
        if: always() && inputs['notify-email'] != ''
        uses: dawidd6/action-send-mail@v4
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: \${{ secrets.MAIL_USERNAME }}
          password: \${{ secrets.MAIL_PASSWORD }}
          subject: \"⚡ Zenon DevOpser Report — \${{ github.repository }}\"
          to: \${{ inputs.notify-email }}
          from: Zenon DevOpser
          html_body: file://zenon_report.html"
            ;;
        3)
            # TESTER
            filename="zenon-tester.yml"
            content="name: 🧪 Zenon Tester

on:
  workflow_dispatch:
    inputs:
      test-cmd:
        description: 'Custom test command (leave empty for auto-detect)'
        required: false
        default: ''
      auto-fix:
        description: 'Enable auto-fix and commit corrections?'
        required: false
        default: 'true'
        type: choice
        options:
          - 'true'
          - 'false'

jobs:
  tester:
    name: 🧪 Zenon Tester & Auto-Fix
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon Tester
        uses: amglogicalis/Zenon/.github/actions/tester@main
        with:
$keys_yaml
          test-cmd: \${{ inputs.test-cmd }}
          auto-fix: \${{ inputs.auto-fix }}
          github-token: \${{ secrets.GITHUB_TOKEN }}"
            ;;
        4)
            # UPDATER
            filename="zenon-updater.yml"
            content="name: 📝 Zenon Updater

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  updater:
    name: 📝 Zenon Updater — Sync Docs
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Zenon Updater
        uses: amglogicalis/Zenon/.github/actions/updater@main
        with:
$keys_yaml
          github-token: \${{ secrets.GITHUB_TOKEN }}"
            ;;
        5)
            # HELPER
            filename="zenon-helper.yml"
            content="name: 🤖 Zenon Helper

on:
  workflow_dispatch:
    inputs:
      query:
        description: 'Your question about the codebase'
        required: true
        default: 'Explain the general architecture of this repository.'

jobs:
  helper:
    name: 🤖 Zenon Helper Query
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon Helper
        uses: amglogicalis/Zenon/.github/actions/helper@main
        with:
$keys_yaml
          query: \${{ inputs.query }}"
            ;;
        6)
            # ANALYZER
            filename="zenon-analyzer.yml"
            content="name: 📊 Zenon Analyzer

on:
  workflow_dispatch:
    inputs:
      reset:
        description: 'Reset quota statistics to zero?'
        required: false
        default: 'false'
        type: choice
        options:
          - 'false'
          - 'true'

jobs:
  analyzer:
    name: 📊 Zenon Analyzer Stats
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Run Zenon Analyzer
        uses: amglogicalis/Zenon/.github/actions/analyzer@main
        with:
          reset: \${{ inputs.reset }}"
            ;;
        7)
            # CORE ACTION
            filename="zenon.yml"
            content="name: Zenon AI Assistant

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  workflow_dispatch:
    inputs:
      mode:
        description: 'Execution Mode'
        required: false
        default: 'assist'
        type: choice
        options:
          - assist
          - correct
          - objective
          - trainer
          - reviewer
          - analyzer
          - helper

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

      - name: Restore Zenon Knowledge Cache
        uses: actions/cache@v4
        with:
          path: .zenon_cache.json
          key: zenon-knowledge-cache-\${{ github.run_id }}
          restore-keys: |
            zenon-knowledge-cache-

      - name: Run Zenon Core Action
        uses: amglogicalis/Zenon@main
        with:
$keys_yaml
          mode: \${{ github.event.inputs.mode || 'assist' }}"
            ;;
    esac

    # Escribir el contenido del archivo YAML
    echo "$content" > "$WORKFLOWS_DIR/$filename"
    created_files+=(".github/workflows/$filename")

    # Archivos adicionales
    if [ "$opt" -eq 2 ]; then
        if [ ! -f "zenon_devops.md" ]; then
            cat << 'EOF' > "zenon_devops.md"
# Zenon DevOpser — Plan de Automatización

## Destinatario
tu-correo@gmail.com

---

## Tarea: check-environment
- **Instrucciones**: Comprueba la versión de Node.js instalada en el sistema (debe ser >= 18). Muestra una salida exitosa si lo es.
- **Continuar si falla**: false
EOF
            created_files+=("zenon_devops.md")
        fi
        warnings_list+=("[DevOpser] Se ha creado un archivo 'zenon_devops.md' básico en la raíz. Recuerda editarlo y configurar tus tareas. Consulta el README para más especificaciones.")
    fi

    if [ "$opt" -eq 7 ]; then
        if [ ! -f "zenon_objective.md" ]; then
            echo -e "# Objetivo de desarrollo\nEscribe aquí la meta técnica que quieres que Zenon resuelva." > "zenon_objective.md"
            created_files+=("zenon_objective.md")
        fi
    fi
done

# Mostrar informe de éxito
echo ""
echo -e "${GREEN}=========================================================${NC}"
echo -e "${GREEN}      🎉 ¡Configuración de Zenon Completada con Éxito! 🎉${NC}"
echo -e "${GREEN}=========================================================${NC}"
echo -e "${YELLOW}Archivos creados:${NC}"
for file in "${created_files[@]}"; do
    echo -e "  ${GREEN}✅ $file${NC}"
done

if [ ${#warnings_list[@]} -ge 1 ]; then
    echo ""
    echo -e "${YELLOW}Notas Importantes:${NC}"
    for warn in "${warnings_list[@]}"; do
        echo -e "  ${CYAN}⚠️  $warn${NC}"
    done
fi

echo ""
echo -e "${YELLOW}Próximos pasos requeridos en GitHub (Settings > Secrets and variables > Actions):${NC}"
echo "1. Añade como Repository Secret la clave de API principal:"
echo -e "   - ${PURPLE}ZENON_API_KEY (Clave de Google Gemini)${NC}"

if [ "$use_multi_provider" = true ]; then
    echo "2. Añade las claves secundarias para habilitar la cascada de fallbacks (Opcional):"
    echo -e "   - ${PURPLE}GROQ_API_KEY, SAMBA_API_KEY, COHERE_API_KEY, CEREBRAS_API_KEY, GH_MODELS_TOKEN${NC}"
fi

contains_element 2 "${selected_options[@]}" && has_devops=true || has_devops=false
if [ "$has_devops" = true ]; then
    echo "3. Para notificaciones por Correo de DevOpser, añade los secretos SMTP:"
    echo -e "   - ${PURPLE}MAIL_USERNAME (Tu email)${NC}"
    echo -e "   - ${PURPLE}MAIL_PASSWORD (Tu contraseña de aplicación)${NC}"
fi

echo ""
echo -e "${GREEN}¡Archivos de configuración creados con éxito!${NC}"
echo -e "${PURPLE}=========================================================${NC}"

# 7. Preguntar si se desean subir los cambios a GitHub
echo ""
read -p "Quieres subir los cambios a github? [s/N]: " git_choice
if [ -z "$git_choice" ]; then
    git_choice="n"
fi
git_choice=$(echo "$git_choice" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | xargs)

if [ "$git_choice" = "s" ] || [ "$git_choice" = "y" ] || [ "$git_choice" = "si" ] || [ "$git_choice" = "yes" ]; then
    echo -e "${YELLOW}Haciendo git add, commit y push...${NC}"
    git add .github/workflows/*
    if [ -f "zenon_devops.md" ]; then git add zenon_devops.md; fi
    if [ -f "zenon_objective.md" ]; then git add zenon_objective.md; fi
    if git commit -m "chore: setup Zenon Polis workflows and configurations"; then
        if git push; then
            echo -e "${GREEN}✅ Cambios subidos a GitHub con éxito.${NC}"
        else
            echo -e "${RED}❌ Error al ejecutar 'git push'. Asegúrate de tener permisos para subir a esta rama.${NC}"
        fi
    else
        echo -e "${RED}❌ Error al crear el commit de Git.${NC}"
    fi
fi

# 8. Preguntar si se desean configurar los secrets/variables desde aquí
echo ""
read -p "Quieres configurar desde aqui los secrets y variables? [s/N]: " secret_choice
if [ -z "$secret_choice" ]; then
    secret_choice="n"
fi
secret_choice=$(echo "$secret_choice" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | xargs)

if [ "$secret_choice" = "s" ] || [ "$secret_choice" = "y" ] || [ "$secret_choice" = "si" ] || [ "$secret_choice" = "yes" ]; then
    if command -v gh &> /dev/null; then
        # 8a. Reviewer Auto Execution (sólo si se seleccionó la opción 1)
        contains_element 1 "${selected_options[@]}" && has_reviewer=true || has_reviewer=false
        if [ "$has_reviewer" = true ]; then
            read -p "Quieres que Zenon Reviewer se ejecute automaticamente en cada pull request o commit? [S/n]: " auto_review_choice
            if [ -z "$auto_review_choice" ]; then
                auto_review_choice="s"
            fi
            auto_review_choice=$(echo "$auto_review_choice" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | xargs)
            
            auto_review_val="false"
            if [ "$auto_review_choice" = "n" ] || [ "$auto_review_choice" = "no" ]; then
                auto_review_val="true"
            fi
            echo -e "${YELLOW}Configurando variable ZENON_DISABLE_AUTO_REVIEW a $auto_review_val en GitHub...${NC}"
            if echo "$auto_review_val" | gh variable set ZENON_DISABLE_AUTO_REVIEW; then
                echo -e "${GREEN}✅ Variable ZENON_DISABLE_AUTO_REVIEW configurada correctamente.${NC}"
            else
                echo -e "${RED}❌ Error al configurar la variable ZENON_DISABLE_AUTO_REVIEW.${NC}"
            fi
        fi

        # 8b. Updater Auto Execution (sólo si se seleccionó la opción 4)
        contains_element 4 "${selected_options[@]}" && has_updater=true || has_updater=false
        if [ "$has_updater" = true ]; then
            read -p "Quieres que Zenon Updater se ejecute automaticamente en cada commit? [S/n]: " auto_update_choice
            if [ -z "$auto_update_choice" ]; then
                auto_update_choice="s"
            fi
            auto_update_choice=$(echo "$auto_update_choice" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | xargs)
            
            auto_update_val="false"
            if [ "$auto_update_choice" = "n" ] || [ "$auto_update_choice" = "no" ]; then
                auto_update_val="true"
            fi
            echo -e "${YELLOW}Configurando variable ZENON_DISABLE_AUTO_UPDATE a $auto_update_val en GitHub...${NC}"
            if echo "$auto_update_val" | gh variable set ZENON_DISABLE_AUTO_UPDATE; then
                echo -e "${GREEN}✅ Variable ZENON_DISABLE_AUTO_UPDATE configurada correctamente.${NC}"
            else
                echo -e "${RED}❌ Error al configurar la variable ZENON_DISABLE_AUTO_UPDATE.${NC}"
            fi
        fi

        # 8c. API Key de Gemini
        read -p "Pega la API Key de Gemini (ZENON_API_KEY): " gemini_key
        gemini_key=$(echo "$gemini_key" | tr -d '\r' | xargs)
        if [ -n "$gemini_key" ]; then
            echo -e "${YELLOW}Configurando el secreto ZENON_API_KEY en GitHub...${NC}"
            if echo "$gemini_key" | gh secret set ZENON_API_KEY; then
                echo -e "${GREEN}✅ Secreto ZENON_API_KEY subido correctamente.${NC}"
            else
                echo -e "${RED}❌ Error al ejecutar 'gh secret set'. Asegúrate de haber iniciado sesión con 'gh auth login'.${NC}"
            fi
        else
            echo -e "${YELLOW}No se ha introducido ninguna clave.${NC}"
        fi
    else
        echo -e "${RED}❌ El comando 'gh' (GitHub CLI) no está instalado en el sistema.${NC}"
        echo -e "${YELLOW}Instálalo y ejecuta 'gh auth login' antes de configurar secretos y variables desde consola.${NC}"
    fi
fi

echo ""
echo -e "${PURPLE}=========================================================${NC}"
