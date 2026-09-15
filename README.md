# homelitics-web

Front de Homelitics (línea 2 del Sprint 4): cinco pantallas para agendar,
mover, cancelar y calificar visitas a propiedades, más el historial de un
lead para el agente. Next.js 15 (App Router) + TypeScript. El backend
(`Luisrrodriguezg/homelitics-crm`) es otro repo, lo mantiene otra persona, y
todo lo que este front puede asumir del API está en
[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).

Para las convenciones de código y arquitectura a fondo, `CLAUDE.md` es la
referencia completa. Este README es la puerta de entrada: cómo levantar el
proyecto y cómo probarlo.

## Requisitos

- Node 20 o superior.
- No hace falta ninguna credencial para empezar: con `USE_MOCKS=true` la app
  corre entera sin tocar la red (ver más abajo).

## Instalar y correr

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`. La ruta raíz (`/`) no tiene pantalla propia
todavía — entra directo a una de las rutas de la sección "Pantallas y cómo
probarlas".

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

**Con `USE_MOCKS=false`** el front pega contra el API real
(`HOMELITICS_API_URL`) con la credencial que resuelve `lib/session.ts`.
Hace falta un agente demo real (email/contraseña) provisionado en el
Supabase del proyecto, y los ids que uses tienen que existir de verdad en
esa base — no hay forma de "inventar" un lead o una propiedad. **Ojo:
cualquier acción que mande datos (crear/mover/cancelar una cita, agregar una
nota, enviar una encuesta) escribe en la base compartida de verdad.** No es
un ambiente de prueba aislado.

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

3. **Encuentra leads reales y entra directo a cada pantalla desde el
   navegador — sin ningún `curl`.** El front no tiene ninguna pantalla que
   liste leads o propiedades (las cinco pantallas del sprint siempre reciben
   un id ya conocido, por link — ver `docs/SPRINT_LINEA2.md`), así que se
   agregó una: **`http://localhost:3000/dev/explorar`**. No es una sexta
   pantalla del sprint, es una herramienta de desarrollo. Lista hasta 15
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
   `limit`, `offset` (`docs/API_CONTRACT.md` §3).

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
   crear/mover/cancelar una cita, agregar una nota o enviar una encuesta
   queda en la base compartida. Antes de reutilizar un lead que otro del
   equipo esté usando para una demo, avisa — `docs/PROGRESO.md` lleva un
   registro de qué leads/citas ya se tocaron en sesiones anteriores de
   prueba, para no pisarlos sin querer.

## Pantallas y cómo probarlas

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

`/leads/{LEAD_ID}` — mezcla interacciones, citas y tareas en una línea de
tiempo, y tiene un campo para agregar una nota (se guarda como interacción y
aparece de inmediato). Prueba también `/leads/{LEAD_ID_VACIO}` para el
estado sin nada.

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
  ya armados a cada una de las cinco pantallas. Pensada para `USE_MOCKS=false`;
  ver "Probar contra el API real" arriba.
- **`GET /api/mocktest`** (solo tiene sentido con `USE_MOCKS=true`) llama a
  varias operaciones de `lib/homelitics.ts` de una sola vez y devuelve un
  JSON con éxito/error de cada una — útil para confirmar rápido que los
  mocks siguen respondiendo lo esperado después de tocar `lib/schemas.ts` o
  `lib/mock/index.ts`, sin pasar por ninguna pantalla.

### Un quirk del dev server, para que no sorprenda

De vez en cuando (más frecuente si tocaste `lib/schemas.ts` o
`lib/mock/index.ts` en caliente, o si reiniciaste `npm run dev` con una
pestaña ya abierta) el navegador se queda pegado en `loading.tsx` de una
ruta. No es un bug de la app: es un artefacto de Turbopack/HMR. Primero
prueba abrir la URL en una **pestaña nueva**; si sigue, reinicia
`npm run dev`. Detalle completo en `docs/PROGRESO.md` (entradas del
2026-09-11 y 2026-09-14).

## Arquitectura, en corto

```
app/
  (cliente)/   quien busca vivienda, sin sesión
  (agente)/    quien gestiona leads, layout con TODO de sesión (etapa 2)
  api/homelitics/[...path]/route.ts   el proxy — el navegador SIEMPRE pega acá
lib/
  session.ts              la ÚNICA fuente de la credencial (server-only)
  homelitics.ts            cliente para Server Components: pega directo al API
  homelitics-navegador.ts  cliente para Client Components: pega al proxy
  homelitics-nucleo.ts      motor compartido (fetch + zod + errores)
  errores.ts                HomeliticsError, sin dependencias
  schemas.ts                zod: la forma de cada respuesta
  format.ts                  pesos colombianos y horas de Bogotá
  mock/                       datos falsos, misma forma que los reales
components/
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
