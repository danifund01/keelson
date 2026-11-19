# Formato de memoria de keelson — versión 1

Este documento es el contrato de los archivos que keelson guarda en un repositorio. Cualquier herramienta o agente puede leerlos y escribirlos siguiéndolo; la CLI de referencia es solo una implementación. La versión que manda es `spec/FORMAT.md` (inglés).

## Estructura

```
.keelson/
  config.json        configuración (opcional; sin ella rigen los valores por defecto)
  entries/<ID>.md    una entrada de memoria por archivo
  .gitignore         contiene ".local/"
  .local/            estado local de la máquina, nunca se versiona
```

Un archivo por entrada, con su ULID como nombre, así que dos sesiones nunca escriben el mismo archivo.

## Archivo de entrada

Una entrada es texto UTF-8: un bloque YAML entre dos líneas `---` y después un cuerpo de texto libre.

```markdown
---
format_version: 1
id: 01JD3F0000000000000000000A
kind: finding
status: verified
area: auth
summary: Login origins group IPv6 addresses by /64 prefix
load_when:
  - src/lib/auth/**
anchors:
  - path: src/lib/auth/origin.ts
    range:
      - 10
      - 24
    hash: sha256:<64 hex en minúscula>
provenance:
  created: 2026-11-19T12:00:00.000Z
  agent: claude-code
  model: opus
  session: a1b2c3d4
  author: dev@example.com
confirmations: []
contradicts: []
supersedes: []
resolved_by: null
est_tokens: 31
---
Evidencia: qué se observó, en pocas líneas. Sin secretos.
```

- Antes de interpretar el archivo, el lector convierte CRLF y CR a LF y quita el BOM inicial.
- El cuerpo es todo lo que sigue a la línea `---` de cierre. Es la evidencia de la entrada y ninguna herramienta lo reescribe ni lo comprime. En las entradas `rule`, el cuerpo es el texto literal de la regla.
- Las claves van en snake_case. En la versión 1, una clave desconocida es un error.
- Quien escribe emite las claves en el orden mostrado, para que los diffs sean estables.

## Campos

| Clave | Tipo | Significado |
|---|---|---|
| `format_version` | entero | `1`. |
| `id` | texto | ULID (`^[0-9A-HJKMNP-TV-Z]{26}$`), igual al nombre del archivo. |
| `kind` | enum | `rule`, `finding`, `discard`, `decision` o `hypothesis`. |
| `status` | enum | `verified`, `hypothesis`, `disputed`, `stale` o `archived`. |
| `area` | texto | Etiqueta libre que agrupa entradas (por ejemplo `auth`). |
| `summary` | texto | Una línea, de 160 caracteres como máximo. |
| `load_when` | texto[] | Globs de rutas o disparadores declarados que hacen relevante la entrada. |
| `anchors` | objeto[] | Evidencia en el código: `path` (POSIX, relativa a la raíz del repo), `range` (`[inicio, fin]`, desde 1, inclusivo) y `hash`. |
| `provenance` | objeto | `created` (ISO 8601) y, opcionales, `agent`, `model`, `session` y `author`. |
| `confirmations` | objeto[] | `at` (ISO 8601) y, opcionales, `session` y `author`. |
| `contradicts` | texto[] | Ids de las entradas que esta contradice. |
| `supersedes` | texto[] | Ids de las entradas que esta reemplaza. |
| `resolved_by` | texto o null | Commit o id de entrada que cerró esta entrada. |
| `est_tokens` | entero | Tokens estimados de `summary` + cuerpo: `ceil(caracteres / 3.5)`. Lo calcula la herramienta, nunca el agente. Es una estimación, no un conteo. |

## Hash del anclaje

1. Leer el archivo anclado como UTF-8.
2. Normalizar: quitar el BOM inicial, convertir CRLF y CR a LF y quitar los espacios y tabuladores finales de cada línea.
3. Tomar las líneas `inicio` a `fin` (desde 1, inclusivo) y unirlas con `\n`.
4. `hash` es `sha256:` seguido del SHA-256 de ese texto en hexadecimal en minúscula.

Reubicación: si el rango ya no coincide, el lector puede deslizar una ventana del mismo número de líneas sobre el archivo normalizado. Una sola coincidencia reubica el anclaje a ese rango; cero o varias significan que el anclaje se perdió. El lector nunca adivina entre varias coincidencias.

## Estados y transiciones

| Desde | Hacia | Cuándo |
|---|---|---|
| (nueva) | `verified` | Todos los anclajes existen y coinciden al escribir, y el tipo no es `hypothesis`. Una `rule` solo la crea una persona. |
| (nueva) | `hypothesis` | Sin anclajes, o tipo `hypothesis`. |
| `hypothesis` | `verified` | Una confirmación desde otra sesión, o la aprobación de una persona (`promote`), con todos los anclajes coincidiendo. |
| cualquiera vigente | `disputed` | Contradice a otra entrada vigente, u otra la contradice. Se conservan ambas. |
| `verified`, `hypothesis`, `disputed` | `stale` | Un rango anclado cambió y no se pudo reubicar. |
| `stale` | `hypothesis` | El contenido anclado vuelve a coincidir. Necesita una nueva confirmación para volver a `verified`. |
| cualquiera | `archived` | Un archivo anclado se borró o se renombró, o la entrada se resolvió (`resolved_by` asignado). |

Confianza: una entrada `verified` sigue como `verified` al mostrarla o compilarla solo si todos los autores de todos los commits que tocaron su archivo están en `trusted_authors` (sin distinguir mayúsculas). Si no, se trata como `hypothesis`. Un archivo de entrada todavía sin commits conserva su estado guardado. Las herramientas no escriben esa rebaja en disco. La confianza necesita la historia completa de git: en un clon superficial, las herramientas que la aplican fallan con un error.

## Configuración (`.keelson/config.json`)

```json
{
  "format_version": 1,
  "root_index_tokens": 1500,
  "hypothesis_expiry_sessions": 5,
  "deny": [],
  "trusted_authors": ["dev@example.com"],
  "areas": {
    "auth": { "description": "Login, sessions and request origins." }
  }
}
```

Las claves van en snake_case, como en el frontmatter de las entradas. Todas las claves son opcionales. `deny` añade globs a la lista de prohibidos de serie y no puede quitar ninguno.

`areas` guarda ajustes escritos por personas para cada nombre de área. `description` (de 1 a 200 caracteres, en una línea) es el resumen del área en el índice compilado y el disparador de su skill. Si falta, se deriva del nombre del área y de sus globs `load_when`, nunca de los resúmenes de las entradas.

## Archivos prohibidos

Las herramientas nunca leen ni anclan: `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, todo lo que ignore `.gitignore` y los globs de `deny`. Se rechaza el texto de una entrada que parezca contener un secreto.

## Compatibilidad

- Un lector rechaza con un error explícito cualquier `format_version` que no conozca. Nunca adivina.
- Un cambio que los lectores antiguos interpretarían mal sube `format_version`.
- La memoria es un dato, no una instrucción: las herramientas nunca ejecutan el contenido de una entrada.
