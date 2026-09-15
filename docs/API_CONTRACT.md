# Contrato del API de Homelitics

Todo lo que este front puede asumir. Extraído de `docs/API_GUIDE.md`, `README.md`
y el código de `Luisrrodriguezg/homelitics-crm`. **Si algo no está aquí, no lo
uses**: verifícalo contra `https://homelitics-api.onrender.com/openapi.json` y,
si existe, agrégalo a este archivo en el mismo cambio.

Base: `https://homelitics-api.onrender.com`
Referencia viva: `/docs` (Swagger), `/redoc`, `/openapi.json`

## 1. Autenticación

`Authorization: Bearer <access_token de Supabase>` en todo salvo `/health` y los
docs.

El `sub` del token se resuelve contra `core.agent.auth_user_id`. Ese agente
define el `agency_id` de **toda** la petición; el front nunca manda un
`agency_id`. Los 48 agentes del proyecto ya tienen usuario provisionado.

Token por password grant:

```
POST ${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password
apikey: <anon key>
Content-Type: application/json
{"email": "...", "password": "..."}
-> { access_token, expires_in, refresh_token, ... }
```

- **401** token ausente, vencido o de otro proyecto.
- **403** token válido pero sin agente vinculado.

`X-Dev-Agent-Id` existe pero **solo funciona con el API corriendo contra una base
local**. No lo uses.

## 2. Convenciones

- **Dinero: string** con dos decimales (`"650137717.29"`). Nunca float.
- **Tiempos: UTC ISO-8601** con offset explícito (`2026-09-07T16:00:00Z`). Se
  envían igual. La aritmética de horarios ocurre en `America/Bogota`.
- **404 en vez de 403** para cualquier recurso de otra agencia. Un 404 raro casi
  siempre es un problema de a qué agencia pertenece el token.
- **Paginación**: `limit` (por defecto 50, máximo 200) y `offset`.
- **Errores**: `{"detail": "mensaje"}`, o el formato de Pydantic
  `{"detail":[{"loc":[...],"msg":"...","type":"..."}]}` en los 422. Confirmado
  contra `/openapi.json` el 2026-09-10: el array de Pydantic es solo para
  errores de validación de forma (falta un campo, tipo equivocado). Los 422 de
  regla de negocio — `scheduled_at` en el pasado, objeción desconocida, `LOST`
  sin razón — usan el `{"detail": "mensaje"}` simple, igual que los 409.
- **`current_stage` es caché de solo lectura.** Se mueve con transiciones.
- El servicio duerme a los 15 minutos sin tráfico; la primera petición tarda de
  30 a 60 segundos. Hay que preverlo en la UI.

## 3. Endpoints que usa la línea 2

### `GET /me`
```json
{ "id":"uuid", "agency_id":"uuid", "role":"TEAM_ADMIN|AGENT",
  "active":true, "full_name":"Hernando Carrillo", "email":null }
```
Primera llamada al depurar autenticación.

### `GET /health`
Abierta, sin token. Sirve para despertar el servicio.

### `GET /listings`
Catálogo de la agencia, más nuevo primero.
Filtros: `status` (`ACTIVE|PAUSED|CLOSED`), `operation_type` (`SALE|RENT`),
`city` (coincidencia exacta), `limit`, `offset`.

```json
{ "id":"uuid", "property_id":"uuid", "agent_id":"uuid",
  "operation_type":"SALE", "asking_price":"650137717.29", "status":"ACTIVE",
  "published_at":"2026-08-01T20:52:40.861578Z",
  "city":"Medellín", "neighborhood":"Manila",
  "address":"Transversal 80A # 81-57 Apto 206",
  "property_type":"APARTMENT", "area_m2":"83.80",
  "bedrooms":1, "bathrooms":1 }
```

`city`, `address`, `property_type`, `area_m2`, `bedrooms` y `bathrooms` son
**nullable** (confirmado contra `/openapi.json` el 2026-09-10: lo único
obligatorio es `id`, `property_id`, `agent_id`, `operation_type`,
`asking_price`, `status` y `published_at`). El ejemplo de arriba los muestra
completos porque ese listing puntual los tiene, no porque el API lo garantice.

### `GET /listings/{listing_id}`
Uno solo. 404 si no es de tu agencia.

### `POST /listings/{listing_id}/views`
`{"session_id":"web-abc123","client_id":null}`. Evento de vista, alimenta
analítica. `client_id` opcional.

### `GET /agents/{agent_id}/slots?from=&to=`  — **tarea 2.1**
Grilla de 30 minutos ya libre: reglas semanales, menos ausencias, menos visitas
que bloquean. Respuesta:
`{"agent_id": "...", "slot_minutes": 30, "duration_min": 30, "slots": ["<iso utc>", ...]}`.
`slot_minutes` confirmado contra `/openapi.json` el 2026-09-10; no estaba en
este documento antes de esa fecha.

También acepta un query param opcional `duration_min` (15 a 480, por defecto
30) que la respuesta devuelve tal cual en el campo `duration_min`: cada
horario que llega deja espacio para una visita de esa duración, no solo para
30 minutos. Confirmado contra el API real el 2026-09-14 (no estaba
documentado ni en `/openapi.json` el 09-10). El front no manda este parámetro
todavía — siempre pide visitas de 30 minutos, así que hoy `duration_min`
coincide con `slot_minutes` en la respuesta.

Confirmado por la línea 1 el 2026-09-03: **ya descuenta** las citas en
`PENDING_CONFIRMATION`, `CONFIRMED` y `RESCHEDULED`
(`services/availability.compute_slots` comparte la constante `_BLOCKING` con el
chequeo de solapamiento; probado en `tests/test_availability.py`).

- **422** si `from >= to`.
- La grilla es de 30 minutos: pedir una cita de 60 consume dos casillas.

### `GET /leads`
Tablero de leads de la agencia, actividad más reciente primero.
Filtros: `stage`, `agent_id`, `listing_id`, `limit`, `offset`.

Forma exacta de un lead, confirmada contra `/openapi.json` el 2026-09-10 (no
tenía ejemplo en este documento antes de esa fecha):
```json
{ "id":"uuid", "client_id":"uuid", "listing_id":"uuid", "agent_id":"uuid",
  "source_channel":"WHATSAPP", "current_stage":"VISIT_SCHEDULED",
  "created_at":"...", "updated_at":"..." }
```
Son estos 8 campos, nada más.

### `GET /leads/{lead_id}` · `GET /leads/at-risk?hours=&limit=`

### `POST /leads` — crear o devolver
`{"client_id","listing_id","source_channel":"WHATSAPP|IN_APP|CALL","message":"..."}`
- **201** nuevo. **200** ya existía, devuelve el mismo lead (el par
  `(client_id, listing_id)` es una sola conversación).
- **404** el listing no es de tu agencia o el cliente no existe.
- **No hay endpoint para crear clientes.** El `client_id` tiene que existir ya.

### `POST /leads/{lead_id}/appointments` — **tarea 2.2**
`{"scheduled_at":"2026-09-17T15:30:00Z","duration_min":30}`
`duration_min` entre 15 y 480, por defecto 60. **Usa 30 para que coincida con la
grilla de slots.**

**El estado con el que nace NO es siempre `PENDING_CONFIRMATION` — depende de
quién hace la petición, confirmado leyendo `services/appointment.py` del API
el 2026-09-14 (`request_visit`, la regla está comentada ahí mismo):**
```python
confirmed = (
    (agent.is_bot and has_scope(agent, "visits:manage"))
    or (not agent.is_bot and agent.id == lead.agent_id)
)
# status="CONFIRMED" if confirmed else "PENDING_CONFIRMATION"
```
Si quien hace el `POST` es un humano y **es el agente dueño del lead**, la
cita nace `CONFIRMED` directamente — el razonamiento del API es "el dueño
reservándola es su propio consentimiento". Solo nace `PENDING_CONFIRMATION`
cuando la reserva la hace alguien más (un bot en nombre del cliente, un
colega). **Esto importa mucho para L2: el proxy de este repo autentica
SIEMPRE como el mismo agente demo (`lib/session.ts`, etapa 1) — no existe una
identidad de cliente separada (`docs/API_CONTRACT.md` §6 ya lo dice: "no hay
identidad de cliente final"). Así que toda cita que la pantalla 2.2 crea para
un lead de ese mismo agente demo nace `CONFIRMED`, no `PENDING_CONFIRMATION`
como asumía el diseño original de la pantalla — no es un caso raro, es el
caso normal.** Ver bloqueo 5 de `docs/SPRINT_LINEA2.md`. **Resuelto el
2026-09-14:** la pantalla ya no asume un estado antes de crear la cita ni
anuncia "pendiente" en el mensaje de éxito — `ConfirmarCitaAcciones.tsx`
muestra el `status` real que devuelve el `POST` (insignia de `TarjetaCita` +
copy acorde), `CONFIRMED` incluido.
- **201** creada.
- **409 — lead en etapa terminal.** Confirmado contra el API real el
  2026-09-14 (no estaba documentado): `POST` sobre un lead `WON` o `LOST` da
  `{"detail": "Lead is LOST; a closed lead takes no visits"}` (o `WON` en el
  mensaje, según el caso). No es el 409 de solapamiento ni el de "visita ya
  abierta" de abajo — es un tercer caso distinto. `ConfirmarCitaAcciones.tsx`
  lo distingue (2026-09-14) matcheando `detail.includes("takes no visits")`,
  ya que el API no manda un código de razón propio.
- **409** se solapa con otra visita del agente. Los intervalos son semiabiertos:
  una visita que termina a las 11:00 no bloquea otra que empieza a las 11:00.
- **422** `scheduled_at` en el pasado.
- **409** además, *solo si `ENFORCE_AVAILABILITY=true`*, cuando el horario está
  fuera de la agenda publicada. **Valor en producción sin confirmar** (tarea 1.4
  de la línea 1).
- **409 — "el lead ya tiene una visita abierta".** Confirmado contra el API
  real el 2026-09-14, probando la pantalla 2.2 con un lead real: **no
  estaba documentado, y no es el mismo caso que el 409 de solapamiento de
  arriba.** Un lead solo puede tener una visita no terminal a la vez —
  intentar crear una segunda (aunque el horario esté libre en el agente) da:
  ```json
  {"detail": "Lead already has an open visit (<uuid>, PENDING_CONFIRMATION) at <iso>; PATCH /appointments/<uuid> to move it"}
  ```
  El mensaje mismo dice qué hacer: mover la visita existente con `PATCH
  /appointments/{id}`, no crear una nueva. **Distinguido (2026-09-14) en
  `components/ConfirmarCitaAcciones.tsx`**: matchea
  `detail.includes("already has an open visit")`, extrae el uuid de la cita
  existente del propio texto (único lugar donde el API lo da) con una regex,
  y ofrece un enlace a `/citas/{id}` (pantalla 2.3) en vez del mensaje
  genérico de "alguien más tomó ese horario".

La cita se crea sobre el lead, y el solapamiento se valida contra el **agente
dueño del lead**. Si muestras los slots del agente del listing y el lead
pertenece a otro agente, estás mostrando el calendario equivocado. Toma siempre
el `agent_id` del lead.

Forma exacta de una cita, confirmada contra `/openapi.json` el 2026-09-10 (no
tenía ejemplo en este documento antes de esa fecha):
```json
{ "id":"uuid", "lead_id":"uuid", "agent_id":"uuid",
  "scheduled_at":"...", "duration_min":30, "status":"PENDING_CONFIRMATION",
  "created_by":"uuid|null", "created_at":"...", "updated_at":"..." }
```
`created_by` confirmado contra el API real el 2026-09-14 (no estaba en este
documento): quién agendó la cita — un agente humano o una fila `AI_AGENT` —,
nulo en historial sembrado antes de que el campo existiera. En una cita que
crea el front, el API lo llena con el agente autenticado de la petición (el
agente demo, hoy), no con el cliente.

### `GET /leads/{lead_id}/appointments`
Misma forma de arriba (`AppointmentOut`), en un arreglo.

### `GET /appointments/{id}`
**Trae más campos que la forma de arriba.** Confirmado contra el API real el
2026-09-14 (no estaba documentado): además de todo lo de `AppointmentOut`,
esta ruta puntual agrega
```json
{ "listing_id":"uuid", "location":"dirección, barrio, ciudad",
  "agent_name":"string|null", "google_calendar_url":"https://..." }
```
`agent_name` viene resuelto por el API — **esto sí resuelve el bloqueo 4** de
`docs/SPRINT_LINEA2.md` ("no hay forma de resolver un `agent_id` a un
nombre"), pero solo para esta ruta puntual: `GET /listings/{id}` y
`GET /leads/{id}` siguen sin traerlo, así que el bloqueo sigue vigente ahí.
`GET /leads/{id}/appointments` y `PATCH /appointments/{id}` (abajo) siguen
devolviendo la forma simple, sin estos cuatro campos.

### `PATCH /appointments/{appointment_id}` — **tarea 2.3**
Al menos uno de `status`, `scheduled_at`, `duration_min`.

| status | significado |
|---|---|
| `PENDING_CONFIRMATION` | inicial |
| `CONFIRMED` | el agente aceptó |
| `RESCHEDULED` | movida (se pone sola al mover una `CONFIRMED` sin nombrar estado) |
| `CANCELLED`, `COMPLETED`, `NO_SHOW` | **terminales, no hay vuelta atrás** |

- **409** ya es terminal, o el nuevo horario se solapa.
- **422** nuevo `scheduled_at` en el pasado.

### `GET /leads/{lead_id}/interactions` — **tarea 2.4**
Del más viejo al más nuevo.

### `POST /leads/{lead_id}/interactions`
```json
{ "direction":"INBOUND|OUTBOUND", "channel":"WHATSAPP|IN_APP|CALL",
  "type":"MESSAGE|CALL|NOTE|STATUS_CHANGE", "body":"<=4000 chars",
  "occurred_at":"opcional, para retrofechar" }
```
Una nota manual del agente es
`{"direction":"OUTBOUND","type":"NOTE","channel":"IN_APP","body":"..."}`.
En `OUTBOUND` el `created_by` queda en el agente; en `INBOUND` queda nulo.

### `GET /leads/{lead_id}/tasks` · `POST` · `PATCH .../tasks/{task_id}`
`POST`: `{"due_at":"...","note":"<=1000 chars"}`.
`PATCH`: al menos uno de `status` (`PENDING|DONE|SNOOZED`), `due_at`, `note`.

Forma exacta de una tarea, confirmada contra `/openapi.json` el 2026-09-10:
trae también `agent_id` y `created_at`, ninguno documentado antes:
```json
{ "id":"uuid", "lead_id":"uuid", "agent_id":"uuid", "due_at":"...",
  "note":"...", "status":"PENDING", "created_at":"..." }
```

### `GET /leads/{lead_id}/transitions`
**Existe.** Confirmado contra `/openapi.json` el 2026-09-10 — corrige la
sección 6 de este documento, que decía lo contrario. Devuelve el log de
transiciones completo, del más viejo al más nuevo:
```json
{ "id":"uuid", "lead_id":"uuid", "from_stage":"INTERESTED|null",
  "to_stage":"VISIT_SCHEDULED", "changed_by":"uuid|null", "changed_at":"..." }
```
Es la fuente de verdad; `lead.current_stage` es una caché sobre este log.

### `POST /leads/{lead_id}/transitions`
`{"to_stage":"...","lost_reason":"...","note":"..."}`. `LOST` exige
`lost_reason`. El `note` queda como interacción `STATUS_CHANGE`.
- **409** salto ilegal o lead ya terminal. **422** `LOST` sin razón, o razón
  desconocida.

Saltos legales, confirmados contra `/openapi.json` el 2026-09-10 (no estaban
documentados): `INTERESTED → VISIT_SCHEDULED → VISITED → NEGOTIATING → WON`,
en ese orden estricto. Cualquier etapa no terminal puede saltar a `LOST`.
`WON` y `LOST` son terminales.

### `POST /appointments/{appointment_id}/feedback` — **tarea 2.5**
```json
{ "submitted_by":"AGENT|CLIENT", "interest_score":1-5,
  "objection":"PRICE|SIZE|LOCATION|CONDITION|HOA_FEE|OTHER",
  "close_probability":0-1, "free_text":"<=2000 chars" }
```
Todos opcionales salvo `submitted_by`.
- **201** creada.
- **200** *ya había feedback de ese mismo lado para esta cita* — confirmado
  contra `/openapi.json` el 2026-09-11 (no estaba en este documento antes):
  "Una segunda petición del mismo lado devuelve la primera con 200." Es decir,
  **como mucho una fila por lado** (`AGENT`, `CLIENT`) por cita: un segundo
  `POST` con el mismo `submitted_by` no crea una fila nueva ni da error, sólo
  devuelve la que ya existía. El front puede confiar en esto para no tener que
  evitar un doble envío a mano.
- **409 si la visita no está en `COMPLETED`.** Nadie la pone en `COMPLETED`
  automáticamente. Ver "Bloqueos" en `docs/SPRINT_LINEA2.md`.
- **422** código de objeción desconocido.
- **403** si quien manda `submitted_by:"AGENT"` es un agente de IA (no aplica
  a la línea 2: el front siempre manda `CLIENT` desde la pantalla del
  cliente).

Respuesta (`FeedbackOut`), confirmada contra `/openapi.json` el 2026-09-10; no
estaba documentada antes:
```json
{ "id":"uuid", "appointment_id":"uuid", "submitted_by":"CLIENT",
  "interest_score":4, "objection_id":"uuid|null",
  "close_probability":"0.60", "free_text":"...", "created_at":"..." }
```
Dos cosas que sorprenden: la objeción vuelve como `objection_id` (uuid contra
un catálogo del API), **no** el mismo string `PRICE|SIZE|...` que se manda en
`objection` — no hay forma documentada de resolver ese uuid a un texto legible
todavía. Y `close_probability` se manda como número (0-1) pero vuelve como
string, igual que los montos de dinero.

### `GET /appointments/{appointment_id}/feedback` — **tarea 2.5**
**No estaba en este documento antes del 2026-09-11.** No lo menciona
`docs/API_GUIDE.md` ni el `README.md` del repo del API; se encontró al
verificar `/openapi.json` contra el bloqueo 2 de `docs/SPRINT_LINEA2.md`
(hacía falta alguna forma de saber si el cliente ya había enviado la
encuesta, y no había ninguna documentada). Devuelve un arreglo con como mucho
una fila por lado (mismo límite que el `POST`, ver arriba):
```json
[{ "id":"uuid", "appointment_id":"uuid", "submitted_by":"CLIENT", ... }]
```
Misma forma que la respuesta del `POST` (`FeedbackOut`), en un arreglo de 0 a
2 elementos. **404** si la cita no existe o es de otra agencia. Úsalo para
decidir si mostrar el formulario o el estado "ya enviada" antes de intentar
el `POST`, en vez de esperar el error.

## 4. Errores que sí cambian la UI

| Situación | Código | Qué hace el front |
|---|---|---|
| El horario se ocupó entre la carga y el envío | 409 en `POST .../appointments`, `detail` sin match | Recargar los slots y pedir que elija otro. No es culpa del usuario. |
| El lead ya tiene otra visita abierta | 409 en `POST .../appointments`, `detail` incluye "already has an open visit" | Enlace a esa cita (`/citas/{id}`, id sacado del propio `detail`) en vez de mandar a la grilla. |
| El lead está en etapa terminal (`WON`/`LOST`) | 409 en `POST .../appointments`, `detail` incluye "takes no visits" | Mensaje de que la conversación ya se cerró, sin botón de reintentar. |
| Encuesta sobre una visita que no está `COMPLETED` | 409 en `.../feedback` | Mensaje explícito, no un error genérico. |
| Recurso de otra agencia, o id inexistente | 404 | Pantalla de "no encontrado". Sospecha del token antes que del id. |
| Cita ya cancelada o completada | 409 en `PATCH` | Deshabilitar las acciones y decir por qué. |
| Fecha en el pasado | 422 | Validar antes de enviar, no confiar en el API. |
| Token vencido | 401 | Renovar en `lib/session.ts`, reintentar una vez. |

## 5. Enumeraciones

| Conjunto | Valores |
|---|---|
| Etapa del lead | `INTERESTED`, `VISIT_SCHEDULED`, `VISITED`, `NEGOTIATING`, `WON`, `LOST` |
| Canal | `WHATSAPP`, `IN_APP`, `CALL` |
| Dirección de interacción | `INBOUND`, `OUTBOUND` |
| Tipo de interacción | `MESSAGE`, `CALL`, `NOTE`, `STATUS_CHANGE` |
| Estado de cita | `PENDING_CONFIRMATION`, `CONFIRMED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW` |
| Estado de tarea | `PENDING`, `DONE`, `SNOOZED` |
| Operación | `SALE`, `RENT` |
| Estado de listing | `ACTIVE`, `PAUSED`, `CLOSED` |
| Razón de pérdida | `PRICE`, `LOCATION`, `BOUGHT_ELSEWHERE`, `NO_RESPONSE`, `FINANCING`, `OTHER` |
| Objeción | `PRICE`, `SIZE`, `LOCATION`, `CONDITION`, `HOA_FEE`, `OTHER` |
| Rol de agente | `AGENT`, `TEAM_ADMIN` |
| Día de la semana | `0` lunes … `6` domingo |

## 6. Lo que el API NO tiene

- No hay forma de crear ni listar clientes. `POST /leads` exige un `client_id`
  que ya exista.
- No hay identidad de cliente final: toda petición se resuelve a un agente. Las
  vistas "de cliente" corren, por debajo, con credencial de agente.
- No hay websocket ni SSE. Para "tiempo real" se relee cada 5 segundos.
- No hay forma documentada de resolver `objection_id` (la respuesta de
  `.../feedback`) a un texto legible. Ver esa sección.

**Corrección 2026-09-10:** este documento decía que no había endpoint para leer
el historial de transiciones. Es falso — `GET /leads/{lead_id}/transitions`
existe y está documentado arriba. Pendiente de decidir si la tarea 2.4 lo usa.

## 7. Otros endpoints del API, no usados por la línea 2

Existen en `/openapi.json` pero ninguna pantalla de `docs/SPRINT_LINEA2.md` los
necesita hoy. Se listan para no reinventarlos si hiciera falta:

- `POST /leads/{lead_id}/reassign` — reasignar un lead a otro agente
  (`TEAM_ADMIN` solamente).
- `GET/POST /agents/{agent_id}/availability`,
  `PATCH/DELETE .../availability/{rule_id}` — las reglas semanales que
  alimentan `/slots`. Las mantiene la línea 1.
- `GET/POST /agents/{agent_id}/time-off`,
  `DELETE .../time-off/{off_id}` — ausencias del agente, también consumidas
  por `/slots`.
- `GET /analytics/funnel-daily`, `/analytics/agent-response-time`,
  `/analytics/listing-performance`, `/analytics/north-star` — métricas de
  agencia, no hay pantalla de línea 2 que las pida.
