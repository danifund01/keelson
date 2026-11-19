# Diseño de keelson: memoria y contexto con presupuesto para agentes de código

Fecha: 2026-11-19 · Estado: aprobado (2026-11-19) · Proyecto: **keelson** · Repo: `github.com/danifund01/keelson` (cuenta personal; transferible a organización) · Paquete npm: `keelson`

## 1. Intención

Los agentes de código empiezan cada sesión desde cero. Pagan otra vez por cargar reglas fijas y por volver a leer el código para diagnosticar o investigar. Como leen de forma probabilística, cada sesión ve una parte distinta del proyecto: una encuentra algo que otra no vio, o pierde algo que otra sí vio. El conocimiento no se acumula, y el gasto se repite en cada sesión.

La herramienta convierte ese gasto repetido en conocimiento acumulado y verificable, compartido por cualquier agente o modelo. Además, muestra al usuario qué usa el agente y cuánto cuesta.

Público principal: usuarios de planes gratis y Pro, para quienes la cuota es el límite real. Que un modelo fuerte como Opus haga tareas largas con menos rondas de corrección solo es viable si cada sesión cuesta menos.

## 2. Objetivos

1. **Reducir el costo repetido entre sesiones.** Lo que una sesión averiguó (hallazgos, descartes, decisiones) lo hereda la siguiente, sin volver a leer.
2. **Cargar solo lo relevante.** Un índice con presupuesto fijo de tokens indica qué existe, cuándo cargarlo y cuánto cuesta. El resto se carga bajo demanda.
3. **Nunca servir conocimiento vencido como cierto.** Cada dato está anclado a evidencia con hash y se verifica antes de usarse.
4. **Una base para varios agentes.** Formato abierto en texto plano dentro del repo, compilado a los estándares que ya leen los agentes (`AGENTS.md`, `SKILL.md`).
5. **Visibilidad honesta.** El usuario ve qué cargó el agente, qué leyó en crudo, cuánto costó la memoria y dónde faltó.
6. **Medir, no prometer.** Métrica principal: tokens por tarea terminada y correcta, con y sin la herramienta.

## 3. No objetivos (v1)

- Filtrar las salidas de comandos (tests, builds). Para eso se integra RTK o tokf, que ya existen.
- Construir un grafo de código propio. Serena (LSP) o graphify pueden ser fuentes opcionales más adelante.
- Comprimir el texto de las reglas.
- Un servidor MCP como interfaz principal. Puede llegar después como complemento opcional.
- Un HUD detallado durante la sesión. En la v1 basta una statusline mínima.
- Servicios en la nube, cuentas o sincronización remota.

## 4. Anti-objetivos (fracaso aunque funcione)

- **La memoria cuesta más cuota de la que ahorra**, al crecer el repo, con sesiones concurrentes o al acumular basura.
- **Un dato vencido o falso se sirve con seguridad** y el agente deja de verificar. El benchmark stale-context-bench documenta este fallo.
- **Un error guardado se vuelve persistente** y lo heredan todas las sesiones siguientes.
- **El modelo hace la contabilidad.** Hashear, deduplicar, indexar o resumir con el LLM gasta tokens, como el observador de claude-mem.
- **Cifras infladas.** Por ejemplo, sumar el `usage` duplicado de los transcripts, o vender un «Nx» que no se midió.
- **Pisar archivos escritos por personas** (`AGENTS.md`, reglas) sin que el usuario lo vea y lo apruebe.
- **Filtrar secretos** al indexar, registrar métricas o mostrar el visor.

## 5. Restricciones

- Presupuesto cero: sin servicios pagos, todo local, distribución gratuita (npm).
- Windows de primera clase (el autor trabaja en Windows), además de macOS y Linux.
- Ningún proceso de la herramienta debe bloquear ni frenar la sesión del agente.
- Sin red: la herramienta no envía datos fuera de la máquina.
- El formato de memoria es un contrato versionado, independiente del código (ver §7.1).
- Repo propio. El repo laboratorio (un proyecto privado del autor) es solo el primer banco de pruebas.
- Licencia MIT. Documentación y README en inglés, con traducción al español (`README.es.md`, `docs/es/`). Código, identificadores y commits en inglés.

## 6. Línea base medida (repo laboratorio, sesión del 2026-11-19)

Datos tomados de los campos `usage` del transcript local, deduplicados por `message.id` + `requestId`:

| Medida | Tokens |
|---|---|
| Contexto fijo en la primera petición (escritura de caché) | 48.674 |
| Reglas del proyecto siempre cargadas (`AGENTS.md`, `CLAUDE.md` y 3 reglas sin `paths:`), unos 13,9 KB | ≈ 4.000 (estimado) |
| Sesión de 13 peticiones: lectura de caché / escritura / salida | 716.025 / 157.291 / 20.905 |

Qué se desprende:

- La lectura de caché es unas 34 veces la salida, así que comprimir la salida ataca la parte menor.
- La mayor parte del contexto fijo **no** son las reglas del proyecto: son el arnés, los plugins, las skills y las instrucciones de MCP. El visor debe dejar visible ese reparto (ver §10).
- La suma sin deduplicar daba unas 2,8 veces más. Deduplicar es obligatorio.

## 7. Enfoques considerados

| Enfoque | Resultado |
|---|---|
| Solo prompts o skills, sin código (al estilo Cline memory bank) | Descartado: el agente haría la contabilidad y gastaría tokens |
| MCP como interfaz principal | Descartado como núcleo: los esquemas de sus herramientas son contexto fijo en cada sesión |
| **A. CLI en TypeScript/Node, distribuido por npm** | **Elegido** |
| B. Binario en Rust o Go | Aplazado: no es el stack del autor, la comunidad contribuye menos y se itera más lento |
| C. Híbrido (TS ahora; si se mide lentitud, el camino caliente pasa a Rust) | Adoptado como disciplina: el formato es un contrato estable, así que otro motor puede leerlo y escribirlo |

Decisión del usuario: **A con la disciplina de C.**

## 8. Diseño

### 8.1 Formato abierto (contrato)

- Una especificación versionada (`spec/FORMAT.md` con `formatVersion`) separada del código. Cualquier motor o agente puede implementarla.
- Carpeta en el repo del usuario, por ejemplo `.keelson/`.
  - `entries/<ULID>.md`: una entrada por archivo, con frontmatter y cuerpo breve.
  - `config.(json|yaml)`: presupuestos, áreas, globs prohibidos y caducidades.
  - `.local/`: estado de la máquina (cursores de transcripts, caché de métricas). Va en `.gitignore`.
- Campos de una entrada:
  - `id` (ULID) y `kind`: `rule`, `finding`, `discard`, `decision` o `hypothesis`.
  - `status`: `verified`, `hypothesis`, `disputed`, `stale` o `archived`.
  - `area` y `load_when`: globs de rutas o disparadores declarados.
  - `anchors[]`: `{ path, range, hash }`.
  - `evidence`: qué se observó; texto breve, sin secretos.
  - `provenance`: agente, modelo, id de sesión, fecha y autor de git.
  - `confirmations[]`.
  - `contradicts[]` / `supersedes[]`.
  - `resolved_by`: commit o id de entrada.
  - `est_tokens`: lo calcula la herramienta, nunca el agente.
- Las entradas `rule` guardan el texto **literal**: nunca se comprime.

### 8.2 Escritura de la memoria (confianza C)

- **Quién escribe:** el agente, de forma explícita, mediante un comando de la CLI (por ejemplo `note`, `discard` o `confirm`). Una skill pequeña le indica cuándo hacerlo. Así el gasto es mínimo e intencional. *Mi decisión:* no hay extracción semántica automática desde transcripts con un LLM, porque eso es justo el costo que queremos evitar. Los transcripts se usan solo para métricas (§8.7).
- **`verified`:** solo si todos sus anclajes existen y su hash coincide al escribir.
- **`hypothesis`:** una conclusión sin evidencia directa. Pasa a `verified` cuando otra sesión independiente la confirma (otro id de sesión), o cuando una persona la aprueba. Expira tras N sesiones sin confirmarse (N=5 por defecto, configurable).
- **`disputed`:** si dos entradas se contradicen, se conservan ambas. Esa área del índice dice «verificar» hasta que la evidencia decida.
- **`rule`:** solo una persona la crea o la promueve. El agente puede proponer, no promover.
- **Origen externo:** las entradas que llegan de autores de git ajenos al repo, o de PR externos, entran como `hypothesis` sin importar lo que declaren. Es la defensa contra el envenenamiento.

### 8.3 Frescura e invalidación

- **Anclaje:** hash del contenido normalizado del rango anclado, junto con la ruta.
  - Si el rango se desplazó, se busca el mismo contenido dentro del archivo y se reubica sin perder el estado.
  - Si no aparece, la entrada pasa a `stale`. *Mi decisión;* el método exacto de reubicación queda al constructor.
- **Se verifica:** al compilar el índice, al consultar una entrada y con el hook de git `post-commit` sobre los archivos tocados.
- **Archivo borrado:** las entradas ancladas a él pasan a `archived`. Salen del índice y siguen en el historial de git.
- **Fix como invalidación:** un `finding` que describe un bug o un rodeo se cierra con `resolve <id>` o con un trailer de commit (`Memory-Resolves: <id>`). Pasa a `archived` con `resolved_by`.
- **Ruido:** las entradas que nunca se consultan bajan de prioridad y salen del índice raíz, aunque siguen accesibles por área.

### 8.4 Índice con presupuesto y compilación

- **Índice raíz generado:** una línea por área con `area | cargar-si | costo estimado | resumen | frescura`. Tiene un presupuesto fijo de tokens (por defecto 1.500, configurable) que **no crece con el repo**; si se excede, se agrupa en más niveles.
- **Compilación por destino:**
  - `AGENTS.md` mínimo: reglas universales más un puntero al índice.
  - Un `SKILL.md` por área, cuya `description` hace de disparador.
  - Copias en las rutas de cada agente (`.claude/skills`, `.agents/skills`, `.gemini/skills`).
- **Archivos escritos por personas:** nunca se sobrescriben. La compilación genera en rutas propias o muestra un diff y pide confirmación. Los archivos generados llevan una cabecera «generado, no editar».
- **Commit:** los artefactos generados se versionan, para que los agentes sin la herramienta (por ejemplo en la nube) los lean. Si hay conflicto, se resuelve regenerando.
- **Frescura visible:** un área con entradas `stale` o `disputed` lo declara en el índice («verificar antes de usar»), nunca lo afirma.
- **Estimación de tokens:** heurística local. Se rotula como estimación.
- **Idioma:** el índice, los metadatos y las claves generados van en inglés, que es universal entre agentes y suele tokenizar más barato. Las reglas y la evidencia conservan su idioma original, literal. *Mi decisión.*

### 8.5 Concurrencia y ramas

- Una entrada por archivo con ULID, así que dos sesiones no escriben el mismo archivo.
- El índice y lo compilado son derivados: se regeneran, no se fusionan a mano.
- La memoria vive en la rama. Lo aprendido en `feat/x` llega con el merge, y si la rama se descarta, su memoria se va con ella.

### 8.6 Automatización (hooks)

| Disparador | Acción |
|---|---|
| `SessionStart` | Recuperación: procesa transcripts pendientes |
| `Stop` | Incremental del turno |
| `SessionEnd` | Cierre completo |
| git `post-commit` | Revalida anclajes de los archivos tocados |

- Cada hook lanza un proceso en segundo plano, desacoplado, y termina al instante. Se procesa de forma idempotente, con un cursor por transcript en `.local/`.
- El cierre brusco de la ventana en Windows puede no disparar `SessionEnd`; la recuperación lo cubre. Se verifica en un prototipo desechable antes de la implementación.
- Para agentes sin hooks, existe el comando manual `process`.
- `init` instala los hooks de Claude Code sumándolos a la configuración existente, nunca la reemplaza.

### 8.7 Métricas

- **Fuente:** transcripts JSONL locales. En la v1, Claude Code; Codex queda detrás de una interfaz de adaptador (ver §11).
- **Qué se lee:** solo los campos `usage`, el modelo, los nombres de herramientas y las rutas leídas. **Nunca** el contenido de los mensajes ni de los resultados de herramientas.
- **Deduplicación** obligatoria por `message.id` + `requestId`, con una prueba de regresión.
- **Por sesión:** contexto fijo inicial, lecturas y escrituras de caché, salida, modelo y número de peticiones.
- **Lecturas crudas con memoria fresca:** lecturas de archivos cubiertos por entradas frescas. Señalan huecos o desconfianza en el índice.
- **Costo de la memoria:** tokens estimados del índice y de las skills cargadas.
- **Equivalencia con cuota:** estimada con los pesos de precio de la API (lectura de caché ≈ 0,1x, escritura ≈ 1,25x) y **rotulada como estimación**. El dato real de cuota solo lo da `/usage`.
- **Ahorro:** no se inventa por sesión. Se mide con experimentos controlados (§9). El visor muestra costos medidos y, por separado, el resultado de los experimentos.

### 8.8 Visor

- **HTML estático local** generado por `view`, sin servidor ni red. Todo dato de usuario se escapa.
- **Vistas:**
  1. Mapa del proyecto por estado de memoria: fresca, a revalidar, en disputa o sin cobertura.
  2. Sesión: qué cargó, cuánto costó, lecturas crudas y huecos sugeridos.
  3. Balance: costo de la memoria frente a la línea base y los experimentos.
- **Statusline mínima**, por ejemplo `ctx 62% · índice 1.4k · crudas con memoria: 3`. Corre local y no gasta tokens del modelo.

### 8.9 Seguridad y privacidad

- **Nunca se leen ni se indexan:** lo que excluya `.gitignore`, más una lista de prohibidos configurable. Por defecto incluye `.env*`, `.dev.vars*`, `*.pem`, `*.key`, `certificate.json`, `deployment-info.json` y `backups/`. El laboratorio prohíbe además `.claude/settings.local.json`.
- **Evidencia:** se rechazan las entradas que parezcan contener secretos. Se reutiliza el patrón de detección del laboratorio si encaja; *decisión del constructor.*
- **La memoria se trata como dato, no como instrucción.** El índice compilado lo indica, y el visor nunca ejecuta su contenido.
- **Sin telemetría** propia.

## 9. Plan de medición (laboratorio)

- **Aislamiento:** dos worktrees de git desde el mismo commit: `lab-con` (con la herramienta: memoria, skills compiladas y hooks) y `lab-sin` (sin ella). Misma configuración de usuario y de plugins, memoria automática de Claude Code desactivada en ambos, mismo modelo y mismo esfuerzo.
- **Tareas con juez objetivo:** se toman commits `fix(...)` del laboratorio que incluyen prueba de regresión. Se parte del commit anterior al fix y al agente se le da el síntoma, no la solución. El juez es el test del commit real, oculto al agente y aplicado al final.
- **Series:** se miden series de 2 o 3 tareas de la misma área, en orden, para capturar la acumulación. En `lab-con`, cada tarea hereda la memoria de las anteriores; en `lab-sin`, cada una empieza de cero. El total de la serie incluye lo que costó escribir la memoria.
- **Ejecución automatizada:** con `claude -p --output-format json`, que registra el uso de cada corrida. Si el test oculto falla, se devuelve la salida del fallo al agente, hasta 3 rondas. Así se mide el total hasta que quede correcto.
- **Orden alternado** entre `con` y `sin`, y en el mismo día, para neutralizar cambios de modelo o de carga.
- **Cuota por fases:** primero un piloto de 1 serie de 2 tareas × 2 corridas por lado (8 sesiones Opus, repartidas en dos ventanas de 5 horas). Con la variación observada se decide cuántas corridas tendrá la medición, probablemente 2 o 3 series × 3 corridas por lado. Los datos del piloto se conservan y cuentan.
- **Métrica:** tokens hasta tener la tarea correcta (equivalente de cuota estimado). Secundarias: rondas de corrección, lecturas crudas y tiempo de reloj (solo informativo).
- **Comparativa de modelos:** con los mismos datos se compara Opus frente a Sonnet en tokens por tarea correcta, para probar o refutar la hipótesis de las rondas de corrección.
- **Después:** benchmarks públicos de memoria, AMB (memorias ausentes, vencidas o contradictorias) y MemSecBench (envenenamiento).

## 10. Integración con el laboratorio

- Se instala de forma opcional, en una rama `chore/*` del repo laboratorio, con su propio PR, respetando sus reglas.
- `AGENTS.md` y `.claude/rules/` del laboratorio no se reemplazan hasta que la medición lo justifique. Al principio, la herramienta solo genera en rutas propias y mide.
- Auditoría del contexto fijo: el visor reporta el reparto del contexto inicial. En el laboratorio, unos 48,7k tokens frente a ≈4k de reglas propias. Si el transcript no basta para desglosarlo, se toma de `/context`; *decisión del constructor* cómo obtenerlo.

## 11. Lo que queda al constructor

- Estructura interna del paquete, librerías (validación con zod, ULID, hashing), tests y CI del repo.
- Heurística de tokens, algoritmo de reubicación de anclajes y formato exacto del índice, dentro del presupuesto.
- Diseño visual del visor, dentro de las tres vistas.
- Adaptador de transcripts de Codex: interfaz en la v1, implementación cuando haya datos de prueba.

## 12. Fuera de v1 (orden tentativo)

1. Adaptador de Codex y prueba de las skills compiladas en Gemini CLI y Cursor.
2. HUD detallado.
3. MCP opcional para consultas.
4. Integración con RTK o tokf y con Serena o graphify como fuentes verificadas por hash.
5. Motor alternativo en Rust para el camino caliente, si la medición lo pide.
