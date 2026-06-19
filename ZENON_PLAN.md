# Evolución Incremental de Zenon

Documento de referencia para el desarrollo incremental de Zenon. Cada paso se implementa sobre el anterior sin romper la funcionalidad existente.

> **Estado actual**: ¡Pasos 1, 2, 3, 4, 5 y 6 completados con éxito! Paso 7 en planificación.

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

## Paso 5: Optimización de Prompts y Estructuración de Respuestas - COMPLETADO ✅
- **Afinamiento y Optimización de Prompts:** Diseñar system instructions ultra-precisas que mitiguen alucinaciones, redundancias y bucles infinitos observados en modelos Mixture-of-Experts (MoE) grandes al digerir codebases extensas y en general en todos los modelos optimizarlo al maximo.
- **Profundidad y Calidad Técnica:** Reestructurar los prompts de revisión para evitar monólogos internos introductorios y forzar a las IAs a ir directo a aportaciones técnicas valiosas y refactorizaciones críticas.
- **Enfoque Estético en Reportes:** Exigir un formato estructurado en Markdown limpio con tablas comparativas, listas claras y bloques de alertas (`> [!WARNING]`, `> [!IMPORTANT]`) similares a los de Gemini 2.5 y Command R+.
- **Documentación de Directivas:** Clarificar estas especificaciones de prompts e instrucciones también en la guía del modo `objective` del README.

---

## Paso 6: Expansión de Modelos de Inteligencia Artificial - COMPLETADO ✅
- Integración de nuevos proveedores y modelos de lenguaje de última generación, estos serán presentados por el usuario, posiblemente habra que elegir los mejores respecto a rentabilidad/potencia
- Investigar el proveedor/es finalmente seleccionado/s para que las llamadas a la api, los prompts y demas funcionen perfecto, realizando una investigacion profunda y exhaustiva sobre como llamar a la api corerctamente de estos modelos nuevos y tener en cuenta sus restricciones y limites de prompt


## Paso 7: Refinamiento -- PLANIFICADO (Preguntas y cambios a hacer)

*No olvides ir actualizando el readme si es necesario con los nuevos cambios que se vayan haciendo*

- 1. Optimizar la funcion para optimziar los prompts sabiendo limitaciones exactas.(te las dare yo)

- 2. Refinar detectar bucles para cualquier modelo, tener cuidado con esto:
 Tu detector de bucles en la respuesta (isLoopingResponse) funciona genial para cortar la conexión si el modelo repite la misma palabra mil veces seguidas. Sin embargo, aquí el modelo no repitió palabras sueltas, sino que generó una tabla válida de Markdown estructuralmente, pero con contenido repetitivo.

- 3. Corregir que las apiskeys nuevas añadidas de los ultimos providers no salen cuando se ejecuta zenon en otro repo (posiblemente hay que actualizar el acton que le llama o algo asi)

- 4. EL propio zenon nos dijo esto:
 Fix: Calculate the buffer size as a percentage of the maxInputChars instead of using a fixed value. This ensures that the buffer is always proportional to the model's context limit.

- 5. Mejorar el modo objective, para que en el summary de la action (esto al menos en github web) muestre cual era el objetivo y un pequeño resumen de que hizo para cumplirlo. Lo mismo con el modo correct, que al terminar tambien explique un poco que corrigio y porque.

- 6. Hacer que al ejecutarlo en el terminal se pueda desde otros repos o al menos como se hace sin el script en terminal y ponerlo en el readme:
PS C:\mis-proyectos\testing> .\zenon.ps1 --mode assist
[zenon.ps1] Loading environment from .env...
[zenon.ps1] Environment loaded.
[zenon.ps1] Node.js v24.15.0 detected
[zenon.ps1] Launching Zenon AI Engine...

node:internal/modules/cjs/loader:1479
  throw err;
  ^

Error: Cannot find module 'C:\mis-proyectos\testing\zenon.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1476:15)
    at wrapResolveFilename (node:internal/modules/cjs/loader:1049:27)
    at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1073:10)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1094:12)
    at Module._load (node:internal/modules/cjs/loader:1262:25)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v24.15.0

//-- resultado del script en otro repo.--//

- 7. Hay alguna manera de subir secrets (las appi keys) a github de forma mas rapida y menos tediosa?

- Seria bueno añadir mas actions y modularidad en zenon respecto a su funcion principal de IA? Si es asi planifica como hcaerlo y dimelo, y te dire adelante una vez lo revise antes


## Paso 8: Nuevas Zenon actions! Un ecosistema de actions que formaran la IA. Quiero definir este ecosistema como Zenon Polis. -- PLANIFICADO

Personalizar zenon para que haga varios automatismos interesantes, configurables por el user de otro repo. Estas action iran aparte de la principal y seran añadidas por el usuario remotamente en su repo si asi lo desea(la IA pero si lo necesitan podrian incluso llamar a la action IA con objective o algo.)
Funciones chulas nuevas a añadir, ****en todas intentar añadir el logo en alguna parte, y el nuevo logo ded cada action junto con el logo de zenon polis, a esto proponme tu, hay un logo creado para zenon, zenon polis y cada zenon action***
Estas son las actions nuevas a añadir (ordenadas de mas simples a menos, la mayoria por no decir todas tiraran de la IA principal):

- 1. Zenon trainer: esta action servira para mandarle a zenon lo que quieres que aprenda (aprende lenguaje ruby version X.X.X, aprende sobre uso avanzado de terradorm, aprende la logica de pipelines red hat para noseque...), zenon buscara sobre eso y lo aprendera guardandolo en la cache.

- 2. Zenon reviewer: esta action automaticamente se ejecuta cuando se hace un push/commit, este action analiza los cambios hechos, y hace un informe/resumen. Tambien habiendo analizado los cambios hechos, detectara errores de logica, sintaxis o malas practicas y las mencionara.

- 3. Zenon analyzer: esta action mostrara estadisiticas actuales de los tokens, consumos, porcentaje de uso, cuanto queda en el tier, etc, de los distintos modelos de IA que se usan y sus providers. asi se hace un seguimmiento de costes y rendimiento.

- 4. Zenon helper: esta action servira (aprendera de forma intensiva y profunda como funciona y como se programa el repo, lo guarda en la cache, o si ya esta en la cache lo saca de ahi) para que si un usuario con poco conocimiento sobre el repo, o pocos conocimientos en general pueda hacer preguntas en lenguaje natural que zenon helper respodera (ejemplos: que archivos hacen que esto funcione?, como creo esto, donde y como defino esto, como hago noseque, etc)

- 5. Zenon tester: esta action sera un entorno de pruebas para lo que diga el usuario, el usuario le dira a zenon tester, prueba esta ejecucion de este script, prueba esta action, ejecuta noseque, zenon tester lo hara, si sale bien lo dira, si sale mal, tambien lo dira junto a un analisis del error que haya dado y como solucionarlo

- 6. Zenon updater: esta action hace una Sincronización automática entre los cambios del código y los archivos de texto. Escanea el repositorio tras un Push para verificar si las modificaciones en el código (nuevas funciones, cambio de parámetros o rutas) han dejado obsoletos el README.md o los manuales del proyecto. Si detecta discrepancias, la IA reescribe de forma correcta siguiendo el estilo del readme las secciones afectadas de la documentación y genera un parche automático para mantener los textos siempre al día.

- 7. Zenon DevOpser: esta action, hara que cualquier usuario pueda declarar, una ejecucion de algo, una comprobacion o una accion en general, que zenon probara y mandara un resultado, resumen, diagnostico o lo que sea que quiera el usuario, a un correo que haya definido el usuario.

Tras añadir las nuevas funciones de zenon no olvides ir actualizando el readme, ademas de que la imagen "zenon_scheme.jpg" es una presentacion de los logos y un esquema visual de zenon. 
Ademas como ves muchas de las propias action podrian aprovechar y llamarse a otras para sus funciones...

- Tras esto, habra que pensar como crear un script o algo, para llevarse todas las actions de una a un repo.