# homelitics-web

Front de Homelitics (línea 2): del lado del cliente, agendar, mover, cancelar
y calificar visitas a propiedades; del lado del agente, el historial de un
lead, el tablero de leads por etapa (arrastrar entre etapas, cerrar como
ganado o perdido y consultar los perdidos) y, para el administrador del
equipo (`TEAM_ADMIN`), reasignar un lead a otro agente, filtrar por agente y
el embudo de conversión con exportación a CSV y PDF. Next.js 15 (App
Router) + TypeScript. El backend
(`Luisrrodriguezg/homelitics-crm`) es otro repo, lo mantiene otra persona, y
todo lo que este front puede asumir del API está en
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

Para las convenciones de código y arquitectura a fondo, `CLAUDE.md` es la
referencia completa. Este README es la puerta de entrada: cómo levantar el
proyecto y cómo probarlo.

## Requisitos

- Node 20 o superior (probado con Node 22) y npm.
- Git, para clonar el repo.
- No hace falta ninguna credencial para empezar: con `USE_MOCKS=true` la app
  corre entera sin tocar la red (ver más abajo).

## Arranque rápido (con datos de ejemplo, sin credenciales)

1. Clona el repo e instala las dependencias:
   ```bash
   git clone https://github.com/Gasvi281/homelitics-front.git
   cd homelitics-front
   npm install
   ```
2. Crea tu `.env.local` a partir del ejemplo. En macOS, Linux o Git Bash:
   ```bash
   cp .env.example .env.local
   ```
   En PowerShell:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   El ejemplo ya trae `USE_MOCKS=true` y `NEXT_PUBLIC_USE_MOCKS=true`: con
   eso no hace falta llenar nada más.
3. Levanta el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Abre **`http://localhost:3000/tablero`** (el tablero de leads) o
   cualquiera de las rutas de "Pantallas y cómo probarlas". La ruta raíz
   (`/`) todavía no tiene pantalla propia: solo dice "en construcción".

Si cambias algo de `.env.local`, para el servidor (`Ctrl+C`) y vuelve a
correr `npm run dev`: Next solo lee ese archivo al arrancar.

Otros scripts (`package.json`):

```bash
npm run build        # build de producción
npm run start         # sirve el build (después de build)
npm run lint           # eslint
npm run type-check   # tsc --noEmit
```

Antes de dar cualquier cambio por terminado, corre `type-check` y `lint`.

## Variables de entorno

Copia `.env.example` a `.env.local` y ajusta:

```
HOMELITICS_API_URL=https://homelitics-api.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key, es público por diseño>
DEMO_AGENT_EMAIL=<agente demo>
DEMO_AGENT_PASSWORD=<contraseña del agente demo>
USE_MOCKS=true
NEXT_PUBLIC_USE_MOCKS=true
```

- `USE_MOCKS` / `NEXT_PUBLIC_USE_MOCKS` **tienen que valer lo mismo** — el
  primero lo lee el servidor, el segundo es el espejo que Next mete al
  bundle del navegador (solo las variables `NEXT_PUBLIC_*` llegan ahí). Con
  `true`, nada toca la red: `lib/mock/index.ts` responde todo desde memoria.
- `DEMO_AGENT_EMAIL`/`DEMO_AGENT_PASSWORD` y las variables de Supabase solo
  hacen falta con `USE_MOCKS=false` (ver `lib/session.ts`): el servidor pide
  un token de agente a Supabase con esas credenciales y lo cachea. Sin ellas
  en modo mocks, la app arranca igual.
- El API real duerme a los 15 minutos sin tráfico. La primera petición del
  día puede tardar de 30 a 60 segundos — no es un error, todas las pantallas
  tienen un aviso para eso.

## Las dos formas de probar: mocks vs. API real

**Con `USE_MOCKS=true` (recomendado para empezar)** no hace falta ninguna
credencial. `lib/mock/index.ts` guarda estado en memoria mientras corre
`npm run dev`: crear una cita en la pantalla 2.2 se ve reflejada en la 2.3,
por ejemplo. Ese estado se pierde al reiniciar el servidor. Los ids fijos
para reproducir cada caso están en
[`lib/mock/README.md`](lib/mock/README.md) y resumidos más abajo.

Dos cosas que conviene saber de los mocks:

- **Servidor y navegador tienen cada uno su copia en memoria.** Lo que
  cambias desde el navegador (mover una tarjeta, marcar un lead como
  perdido) no lo ve una página que precarga el servidor, y recargar vuelve
  a mostrar la copia del servidor. Por eso, por ejemplo, un lead que pierdes
  en el tablero no aparece en `/tablero?etapa=LOST`. Con el API real no
  pasa.
- **Hay un interruptor para simular fallas y lentitud.** Desde la consola
  del navegador:
  ```js
  globalThis.__homeliticsMock = { latenciaMs: 2000, falla: "red" } // o "conflicto", "invalido"
  globalThis.__homeliticsMock = undefined                            // lo apaga
  ```
  `latenciaMs` demora todas las respuestas; `falla` hace fallar solo las
  escrituras (no las lecturas) con ese tipo de error. Así se prueban el
  409 y el 422 del tablero, o el aviso de "sin conexión". Hay dos opciones
  más:
  ```js
  globalThis.__homeliticsMock = { fallaAnalitica: "red" } // el embudo y los motivos fallan al leer
  globalThis.__homeliticsMock = { rol: "AGENT" }          // reasignar da 403 dentro del modal
  ```
  `rol` solo cambia lo que responde el `POST` de reasignar: el layout de
  agente lee `/me` en el servidor, así que para esconder los controles de
  admin hay que cambiar `agente.role` en `lib/mock/index.ts`.
- **El agente demo del mock es `TEAM_ADMIN`**, así que con mocks se ve todo
  lo de administrador (reasignar, filtro por agente, embudo).

**Con `USE_MOCKS=false`** el front pega contra el API real
(`HOMELITICS_API_URL`) con la credencial que resuelve `lib/session.ts`.
Hace falta un agente demo real (email/contraseña) provisionado en el
Supabase del proyecto, y los ids que uses tienen que existir de verdad en
esa base — no hay forma de "inventar" un lead o una propiedad. **Ojo:
cualquier acción que mande datos (crear/mover/cancelar una cita, agregar una
nota, enviar una encuesta, mover un lead de etapa, cerrarlo como ganado o
perdido, o reasignarlo) escribe en la base compartida de verdad.** Cerrar un
lead es definitivo y cancela sus visitas abiertas; cada reasignación deja
una fila en `assignment_audit`. No es un ambiente de prueba aislado.

### Probar contra el API real, paso a paso

1. **Cambia el modo y reinicia el servidor.** En `.env.local`:
   ```
   USE_MOCKS=false
   NEXT_PUBLIC_USE_MOCKS=false
   ```
   Next solo lee `.env.local` al arrancar — si el servidor ya estaba
   corriendo, párralo y vuelve a correr `npm run dev` (o usa una pestaña
   nueva del navegador si vienes de un reinicio, ver el quirk del dev server
   más abajo).

2. **Confirma que la credencial funciona antes de tocar ninguna pantalla.**
   El endpoint de humo pega directo al API real independientemente del modo
   mocks (usa `lib/homelitics.ts`, no los mocks):
   ```bash
   curl http://localhost:3000/api/homelitics/me
   ```
   Si responde `{"id":"...", "agency_id":"...", "role":"AGENT", ...}` con
   `200`, la credencial de `DEMO_AGENT_EMAIL`/`DEMO_AGENT_PASSWORD` es
   válida y el API está respondiendo. Un `500` en `/me` fue justo el bug de
   backend que bloqueó toda la migración a datos reales (ver
   `docs/PROGRESO.md`, entrada del 2026-09-11) — si vuelve a pasar, no es
   este repo, es del lado de `homelitics-crm`. La primera llamada del día
   puede tardar 30-60s (el servicio duerme sin tráfico); si da timeout,
   reintenta.

   Fíjate en el `role`: con `AGENT` la app funciona, pero no muestra nada de
   administrador (reasignar, "A cargo de", filtro por agente, enlace
   "Embudo") y `/embudo` solo dice que es para administradores. Para
   probar HU-08 y HU-17 hace falta que `DEMO_AGENT_EMAIL`/`PASSWORD` sean
   de un agente `TEAM_ADMIN`. La lista de agentes de la agencia sale de:
   ```bash
   curl http://localhost:3000/api/homelitics/agents
   ```

3. **Encuentra leads reales y entra directo a cada pantalla desde el
   navegador — sin ningún `curl`.** Para leads, lo más directo es
   **`http://localhost:3000/tablero`**: lista los leads abiertos de la
   agencia y cada tarjeta abre su historial (2.4); "Ver perdidos" muestra
   los cerrados. Las pantallas del cliente (2.1 a 2.5) reciben un id de
   listing o de cita ya conocido, por link, y para esos está
   **`http://localhost:3000/dev/explorar`**. No es una pantalla del sprint,
   es una herramienta de desarrollo. Lista hasta 15
   leads de la agencia (más recientes primero, o filtrados por etapa con los
   chips de arriba — `?stage=LOST`, por ejemplo), y por cada uno ya trae
   listo:
   - si es un lead **tuyo** (del agente demo) o **de otro agente** — importa,
     ver el punto 4;
   - la dirección de la propiedad y un link directo a **2.1** y **2.4** con
     el id ya puesto;
   - sus citas existentes, cada una con link directo a **2.3** y **2.5**.

   Para el caso puntual del punto 6 (lead en etapa terminal), filtra
   `?stage=LOST` o `?stage=WON` ahí mismo.

   Si preferís la línea de comandos, el mismo dato sale pegándole al
   **mismo proxy que usa la app** (agrega la credencial automáticamente, no
   hace falta ningún token a mano):
   ```bash
   curl http://localhost:3000/api/homelitics/listings
   curl "http://localhost:3000/api/homelitics/leads?agent_id=<id-de-/me>&stage=INTERESTED&limit=5"
   ```
   Filtros disponibles en `GET /leads`: `stage`, `agent_id`, `listing_id`,
   `limit`, `offset`. En `GET /listings`: `status`, `operation_type`, `city`,
   `limit`, `offset`. En `GET /agents`: `active`, `role`, `include_bots`,
   `limit`, `offset` (`docs/API_CONTRACT.md` §3).

   Para reasignar en vivo usa un lead de prueba, nunca uno real de la
   agencia (por ejemplo "Smoke Test User", ver `docs/PROGRESO.md`, entrada
   del 2026-09-28), y devuélvelo a su dueño al terminar.

4. **Ten presente el bloqueo 5 al elegir un lead para 2.2.** El estado con
   el que nace una cita depende de quién hace el `POST` — si el lead es de
   este mismo agente demo (que es el caso normal, ya que el proxy autentica
   siempre como él), la cita nace `CONFIRMED` de una, no
   `PENDING_CONFIRMATION`. No es un bug: la pantalla ya muestra el estado
   real que devuelva el API. Detalle completo en el bloqueo 5 de
   `docs/SPRINT_LINEA2.md`.

5. **Un lead solo acepta una visita abierta a la vez.** Si el lead que
   elegiste ya tiene una cita `PENDING_CONFIRMATION`/`CONFIRMED`/
   `RESCHEDULED` sin terminar, un segundo `POST /leads/{id}/appointments`
   da 409 ("Lead already has an open visit...") — la pantalla 2.2 ya lo
   distingue del solapamiento de horario y ofrece un enlace a esa cita
   existente. Para probar el camino de éxito de 2.2 de nuevo, usa un lead
   sin ninguna visita abierta (uno nuevo, o uno cuya única cita ya quedó
   `CANCELLED`/`COMPLETED`/`NO_SHOW`).

6. **El 409 de "lead en etapa terminal" necesita un lead `WON` o `LOST`.**
   En `/dev/explorar`, filtra `?stage=LOST` (o `WON`) para encontrarlo —
   suele haber varios en la agencia. Los tres tipos de 409 de crear una cita
   ya quedaron verificados en vivo (`docs/PROGRESO.md`, entrada del
   2026-09-15).

7. **Todo lo que escribas es real.** No hay ambiente aislado de pruebas:
   crear/mover/cancelar una cita, agregar una nota, enviar una encuesta o
   mover un lead en el tablero queda en la base compartida. Un lead ganado
   o perdido ya no se puede reabrir. Antes de reutilizar un lead que otro del
   equipo esté usando para una demo, avisa — `docs/PROGRESO.md` lleva un
   registro de qué leads/citas ya se tocaron en sesiones anteriores de
   prueba, para no pisarlos sin querer.

## Pantallas y cómo probarlas

### Mapa de rutas

Con `USE_MOCKS=true` todas estas URLs funcionan copiadas tal cual en
`http://localhost:3000` (los ids son los del mock, ver la tabla de abajo).

| Ruta | Qué prueba | Quién |
|---|---|---|
| `/propiedades/a10a1000-0000-4000-8000-000000000003/agendar?leadId=a10a1000-0000-4000-8000-000000000006` | 2.1 elegir horario (y de ahí 2.2 confirmar) | cliente |
| `/citas/a10a1000-0000-4000-8000-000000000009` | 2.3 mover o cancelar | cliente |
| `/citas/a10a1000-0000-4000-8000-00000000000a` | 2.3 con la cita cancelada | cliente |
| `/citas/a10a1000-0000-4000-8000-00000000000b/encuesta` | 2.5 encuesta: pregunta si fue | cliente |
| `/citas/a10a1000-0000-4000-8000-00000000000c/encuesta` | 2.5 encuesta: formulario directo | cliente |
| `/leads/a10a1000-0000-4000-8000-000000000006` | 2.4 historial, nota, "A cargo de" y "Reasignar" | agente / admin |
| `/leads/a10a1000-0000-4000-8000-000000000008` | 2.4 estado vacío | agente |
| `/leads/a10a1000-0000-4000-8000-00000000007e` | "Marcar como perdido" desde el detalle | agente |
| `/leads/a10a1000-0000-4000-8000-000000000082` | lead ya perdido ("Perdido en Visitó") | agente |
| `/tablero` | 2.8–2.10 tablero, arrastrar, ganar y perder | agente |
| `/tablero?etapa=LOST` | 2.12 lista de perdidos (`WON` para ganados) | agente |
| `/tablero?propiedad=a10a1000-0000-4000-8000-00000000006e` | filtro por inmueble (venta y arriendo) | agente |
| `/tablero?agente=a10a1000-0000-4000-8000-00000000001e` | HU-08 filtro por agente (Paula Gómez) | admin |
| `/embudo` | HU-17 embudo, motivos de pérdida, CSV y PDF | admin |
| `/embudo?operacion=RENT&agente=a10a1000-0000-4000-8000-00000000001f` | HU-17 con filtros (arriendo, Andrés Montoya) | admin |
| `/embudo?desde=2030-01-01` | HU-17 embudo vacío | admin |
| `/embudo?desde=2026-09-10&hasta=2026-09-01` | HU-17 rango al revés, frenado sin llamar al API | admin |
| `/dev/explorar` | herramienta: leads reales con links armados | desarrollo |
| `/api/mocktest` | herramienta: JSON con los casos del mock | desarrollo |

Todas las rutas de `(cliente)` reciben el `leadId`/`listingId` por query
string o por la URL — no hay sesión de cliente en el API (ver
`docs/API_CONTRACT.md` §6), así que el enlace en sí es el único control de
acceso. Las de `(agente)` tampoco exigen sesión todavía (`lib/session.ts`
sigue en la etapa 1, agente demo — ver `CLAUDE.md`).

Las URLs de abajo usan los ids fijos del mock para que se puedan copiar tal
cual con `USE_MOCKS=true`. Contra el API real (`USE_MOCKS=false`) las rutas
son exactamente las mismas — solo cambia qué id le pones, y esos salen de
`GET /listings`/`GET /leads` como se explicó arriba.

Con `USE_MOCKS=true`, estos son los ids fijos (`lib/mock/index.ts`):

| Qué es | Id |
|---|---|
| `LISTING_ID` (la propiedad del prototipo) | `a10a1000-0000-4000-8000-000000000003` |
| `LEAD_ID` (con historia completa: citas, tareas, interacciones) | `a10a1000-0000-4000-8000-000000000006` |
| `LEAD_ID_VACIO` (sin nada, para el estado vacío) | `a10a1000-0000-4000-8000-000000000008` |
| `APPOINTMENT_ID` (cita pendiente, jueves 17 10:30) | `a10a1000-0000-4000-8000-000000000009` |
| `APPOINTMENT_ID_CANCELADA` (para 2.3: acciones deshabilitadas) | `a10a1000-0000-4000-8000-00000000000a` |
| `APPOINTMENT_ID_NO_COMPLETADA` (para 2.5: da 409 al enviar encuesta) | `a10a1000-0000-4000-8000-00000000000b` |
| `APPOINTMENT_ID_COMPLETADA` (para 2.5: la encuesta sí procede) | `a10a1000-0000-4000-8000-00000000000c` |
| `LEAD_ID_NEGOCIANDO` (Daniel Henao, en Negociando: puede ir a Ganado o Perdido) | `a10a1000-0000-4000-8000-00000000007e` |
| `LEAD_ID_GANADO` (Santiago Posada, ya ganado: moverlo da 409) | `a10a1000-0000-4000-8000-000000000080` |
| `LEAD_ID_PERDIDO` (Felipe Correa, perdido desde Visitó por precio) | `a10a1000-0000-4000-8000-000000000082` |
| `PROPERTY_ID_DOBLE` (casa de Laureles en venta y en arriendo, para el filtro por propiedad) | `a10a1000-0000-4000-8000-00000000006e` |
| `AGENT_ID` (Hernando Carrillo, `TEAM_ADMIN`, el agente demo) | `a10a1000-0000-4000-8000-000000000001` |
| `AGENT_ID_PAULA` (Paula Gómez, `AGENT`, activa) | `a10a1000-0000-4000-8000-00000000001e` |
| `AGENT_ID_ANDRES` (Andrés Montoya, `AGENT`, activo) | `a10a1000-0000-4000-8000-00000000001f` |
| `AGENT_ID_INACTIVO` (Carlos Úsuga, desactivado: reasignarle da 409) | `a10a1000-0000-4000-8000-000000000020` |
| `AGENT_ID_BOT` (Asistente Homelitics, `AI_AGENT`: solo sale con `include_bots=true`; reasignarle da 409) | `a10a1000-0000-4000-8000-000000000021` |

El tablero trae 14 leads de ejemplo repartidos en las seis etapas (3 en
Interesado, 3 en Visita agendada, 2 en Visitó, 2 en Negociando, 2 ganados y
2 perdidos), repartidos entre los cuatro agentes humanos. El embudo, además,
suma una cohorte histórica de unos 120 leads que solo existe para analítica
y no sale en el tablero.

### 2.1 — Elegir horario

`/propiedades/{LISTING_ID}/agendar?leadId={LEAD_ID}`

Grilla semanal de 30 minutos agrupada por día, hora de Bogotá. Prueba
también sin `?leadId=` (la pantalla lo dice en vez de inventar un lead) y
navegando de semana en semana.

### 2.2 — Confirmar la cita

Se llega desde 2.1 al elegir un horario y pulsar "Continuar" (arma la URL
`.../agendar/confirmar?leadId=&horario=`). Para el caso de conflicto (409),
pide el mismo horario dos veces seguidas, o uno de los ya ocupados del mock
(lunes 09:00/10:30, martes 11:00, miércoles 09:00/09:30/10:00, viernes
10:00/11:30, hora de Bogotá).

Contra el API real, el estado con el que nace la cita depende de quién
reserva — ver bloqueo 5 en `docs/SPRINT_LINEA2.md`. La pantalla muestra el
estado real que devuelva el `POST`, no uno fijo.

### 2.3 — Mover o cancelar

`/citas/{APPOINTMENT_ID}` — prueba también `/citas/{APPOINTMENT_ID_CANCELADA}`
para ver las acciones deshabilitadas con el motivo a la vista. Esta pantalla
relee cada 5 segundos (`refetchInterval` de TanStack Query).

### 2.4 — Historial del lead

`/leads/{LEAD_ID}` — el embudo con la etapa actual, y una línea de tiempo que
mezcla interacciones, citas y tareas, con un campo para agregar una nota (se
guarda como interacción y aparece de inmediato). Prueba también
`/leads/{LEAD_ID_VACIO}` para el estado sin nada.

Si el lead está abierto, tiene el botón **"Marcar como perdido"** (2.11):
abre el mismo diálogo del tablero y, al confirmar, el embudo pasa a
"Perdido en <etapa>" y el historial muestra "Perdido: <motivo> — <nota>".
Pruébalo con `/leads/{LEAD_ID_NEGOCIANDO}`; `/leads/{LEAD_ID_PERDIDO}` ya
está perdido y muestra "Perdido en Visitó".

Al administrador le muestra además **"A cargo de <agente>"** y el botón
**"Reasignar"** (ver HU-08 abajo).

### 2.8 a 2.12 — Tablero de leads (HU-06 y HU-09)

`/tablero` — también está en el menú de arriba de las pantallas de agente.

- **Columnas** Interesado, Visita agendada, Visitó y Negociando, con las
  tarjetas de los leads abiertos (cliente, propiedad, última interacción).
  Cada tarjeta abre el historial del lead.
- **Filtros en la URL** (`?propiedad=&etapa=&desde=&hasta=`, y `agente=`
  solo para el admin): un enlace con filtros abre el tablero ya filtrado y
  recargar no los pierde. Un rango de fechas al revés se frena en el
  formulario.
- **Dueño de cada lead** (solo admin): la tarjeta dice qué agente la
  atiende.
- **Mover de etapa** arrastrando la tarjeta: solo se resaltan las columnas a
  las que el salto es legal (el embudo avanza de a una etapa). La tarjeta se
  mueve al instante; si el API responde 409, vuelve a su columna con un
  aviso. Con teclado: tabula hasta una tarjeta, espacio para tomarla,
  flechas izquierda y derecha para cambiar de columna, espacio para
  soltarla, Escape cancela.
- **Ganado** es una zona de soltar al final: pide confirmación porque es
  definitivo.
- **Perdido** es una zona que aparece abajo a la derecha solo mientras
  arrastras (con teclado, flecha abajo). Al soltar se abre un diálogo con el
  motivo (obligatorio) y una nota opcional; recién al confirmar la tarjeta
  sale del tablero. Cancelar la deja donde estaba.
- **Ver perdidos** cambia a `/tablero?etapa=LOST`: una lista de solo
  lectura de los leads cerrados (en el filtro de etapa se puede pasar a
  Ganado). "Volver al tablero activo" regresa.

Para probar los errores del tablero con mocks, usa el interruptor
`globalThis.__homeliticsMock` (sección de mocks, arriba): `falla:
"conflicto"` para el 409, `falla: "invalido"` para el 422 al marcar como
perdido, `falla: "red"` para ver el botón "Reintentar".

En pantallas táctiles el arrastre no arranca (las columnas necesitan el
scroll horizontal) y el menú "Mover a…" todavía no existe; ahí, para cerrar
un lead como perdido usa el botón del historial del lead.

### HU-08 — Reasignar un lead (solo `TEAM_ADMIN`)

En el historial de un lead abierto, `/leads/{LEAD_ID}`, el botón
**"Reasignar"** abre un diálogo con el selector de agente. El selector no
ofrece al dueño actual, a los desactivados ni a los bots, porque los tres
darían 409. Al confirmar, "A cargo de" cambia y el tablero lo refleja; no
queda línea en el historial, el agente nuevo no recibe notificación y las
tareas abiertas se quedan con el anterior (así funciona el API).

La lista de agentes sale de `GET /agents` (`features/agentes/`), que
también llena el filtro "Agente" del tablero y del embudo y el nombre del
dueño en las tarjetas.

Casos con mocks:
- Reasignar `LEAD_ID` a Paula o a Andrés: funciona. Ojo, el cambio vive en
  la copia del navegador y se pierde al recargar (ver "mocks", arriba).
- `globalThis.__homeliticsMock = { falla: "conflicto" }`: 409, se relee la
  lista y se puede reintentar.
- `globalThis.__homeliticsMock = { rol: "AGENT" }`: 403, el diálogo dice que
  solo un administrador puede reasignar y no deja reintentar.
- `GET /api/mocktest` cubre además reasignar al dueño, a un inactivo, al
  bot, a un id desconocido y sin agente.

### HU-17 — Embudo de conversión (solo `TEAM_ADMIN`)

`/embudo` — el enlace "Embudo" del menú solo aparece si el agente es admin;
a cualquier otro la página le dice que es para administradores y no llama
al API.

- **Filtros en la URL** (`?desde=&hasta=&propiedad=&operacion=&agente=`),
  con la misma mecánica del tablero: se envían con "Ver el embudo", recargar
  no los pierde y un rango al revés se frena sin llamar al API.
- **Gráfica y tabla** de cuántos leads llegaron a cada etapa, con la
  conversión desde la anterior y desde el total; la etapa con la mayor caída
  va marcada ("aquí se pierden más clientes"). Al final, cuántos se
  perdieron.
- **Motivos de pérdida**, con su propio selector de 30, 90 o 180 días: el
  API no acepta los filtros de arriba para este bloque y la pantalla lo
  dice.
- **Exportar**: "CSV" descarga el CSV que arma el API; "PDF" arma el PDF en
  el navegador con los filtros (con nombre de agente y de propiedad), la
  mayor caída y la tabla. El nombre del archivo lleva el rango
  (`embudo_2026-09-01_2026-09-30.csv`). Los botones se apagan con el embudo
  vacío, cargando, con error o con el rango al revés.

Casos con mocks: las URLs de HU-17 del mapa de rutas (filtros, vacío, rango
al revés) y `globalThis.__homeliticsMock = { fallaAnalitica: "red" }` para
ver el error y el "Intentar de nuevo" de los dos bloques.

### 2.5 — Encuesta post-visita

`/citas/{APPOINTMENT_ID}/encuesta`:

- `APPOINTMENT_ID` (jueves 17, en el futuro del mock): "todavía no llega la
  hora de tu visita", sin formulario.
- `APPOINTMENT_ID_CANCELADA`: "la encuesta ya no aplica".
- `APPOINTMENT_ID_NO_COMPLETADA`: pregunta "¿sí pudiste ir a la visita?".
  Con "Sí, fui a la visita" la marca `COMPLETED` (parche provisional del
  bloqueo 2, ver `docs/SPRINT_LINEA2.md`) y abre el formulario; con "No, no
  pude ir" no escribe nada. Abrir el link por sí solo nunca modifica la cita.
- `APPOINTMENT_ID_COMPLETADA`: abre el formulario directo.

### Dos herramientas de desarrollo, ninguna de las dos es una pantalla del sprint

- **`/dev/explorar`** — lista leads reales (filtrables por etapa) con links
  ya armados a las pantallas 2.1 a 2.5. Pensada para `USE_MOCKS=false`;
  ver "Probar contra el API real" arriba.
- **`GET /api/mocktest`** (solo tiene sentido con `USE_MOCKS=true`) llama a
  varias operaciones de `lib/homelitics.ts` de una sola vez y devuelve un
  JSON con éxito/error de cada una — útil para confirmar rápido que los
  mocks siguen respondiendo lo esperado después de tocar `lib/schemas.ts` o
  `lib/mock/index.ts`, sin pasar por ninguna pantalla. Cubre citas,
  tablero, `GET /agents` (con y sin bots, por rol, paginado), los casos de
  reasignar y el embudo con cada filtro, en JSON y CSV.

### Un quirk del dev server, para que no sorprenda

De vez en cuando (más frecuente si tocaste `lib/schemas.ts` o
`lib/mock/index.ts` en caliente, o si reiniciaste `npm run dev` con una
pestaña ya abierta) el navegador se queda pegado en `loading.tsx` de una
ruta. No es un bug de la app: es un artefacto del recargado en caliente
(HMR) del dev server. Primero
prueba abrir la URL en una **pestaña nueva**; si sigue, reinicia
`npm run dev`. Detalle completo en `docs/PROGRESO.md` (entradas del
2026-09-11 y 2026-09-14).

## Arquitectura, en corto

```
app/
  (cliente)/   quien busca vivienda, sin sesión
  (agente)/    quien gestiona leads: tablero, leads/[leadId], embudo;
               layout con TODO de sesión (etapa 2) que lee el rol de /me
  api/homelitics/[...path]/route.ts   el proxy — el navegador SIEMPRE pega acá
features/
  tablero-leads/          el tablero: query keys (claves.ts), hooks y componentes
  agentes/                GET /agents (useAgentes), SelectorAgente, NombreAgente,
                          y el agente actual (useEsAdmin)
  reasignar/              HU-08: el botón, el diálogo y la mutación
  embudo/                 HU-17: filtros, gráfica, tabla, motivos, CSV y PDF
lib/
  session.ts              la ÚNICA fuente de la credencial (server-only)
  homelitics.ts            cliente para Server Components: pega directo al API
  homelitics-navegador.ts  cliente para Client Components: pega al proxy
  homelitics-nucleo.ts      motor compartido (fetch + zod + errores)
  errores.ts                HomeliticsError, sin dependencias
  schemas.ts                zod: la forma de cada respuesta
  format.ts                  pesos colombianos y horas de Bogotá
  etapas.ts                  etapas del lead, etiquetas y saltos legales
  lineaTiempo.ts             arma y traduce la línea de tiempo del lead
  filtros-url.ts             lee filtros de la URL (tablero y embudo)
  agente-actual.ts           /me una vez por request, para el layout
  mock/                       datos falsos, misma forma que los reales
components/                   piezas compartidas (p. ej. ModalPerdido, EmbudoLead)
```

Reglas que no se rompen (el porqué está en `CLAUDE.md`, con la historia de
cómo se descubrieron):

- **El navegador nunca le habla al API directo.** Siempre pasa por
  `/api/homelitics/*`, que agrega la credencial del lado del servidor. El
  token no llega nunca al cliente ni a `localStorage`.
- **No importes `lib/homelitics.ts` desde un archivo `"use client"`.**
  Arrastra `lib/session.ts` (`server-only`) y Next niega el build. Los
  Client Components usan `lib/homelitics-navegador.ts` — misma API, mismos
  tipos, comparten `lib/homelitics-nucleo.ts`.
- **Todo dato del API pasa por `zod`** (`lib/schemas.ts`) antes de llegar a
  una pantalla, y los mocks se validan contra los mismos esquemas.
- **Las pantallas nunca ven códigos HTTP.** Los errores llegan como
  `HomeliticsError` con un `kind` legible (`lib/errores.ts`).

## Documentación relacionada

- [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — lo único que se puede
  asumir del API real: campos, errores, casos de 409 documentados.
- [`docs/SPRINT_LINEA2.md`](docs/SPRINT_LINEA2.md) — las tareas del sprint,
  criterios de "done" y los bloqueos conocidos (qué depende del backend y
  qué se resolvió del lado del front).
- [`docs/PROGRESO.md`](docs/PROGRESO.md) — bitácora cronológica: qué se hizo
  en cada sesión, qué se decidió y por qué, qué quedó pendiente.
- [`lib/mock/README.md`](lib/mock/README.md) — el origen narrativo de los
  datos de ejemplo y la tabla completa de ids fijos.
- `CLAUDE.md` — las convenciones del repo para quien vaya a escribir código
  acá (con Claude Code o sin él).
