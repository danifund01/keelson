# Keelson — Plan 1: núcleo de memoria anclada

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLI `keelson` que crea, guarda, ancla con hash, verifica y gestiona el ciclo de vida de entradas de memoria en `.keelson/` dentro de un repo git.

**Architecture:** Paquete Node ESM en TypeScript estricto. Una entrada es un archivo markdown con frontmatter YAML validado con zod (formato v1, especificado en `spec/FORMAT.md`). Los anclajes guardan el hash SHA-256 de un rango de líneas normalizado y se reubican si el contenido se desplaza. Toda la lógica es local y determinista: no usa red ni LLM.

**Tech Stack:** Node ≥ 20, TypeScript 5 (strict), vitest, zod, yaml, picomatch, ulidx. Argumentos con `node:util` `parseArgs`, hash con `node:crypto`. CI en GitHub Actions (Windows + Ubuntu).

**Spec:** `docs/specs/2026-11-19-keelson-design.md` (§8.1, 8.2, 8.3, 8.5 y 8.9 en este plan).

**Serie de planes** (cada uno produce software probado por sí solo):
1. **Núcleo** (este plan).
2. Índice con presupuesto y compilación a `AGENTS.md`/`SKILL.md`.
3. Métricas de transcripts y hooks. Empieza con el prototipo desechable que comprueba el cierre brusco de la ventana en Windows. Incluye la caducidad de hipótesis, porque necesita contar sesiones, y el trailer `Memory-Resolves:`.
4. Visor HTML y statusline.
5. Arnés de experimentos y piloto en el repo laboratorio.

## Global Constraints

- Sin red y sin telemetría. Ningún comando hace peticiones de red.
- Licencia MIT. Código, identificadores, commits y `README.md`/`spec/FORMAT.md` en inglés; traducción en `README.es.md` y `docs/es/FORMAT.md`.
- Windows de primera clase: CI en `windows-latest` y `ubuntu-latest`, Node 20 y 22.
- Formato en disco con claves `snake_case` y `format_version: 1`. Una versión desconocida es un error explícito, nunca se ignora.
- Las entradas `rule` guardan su texto literal. Ningún código reescribe ni comprime cuerpos.
- Archivos prohibidos por defecto, que nunca se anclan ni se leen: `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json`, `backups/**`, `.claude/settings.local.json`, además de todo lo que excluya `.gitignore`.
- Presupuesto del índice raíz por defecto: 1500 tokens. Caducidad de hipótesis por defecto: 5 sesiones. Se guardan en la configuración aunque este plan no los use.
- Estimación de tokens: `Math.ceil(chars / 3.5)`, rotulada como estimación.
- Sin `any` ni `@ts-ignore`; no se añaden dependencias fuera de las listadas.
- `npm install`, `git init` y cualquier push requieren confirmación del usuario en el momento.

## Review Focus

1. **Archivos CRLF y rutas con `\` en Windows.** El mismo contenido con CRLF o LF debe dar el mismo hash. Una ruta `src\a.ts` se guarda como `src/a.ts`. → Tareas 3 y 4.
2. **Entrada editada a mano con frontmatter inválido.** `list` y `verify` reportan ese archivo y siguen con el resto, sin abortar. → Tarea 4.
3. **Anclaje a un archivo prohibido, binario, de más de 1 MiB o fuera del repo (`../x`).** `note` falla con un mensaje claro y no escribe nada. → Tareas 5 y 6.
4. **Archivo anclado borrado o renombrado con `git mv`.** La entrada pasa a `archived` (v1 no sigue renombres) y sale de lo vigente sin error. → Tarea 7.
5. **Dos `note` simultáneos.** Producen dos archivos distintos y ninguno se sobrescribe. → Tarea 4.

---

### Task 1: Esqueleto del repositorio

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `LICENSE`, `AGENTS.md`, `.github/workflows/ci.yml`, `bin/keelson.js`, `src/cli/run.ts`
- Test: `test/cli/version.test.ts`

**Interfaces:**
- Produces: `run(argv: string[], io: CliIo): Promise<number>` en `src/cli/run.ts`, donde `CliIo = { cwd: string; env: Record<string, string | undefined>; stdout: (s: string) => void; stderr: (s: string) => void; stdinIsTTY: boolean; now: () => Date }`. `bin/keelson.js` importa `dist/cli/run.js` y sale con el código que devuelve.

- [ ] **Step 1:** Pedir confirmación al usuario y ejecutar `git init -b main` en `D:\dev\keelson`. El spec ya existe en `docs/specs/`.
- [ ] **Step 2:** Escribir `package.json`:
  - `name: "keelson"`, `type: "module"`, `bin: {"keelson": "bin/keelson.js"}`, `engines.node: ">=20"`, `license: "MIT"`;
  - scripts `build` (`tsc -p .`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`);
  - `tsconfig` strict, `module`/`moduleResolution` `NodeNext`, `outDir: dist`;
  - `.gitignore` con `node_modules/`, `dist/` y `.keelson/.local/`.
- [ ] **Step 3:** Pedir confirmación y ejecutar `npm install -D typescript vitest @types/node` y `npm install zod yaml picomatch ulidx`.
- [ ] **Step 4:** Escribir el test que falla:

```ts
test('prints version from package.json', async () => {
  const out: string[] = [];
  const code = await run(['--version'], fakeIo({ stdout: (s) => out.push(s) }));
  expect(code).toBe(0);
  expect(out.join('')).toMatch(/^\d+\.\d+\.\d+\n$/);
});
test('unknown command exits 2 with usage on stderr', async () => { /* code === 2, stderr contains "Usage:" */ });
```

  `fakeIo` vive en `test/helpers/io.ts` y lo reutilizan todas las tareas.
- [ ] **Step 5:** Ejecutar `npm test` → FAIL (`run` no existe).
- [ ] **Step 6:** Implementar `run` con despacho de subcomandos mediante un mapa `Record<string, Command>`. Los comandos de las tareas siguientes se registran ahí.
- [ ] **Step 7:** Ejecutar `npm test` y `npm run typecheck` → PASS.
- [ ] **Step 8:** Escribir `LICENSE` (MIT, 2026, danifund01), `AGENTS.md` (reglas: TS estricto, TDD, sin red, sin dependencias nuevas sin justificar, formato como contrato) y `ci.yml` (matriz `windows-latest`/`ubuntu-latest` × Node `20`/`22`: `npm ci`, `typecheck`, `test`, `build`).
- [ ] **Step 9:** Commit: `chore: scaffold keelson package and CI`.

---

### Task 2: Formato v1 (esquema, archivo de entrada y especificación)

**Files:**
- Create: `src/format/schema.ts`, `src/format/entry-file.ts`, `spec/FORMAT.md`, `docs/es/FORMAT.md`
- Test: `test/format/entry-file.test.ts`

**Interfaces:**
- Produces (en `schema.ts`):
  - `FORMAT_VERSION = 1`
  - `KINDS = ['rule','finding','discard','decision','hypothesis'] as const`
  - `STATUSES = ['verified','hypothesis','disputed','stale','archived'] as const`
  - Tipos `Kind`, `Status`, `Anchor = { path: string; range: [number, number]; hash: string }`, `Provenance = { created: string; agent?: string; model?: string; session?: string; author?: string }`, `Confirmation = { at: string; session?: string; author?: string }`
  - `Entry = { id: string; kind: Kind; status: Status; area: string; summary: string; loadWhen: string[]; anchors: Anchor[]; provenance: Provenance; confirmations: Confirmation[]; contradicts: string[]; supersedes: string[]; resolvedBy: string | null; estTokens: number; body: string }`
- Produces (en `entry-file.ts`): `parseEntryFile(text: string): Entry`, que lanza `EntryParseError` (con `message`); y `serializeEntry(entry: Entry): string`.
- En disco, el frontmatter usa `format_version`, `load_when`, `resolved_by` y `est_tokens`. El cuerpo es el texto después del segundo `---`, sin modificar.

- [ ] **Step 1:** Escribir los tests:
  - `roundtrip preserves every field and body byte-for-byte`: `parseEntryFile(serializeEntry(e))` es igual a `e`, con un cuerpo que tiene acentos, `---` interno y espacios finales.
  - `rejects unknown format_version`: `format_version: 2` lanza un `EntryParseError` con `/format_version 2/`.
  - `rejects unknown kind` y `rejects summary longer than 160 chars`.
  - `rejects id that is not a ULID`.
  - `parses CRLF file identically to LF`.
- [ ] **Step 2:** Ejecutar `npm test -- entry-file` → FAIL.
- [ ] **Step 3:** Implementar. El esquema zod describe la forma en disco y se mapea a `Entry`; `summary` admite como máximo 160 caracteres y el id se valida con la regex ULID `^[0-9A-HJKMNP-TV-Z]{26}$`. Para serializar se usa `yaml.stringify` con orden de claves fijo, así el diff en git es estable.
- [ ] **Step 4:** Ejecutar `npm test -- entry-file` → PASS.
- [ ] **Step 5:** Escribir `spec/FORMAT.md` en inglés, con layout de carpeta, campos, estados, transiciones permitidas, normalización de hash (Tarea 3) y reglas de compatibilidad (un lector rechaza versiones mayores desconocidas). Traducir a `docs/es/FORMAT.md`.
- [ ] **Step 6:** Commit: `feat(format): define entry format v1 with parser and spec`.

---

### Task 3: Anclajes (normalización, hash y reubicación)

**Files:**
- Create: `src/anchor/hash.ts`, `src/anchor/locate.ts`
- Test: `test/anchor/hash.test.ts`, `test/anchor/locate.test.ts`

**Interfaces:**
- Produces:
  - `normalizeText(text: string): string`: quita el BOM, convierte CRLF y CR a LF y quita los espacios finales de cada línea.
  - `hashRange(text: string, range: [number, number]): string`: rango de líneas 1-based e inclusivo; devuelve `"sha256:<hex>"` y lanza `RangeError` si el rango es inválido o sale del archivo.
  - `createAnchor(text: string, repoPath: string, range: [number, number]): Anchor`.
  - `locateAnchor(anchor: Anchor, text: string): { kind: 'match' } | { kind: 'relocated'; range: [number, number] } | { kind: 'missing' }`.

- [ ] **Step 1:** Escribir los tests:
  - `same content with CRLF, LF and BOM hashes equal`.
  - `trailing whitespace does not change hash; inner whitespace does`.
  - `hashRange throws for [0,1], [3,2] and end beyond last line`.
  - `match when range content unchanged`.
  - `relocated when 3 lines inserted above`: el rango sale con `+3`.
  - `missing when anchored lines edited`.
  - `missing when content appears twice after shift (ambiguous)`.
  - `missing when file shorter than range`.
- [ ] **Step 2:** Ejecutar `npm test -- anchor` → FAIL.
- [ ] **Step 3:** Implementar. Para reubicar se usa una ventana deslizante del mismo número de líneas sobre el texto normalizado, comparando hashes. Una sola coincidencia da `relocated`; cero o varias dan `missing`. Ante la ambigüedad se elige lo seguro: no adivinar.
- [ ] **Step 4:** Ejecutar `npm test -- anchor` → PASS.
- [ ] **Step 5:** Commit: `feat(anchor): hash normalized line ranges and relocate shifted anchors`.

---

### Task 4: Repo, configuración y almacén

**Files:**
- Create: `src/store/repo.ts`, `src/store/config.ts`, `src/store/store.ts`
- Test: `test/store/repo.test.ts`, `test/store/config.test.ts`, `test/store/store.test.ts`, y el helper `test/helpers/tmp-repo.ts` (crea un repo git temporal con `git init`)

**Interfaces:**
- Produces (`repo.ts`):
  - `findRepoRoot(start: string): string`: sube hasta encontrar `.git`; lanza `NotARepoError`.
  - `toRepoPath(root: string, p: string): string`: ruta POSIX relativa; lanza `OutsideRepoError` si sale del repo.
  - `lastCommitterEmail(root: string, repoPath: string): string | null`: ejecuta `git log -1 --format=%ae -- <path>` y devuelve `null` si el archivo no tiene commits.
- Produces (`config.ts`):
  - `Config = { formatVersion: 1; rootIndexTokens: number; hypothesisExpirySessions: number; deny: string[]; trustedAuthors: string[] }`
  - `DEFAULT_CONFIG`, con `rootIndexTokens: 1500`, `hypothesisExpirySessions: 5`, `deny: []` y `trustedAuthors: []`.
  - `loadConfig(root: string): Config`: lee `.keelson/config.json`, fusiona con los valores por defecto y valida con zod; si el JSON es inválido lanza `ConfigError`.
- Produces (`store.ts`):
  - `keelsonDir(root)`.
  - `writeNewEntry(root: string, entry: Entry): void`: crea `entries/<id>.md` con la bandera `wx` y lanza error si ya existe.
  - `updateEntry(root: string, entry: Entry): void`: escribe en temporal y renombra.
  - `readEntry(root: string, id: string): Entry`.
  - `listEntries(root: string): { entries: Entry[]; errors: { file: string; message: string }[] }`, ordenado por id.

- [ ] **Step 1:** Escribir los tests:
  - `toRepoPath converts backslashes and rejects ../outside and other-drive absolute paths`.
  - `findRepoRoot from nested dir`.
  - `lastCommitterEmail returns null for untracked file and the author email after commit`.
  - `loadConfig returns defaults when file absent`.
  - `loadConfig throws ConfigError on invalid JSON`.
  - `writeNewEntry refuses existing id`.
  - `two concurrent writeNewEntry with different ids both persist`: `Promise.all` de 20 escrituras da 20 archivos.
  - `listEntries reports hand-corrupted file in errors and still returns the valid ones`.
  - `updateEntry leaves no temp files`.
- [ ] **Step 2:** Ejecutar `npm test -- store` → FAIL.
- [ ] **Step 3:** Implementar las firmas indicadas.
- [ ] **Step 4:** Ejecutar `npm test -- store` → PASS.
- [ ] **Step 5:** Commit: `feat(store): add repo discovery, config and entry storage`.

---

### Task 5: Guardas de archivos prohibidos y secretos

**Files:**
- Create: `src/guard/deny.ts`, `src/guard/secrets.ts`
- Test: `test/guard/deny.test.ts`, `test/guard/secrets.test.ts`

**Interfaces:**
- Produces:
  - `DEFAULT_DENY: readonly string[]`, con los globs de Global Constraints.
  - `isDenied(root: string, repoPath: string, config: Config): boolean`: aplica picomatch con `dot: true` sobre `DEFAULT_DENY` más `config.deny`, y luego `git check-ignore -q`.
  - `findSecret(text: string): string | null`: devuelve el nombre del patrón detectado.

- [ ] **Step 1:** Escribir los tests:
  - `denies .env, .env.local, nested/certificate.json, backups/x.sql, a.pem`.
  - `denies path ignored by .gitignore in tmp repo`.
  - `allows src/app.ts`.
  - `config.deny extends defaults and cannot remove them`.
  - `findSecret detects PEM private key header, AKIA key, sk- style key, JWT, password= assignment`.
  - `findSecret returns null for prose mentioning the word password`.
- [ ] **Step 2:** Ejecutar `npm test -- guard` → FAIL.
- [ ] **Step 3:** Implementar. Los patrones de secretos son regex locales y la lista queda en el archivo para revisarla.
- [ ] **Step 4:** Ejecutar `npm test -- guard` → PASS.
- [ ] **Step 5:** Commit: `feat(guard): block denied paths and secret-looking evidence`.

---

### Task 6: Ciclo de vida (crear, confirmar, disputar, resolver, promover y confianza)

**Files:**
- Create: `src/memory/lifecycle.ts`
- Test: `test/memory/lifecycle.test.ts`

**Interfaces:**
- Consumes: `createAnchor`, `isDenied`, `findSecret`, `toRepoPath` y `Config`.
- Produces:
  - `NewEntryInput = { kind: Kind; area: string; summary: string; body: string; anchors: { path: string; range: [number, number] }[]; loadWhen: string[]; contradicts: string[]; provenance: Omit<Provenance, 'created'>; human: boolean }`
  - `newEntry(root: string, input: NewEntryInput, config: Config, now: Date): Entry`: lanza `LifecycleError`.
  - `confirm(entry: Entry, by: { session?: string; author?: string }, now: Date): Entry`
  - `markDisputed(entries: Entry[]): Entry[]`
  - `resolve(entry: Entry, by: string): Entry`
  - `promote(entry: Entry, now: Date): Entry`
  - `effectiveStatus(entry: Entry, committerEmail: string | null, config: Config): Status`

- [ ] **Step 1:** Escribir los tests, con los oráculos escritos a mano:

| Test | Esperado |
|---|---|
| finding con anclajes válidos | `status: 'verified'`, `estTokens === Math.ceil((summary + body).length / 3.5)` |
| finding sin anclajes | `'hypothesis'` |
| kind `hypothesis` con anclajes | `'hypothesis'` |
| kind `rule` con `human: false` | `LifecycleError /rule requires a human/` |
| anclaje a `.env` | `LifecycleError /denied/`, sin escribir nada |
| anclaje a binario (byte NUL) o archivo > 1 MiB | `LifecycleError` |
| cuerpo con clave AKIA | `LifecycleError /secret/` |
| confirm desde otra sesión de una hipótesis con anclajes válidos | `'verified'` |
| confirm desde la misma sesión, o sin sesión | sigue `'hypothesis'`, pero registra la confirmación |
| newEntry con `contradicts: [b.id]` y luego `markDisputed([a, b])` | ambas `'disputed'` |
| resolve | `'archived'`, `resolvedBy` asignado |
| effectiveStatus de verified con committer fuera de `trustedAuthors` | `'hypothesis'` |
| effectiveStatus con committer `null` (entrada aún sin commit, local) | estado original |

- [ ] **Step 2:** Ejecutar `npm test -- lifecycle` → FAIL.
- [ ] **Step 3:** Implementar. El id sale de `ulid()` de `ulidx`; las rutas pasan por `toRepoPath`; la lectura es en UTF-8 y se rechaza el byte `\0`.
- [ ] **Step 4:** Ejecutar `npm test -- lifecycle` → PASS.
- [ ] **Step 5:** Commit: `feat(memory): add entry lifecycle with confidence rules`.

---

### Task 7: Verificación

**Files:**
- Create: `src/memory/verify.ts`
- Test: `test/memory/verify.test.ts`

**Interfaces:**
- Consumes: `locateAnchor`, `listEntries` y `updateEntry`. La confianza (`effectiveStatus`) se aplica al mostrar (`list`) y al compilar (Plan 2), no se persiste.
- Produces:
  - `verifyEntry(root: string, entry: Entry): { entry: Entry; changed: boolean; reason: 'ok' | 'relocated' | 'stale' | 'archived-file-deleted' }`
  - `verifyAll(root: string): { results: ReturnType<typeof verifyEntry>[]; errors: { file: string; message: string }[] }`: persiste los cambios.

- [ ] **Step 1:** Escribir los tests sobre un repo temporal:
  - `unchanged file keeps verified`.
  - `lines inserted above → relocated, range updated on disk, status kept`.
  - `anchored lines edited → stale`.
  - `anchored file deleted → archived`.
  - `git mv of anchored file → archived`.
  - `entries already archived are skipped`.
  - `stale entry whose content is restored returns to hypothesis`: vuelve en modo conservador y necesita una nueva confirmación.
  - `corrupt entry file appears in errors and others still verify`.
- [ ] **Step 2:** Ejecutar `npm test -- verify` → FAIL.
- [ ] **Step 3:** Implementar. Una entrada con varios anclajes toma el peor resultado: archivo borrado, luego `missing`, luego `relocated`, luego `match`. El estado `hypothesis` no sube a `verified` en la verificación; solo `confirm` o `promote` lo hacen.
- [ ] **Step 4:** Ejecutar `npm test -- verify` → PASS.
- [ ] **Step 5:** Commit: `feat(memory): verify anchors and update entry freshness`.

---

### Task 8: Comandos de la CLI y README

**Files:**
- Create: `src/cli/commands/{init,note,confirm,resolve,promote,rule,verify,show,list}.ts`, `README.md`, `README.es.md`
- Modify: `src/cli/run.ts` (registrar los comandos)
- Test: `test/cli/commands.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces, como contrato de salida (corta, para gastar pocos tokens del agente):

| Comando | Salida OK (stdout) | Código de salida |
|---|---|---|
| `init` | `ok init .keelson` | 0; 1 si ya existe |
| `note --kind <k> --area <a> --summary <s> [--body <t> \| --body-file <f>] [--anchor path:start-end]... [--load-when <glob>]... [--contradicts <id>]... [--session <s>] [--agent <a>] [--model <m>]` | `ok <id> <status>` | 0; 1 si hay error de validación |
| `confirm <id> [--session <s>]` | `ok <id> <status>` | 0 / 1 |
| `resolve <id> --by <ref>` | `ok <id> archived` | 0 / 1 |
| `promote <id>`, `rule add ...` | `ok <id> <status>` | 0; 3 sin TTY: `error: requires an interactive terminal (human only)` |
| `verify [--json]` | `ok verified=N relocated=N stale=N archived=N errors=N` | 0; 1 si `errors > 0` |
| `show <id>` | el archivo de la entrada | 0 / 1 |
| `list [--area a] [--status s] [--json]` | una línea por entrada: `<id> <status> <area> <summary>`, donde `status` es el efectivo: `effectiveStatus` con `lastCommitterEmail` del archivo de la entrada | 0 |

- `init` crea `.keelson/entries/`, `config.json` con `trustedAuthors: [<git config user.email>]` y `.keelson/.gitignore` con `.local/`. No instala hooks, eso es del Plan 3.
- La sesión sale de `--session` o de `env.KEELSON_SESSION`.
- Los errores van a stderr como `error: <message>`, sin trazas de pila.

- [ ] **Step 1:** Escribir los tests, una fila de la tabla por test, contra un repo temporal y usando `run()` con `fakeIo`. Además:
  - `note with denied anchor writes no file`.
  - `promote with stdinIsTTY false exits 3 and changes nothing`.
  - `note --anchor src\\a.ts:1-2 stores src/a.ts`.
  - `commands outside a git repo exit 1 with "not a git repository"`.
  - `list shows hypothesis for verified entry committed by author outside trustedAuthors`.
- [ ] **Step 2:** Ejecutar `npm test -- commands` → FAIL.
- [ ] **Step 3:** Implementar cada comando con `parseArgs` (`strict: true`, así los flags desconocidos dan error).
- [ ] **Step 4:** Ejecutar `npm test`, `npm run typecheck` y `npm run build`; comprobar a mano con `node bin/keelson.js --version` → todo PASS.
- [ ] **Step 5:** Escribir `README.md` (inglés: qué es, estado alfa, instalación local con `npm link`, comandos de este plan y enlace a `spec/FORMAT.md`) y `README.es.md` (traducción).
- [ ] **Step 6:** Commit: `feat(cli): add memory commands and README`.
