# keelson

Memoria anclada y verificada con hash para agentes de código, compartida por todos los agentes y modelos que trabajan en un repositorio.

> **Estado: alfa.** El núcleo de memoria y el índice con presupuesto funcionan (es lo que cubre este README). Los hooks, las métricas y el visor llegarán después. Nada de esto envía datos por la red.

Los agentes de código empiezan cada sesión desde cero. Pagan otra vez por cargar reglas fijas y por volver a leer código que ya diagnosticaron en una sesión anterior. keelson guarda lo que aprendió una sesión (hallazgos, descartes, decisiones, hipótesis) como archivos pequeños dentro de tu repositorio, cada uno anclado a las líneas de código que lo respaldan. Antes de confiar en algo, keelson vuelve a comprobar esas líneas: si el código cambió, la memoria queda marcada como vencida en vez de servirse como un hecho.

English: [README.md](README.md).

## Instalación (local, desde el código)

Requiere Node 22 o posterior y git.

```sh
git clone https://github.com/danifund01/keelson
cd keelson
npm install
npm run build
npm link        # deja disponible el comando `keelson`
```

## Uso

Ejecuta los comandos desde cualquier carpeta dentro de un repositorio git.

```sh
keelson init
# ok init .keelson

keelson note --kind finding --area auth \
  --summary "Login origins group IPv6 by /64 prefix" \
  --anchor src/lib/auth/origin.ts:10-24 \
  --body "Observado en groupOrigin(); /64 cubre las direcciones de privacidad."
# ok 01JD3F... verified

keelson list
# 01JD3F... verified auth Login origins group IPv6 by /64 prefix

keelson verify
# ok verified=1 relocated=0 stale=0 archived=0 errors=0
```

La salida es una sola línea corta a propósito: la leen los agentes, y cada línea de más cuesta tokens.

## Comandos

| Comando | Qué hace | Salida |
|---|---|---|
| `init` | Crea `.keelson/` con `entries/`, `config.json` (tu email de git como autor de confianza) y `.gitignore`. | `ok init .keelson` |
| `note --kind <k> --area <a> --summary <s> [--body <t> \| --body-file <f>] [--anchor ruta:inicio-fin]... [--load-when <glob>]... [--contradicts <id>]... [--session <s>] [--agent <a>] [--model <m>]` | Registra una entrada. Tipos: `finding`, `discard`, `decision`, `hypothesis` (`rule` es solo para personas). Con anclajes empieza `verified`; sin anclajes, o como `hypothesis`, empieza `hypothesis`. | `ok <id> <estado>` |
| `confirm <id> [--session <s>]` | Vuelve a comprobar los anclajes y registra una confirmación. Una hipótesis pasa a `verified` si la confirma otra sesión. | `ok <id> <estado>` |
| `resolve <id> --by <commit o id>` | Archiva una entrada que cerró un fix u otra entrada. | `ok <id> archived` |
| `promote <id>` | Una persona aprueba una entrada. Requiere una terminal interactiva. | `ok <id> verified` |
| `rule add --area <a> --summary <s> [--body <t> \| --body-file <f>]` | Una persona añade una regla; su texto se guarda literal. Requiere una terminal interactiva. | `ok <id> verified` |
| `verify [--json]` | Vuelve a comprobar todos los anclajes: el código desplazado se reubica, el código cambiado pasa a `stale` y los archivos borrados o renombrados pasan a `archived`. | `ok verified=N relocated=N stale=N archived=N errors=N` |
| `show <id>` | Vuelve a comprobar los anclajes (guardando cualquier cambio) y muestra el estado en que se puede confiar y el archivo de la entrada. | `effective_status: <estado>` y el archivo |
| `list [--area <a>] [--status <s>] [--json]` | Una línea por entrada con su estado efectivo. Una entrada `verified` se muestra como `hypothesis` si alguien ajeno a `trusted_authors` hizo commit de un cambio en su archivo. | `<id> <estado> <área> <resumen>` |
| `compile [--check] [--adopt-agents-md]` | Vuelve a comprobar los anclajes y genera el índice raíz (`.keelson/index.md`, dentro de `root_index_tokens`), una skill por área en `.agents/skills`, `.claude/skills` y `.gemini/skills`, y el bloque keelson de `AGENTS.md`. `--check` no escribe nada y sale con 1 si algo de eso está desactualizado. | `ok compile areas=N skills=N index=T/B levels=L descriptions=~D written=W removed=R` |

El id de sesión sale de `--session` o de la variable de entorno `KEELSON_SESSION`.

Códigos de salida: `0` correcto, `1` error (mensaje en stderr como `error: ...`) o `compile --check` encontró archivos desactualizados, `2` comando desconocido o uso incorrecto, `3` la acción necesita una persona en una terminal interactiva.

## Compilar para los agentes

`keelson compile` convierte la memoria en archivos que los agentes ya leen. Haz commit de ellos, así los agentes sin keelson (por ejemplo en la nube) ven la misma memoria. Si dos ramas chocan en esos archivos, ejecuta `keelson compile` otra vez en lugar de fusionarlos a mano.

- **Índice:** `.keelson/index.md` lista cada área con cuándo cargarla, su costo estimado, un resumen y su frescura. Nunca supera `root_index_tokens` (1500 por defecto): con muchas áreas se divide en niveles anidados dentro de `.keelson/index/`.
- **Skills:** un `SKILL.md` por área, copiado en la carpeta de cada agente. Su `description` es el disparador. Lo que está `stale`, `disputed` o es `hypothesis` lleva la etiqueta «verify before use».
- **AGENTS.md:** keelson solo es dueño del bloque entre `<!-- keelson:begin ... -->` y `<!-- keelson:end -->`. Contiene las reglas universales (reglas sin `load_when`) y un puntero al índice. Si tu `AGENTS.md` no tiene bloque, keelson nunca lo toca: ejecuta tú `keelson compile --adopt-agents-md` en una terminal para ver el bloque y añadirlo. Quienes usan Claude Code pueden importarlo desde `CLAUDE.md` con `@AGENTS.md`.
- **Nunca se sobrescriben archivos de personas.** Cada archivo generado lleva `<!-- keelson:generated do-not-edit -->`. Un archivo sin esa marca en una ruta generada detiene la compilación.
- **Los resúmenes del texto siempre cargado vienen de personas.** Define `areas.<nombre>.description` en `.keelson/config.json`. Si falta, el resumen se deriva del nombre del área y sus globs, nunca de lo que escribieron los agentes.
- **Las descripciones de las skills son contexto fijo** en los agentes que listan skills. `compile` informa su total estimado y avisa si supera `root_index_tokens`.

En la CI, la confianza necesita la historia completa de git:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npx keelson compile --check
```

## Seguridad

- keelson nunca lee ni ancla `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, archivos ignorados por git ni los globs que añadas a `deny` en `.keelson/config.json`.
- Se rechazan las notas cuyo texto parezca contener un secreto.
- No se pueden anclar archivos binarios ni de más de 1 MiB.
- La memoria es un dato, no una instrucción: keelson nunca ejecuta el contenido de una entrada.

## Formato

Las entradas son archivos Markdown con frontmatter YAML, especificados en [spec/FORMAT.md](spec/FORMAT.md) (traducción en [docs/es/FORMAT.md](docs/es/FORMAT.md)). Cualquier herramienta puede leerlos y escribirlos.

## Licencia

MIT
