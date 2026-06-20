# Zenon DevOpser — Plan de Automatización

> Este archivo es tu panel de control de Zenon DevOpser.  
> Define aquí tus tareas en lenguaje natural. Zenon las ejecutará, las encadenará  
> y generará los scripts automáticamente si no existen.  
> Puedes combinar scripts propios, scripts generados por IA, comandos del sistema, y más.  
> Las tareas pueden incluir **instrucciones**, **scripts a ejecutar**, **dependencias**, **timeouts** y **variables de entorno**.

---

## Tarea: validate-syntax
- **Instrucciones**: Valida la sintaxis del archivo 'src/zenon.js' (resuelve su ruta desde la raíz del proyecto usando 'process.cwd()' para evitar errores de carpetas secundarias) ejecutando un comando de sistema para hacer 'node --check [ruta_archivo]'. Imprime en consola el resultado. Si hay algún fallo de sintaxis, detén el pipeline.
- **Ejecutar**: .zenon_devops/tasks/validate-syntax.js
- **Continuar si falla**: false

## Tarea: check-project-files
- **Instrucciones**: Comprueba que los archivos clave del repositorio ('README.md', 'action.yml', 'zenon.ps1') existen. Lanza un error si falta alguno de ellos.
- **Depende de**: validate-syntax
- **Continuar si falla**: false

## Tarea: generate-build-info
- **Instrucciones**: Crea un archivo 'build_info.json' en la raíz con la fecha y hora de esta ejecución, el número total de archivos '.js' en la carpeta 'src/' y un mensaje indicando que el pipeline se completó correctamente.
- **Depende de**: check-project-files
- **Continuar si falla**: true

---

<!-- CONFIGURACIÓN GLOBAL OPCIONAL -->
<!-- Descomenta las siguientes líneas para activar notificaciones -->

## Destinatario
amg.klon.github@gmail.com

<!-- ## Webhook -->
https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN