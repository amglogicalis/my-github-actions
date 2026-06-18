# Evolución Incremental de Zenon

Documento de referencia para el desarrollo incremental de Zenon. Cada paso se implementa sobre el anterior sin romper la funcionalidad existente.

> **Estado actual**: ¡Pasos 1, 2, 3 y 4 completados con éxito! Paso 5 en planificación.

---

## Paso 1: Cadena de Fallback de Modelos con Backoff Asíncrono - COMPLETADO ✅
- Fallbacks cruzados con backoff exponencial ante límites de cuota (429) y errores de red.

---

## Paso 2: Autoentrenamiento y Aprendizaje Contextual - COMPLETADO ✅
- Firmas SHA-256 para repositorios.
- Caché local .zenon_cache.json autogestionada e ignorada en .gitignore.
- Google Search Grounding durante el autoentrenamiento.

---

## Paso 3: Evolución y Multi-proveedor - COMPLETADO ✅
- Integración de Gemini, Groq, Cohere, DeepSeek (removido) y OpenRouter.
- Enrutamiento dinámico según el stack dominante (JS, Python, Go, DevOps) y el tamaño del repo.

---

## Paso 4: Modo "Objective" y Scripts de Terminal - COMPLETADO ✅
- Zenon lee un archivo de objetivos (por defecto zenon_objective.md o el indicado por --objective <ruta>).
- Analiza el contexto y ejecuta una petición estructurada JSON solicitando la creación/edición de archivos que resuelvan la tarea especificada.
- Aplica los cambios directamente en el disco.
- Wrappers zenon.ps1 (Windows) y zenon.sh (Linux/macOS) listos para ejecución local simple.

---

## Paso 5: Expansión de Modelos de Inteligencia Artificial - PLANIFICADO ⏳
- Integración de nuevos proveedores y modelos de lenguaje de última generación.
- Soporte para modelos locales open-weight y modelos especializados en programación (e.g., Llama 4, Qwen Coder, DeepSeek R1).
- Optimización de consumo de tokens y refinamiento de la lógica de enrutamiento basada en las características de las APIs más recientes.
