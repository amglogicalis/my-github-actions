# Plan de Evolución: Zenon AI (v2.0)

Documento de referencia para el desarrollo incremental de Zenon. Cada paso se implementa sobre el anterior sin romper la funcionalidad existente.

> **Estado actual**: Zenon v1 funciona correctamente (assist + correct mode, CI GitHub Actions, local CLI).

---

## Paso 1: Cadena de Fallback de Modelos con Backoff Asincrono - EN PROGRESO

### Objetivo
Asegurar que Zenon complete su ejecución con éxito incluso si el modelo principal devuelve errores 429 (cuota excedida) o 503 (servidor saturado).

### Cadena de Modelos (API Key del usuario)
| # | Modelo | Rol |
|---|---|---|
| 1 | gemini-2.5-flash | Principal - ventana de contexto grande, optimo para codigo |
| 2 | gemini-flash-lite-latest | Fallback 1 - ultraligero, alta disponibilidad |
| 3 | gemini-3.1-flash-lite | Fallback 2 - version actualizada del modelo ligero |
| 4 | gemma-4-31b-it | Fallback 3 - modelo instructivo abierto de ultimo recurso |

### Mecanismo
- Error 429: espera backoff exponencial (2s -> 4s -> 8s) antes del siguiente modelo.
- Error 503/500: reintenta con el siguiente modelo inmediatamente.
- Todos fallan: error amigable + exit code 1.

---

## Paso 2: Autoentrenamiento y Aprendizaje Contextual - PENDIENTE

### Objetivo
Zenon entiende la arquitectura del repo antes de analizar/corregir, buscando en internet documentacion relevante y cacheando el conocimiento aprendido.

### Mecanismo
- Google Search Grounding: inyectar tools: [{ googleSearch: {} }] en la llamada a Gemini.
- Cache local (.zenon_cache.json, en .gitignore): hash del repo + resumen de arquitectura. Si el repo no ha cambiado, salta el autoentrenamiento.

---

## Paso 3: Evolución y Multi-proveedor - PENDIENTE

### Objetivo
Integrar proveedores de IA adicionales gratuitos y crear un selector inteligente que elija el mejor modelo segun el tipo de codigo del repositorio.

### Catalogo de Proveedores
| Proveedor | Modelo | Ventaja | Limite gratis |
|---|---|---|---|
| Google AI Studio | gemini-2.5-flash | Contexto enorme | 60 RPM |
| Groq API | llama-3.3-70b | Velocidad extrema | 30 RPM, 100k tokens/dia |
| DeepSeek | deepseek-chat | Razonamiento avanzado | 5M tokens gratis inicial |
| Cohere | command-r-plus | Multilingue y docs | 1.000 llamadas/mes |
| OpenRouter | Varios open-source | Backup universal | 50 req/dia |

---

## Restricciones Tecnicas Globales
- Cero dependencias npm - Todo en Node.js puro con fetch nativo.
- Sin mencion de Gemini en outputs de usuario - Siempre usar Zenon AI Engine.
- Modelos hardcodeados - El usuario nunca configura modelos; Zenon los selecciona automaticamente.
- Local nunca hace push - Solo el entorno GitHub Actions CI hace commit/push automatico.
