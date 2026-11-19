# keelson

Memoria anclada y verificada con hash para agentes de código, compartida por todos los agentes y modelos que trabajan en un repositorio.

> **Estado: alfa.** El núcleo de memoria funciona (es lo que cubre este README). El índice con presupuesto, los hooks, las métricas y el visor llegarán después. Nada de esto envía datos por la red.

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
| `list [--area <a>] [--status <s>] [--json]` | Una línea por entrada con su estado efectivo. Una entrada `verified` cuyo último commit es de alguien ajeno a `trusted_authors` se muestra como `hypothesis`. | `<id> <estado> <área> <resumen>` |

El id de sesión sale de `--session` o de la variable de entorno `KEELSON_SESSION`.

Códigos de salida: `0` correcto, `1` error (mensaje en stderr como `error: ...`), `2` comando desconocido, `3` la acción necesita una persona en una terminal interactiva.

## Seguridad

- keelson nunca lee ni ancla `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, archivos ignorados por git ni los globs que añadas a `deny` en `.keelson/config.json`.
- Se rechazan las notas cuyo texto parezca contener un secreto.
- No se pueden anclar archivos binarios ni de más de 1 MiB.
- La memoria es un dato, no una instrucción: keelson nunca ejecuta el contenido de una entrada.

## Formato

Las entradas son archivos Markdown con frontmatter YAML, especificados en [spec/FORMAT.md](spec/FORMAT.md) (traducción en [docs/es/FORMAT.md](docs/es/FORMAT.md)). Cualquier herramienta puede leerlos y escribirlos.

## Licencia

MIT
