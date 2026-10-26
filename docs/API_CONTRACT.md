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
  regla de negocio — `scheduled_at` en el pasado, objeción desconocida — usan
  el `{"detail": "mensaje"}` simple, igual que los 409.
  **Corrección 2026-09-27:** `LOST` sin razón **no** es de los simples. Leyendo
  `app/schemas.py` del API, esa regla vive en un `model_validator` de
  `TransitionCreate`, así que sale con el **array de Pydantic**, aunque
  `/openapi.json` anuncie `Message` para ese 422. Ver
  `POST /leads/{lead_id}/transitions`. El front tiene que aceptar las dos
  formas en cualquier 422.
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

### `GET /leads` — **HU-06, tablero**
Tablero de leads de la agencia, una tarjeta por lead, ordenado por
`updated_at` descendente (actividad más reciente primero).

**Corrección 2026-09-27:** este documento decía que la respuesta eran los 8
campos de `LeadOut` "nada más" y solo tres filtros. Ya no: confirmado contra
`/openapi.json` y contra `app/routers/leads.py` / `app/services/lead.py` del
API el 2026-09-27, la respuesta es `list[LeadCard]` y hay más filtros.

Query params, todos opcionales:

| Param | Tipo | Notas |
|---|---|---|
| `stage` | etapa del lead | etapa actual |
| `agent_id` | uuid | agente dueño |
| `listing_id` | uuid | una publicación |
| `property_id` | uuid | el inmueble físico: **todas** sus publicaciones, `SALE` y `RENT` |
| `client_id` | uuid | es como el bot encuentra los hilos de un cliente que vuelve |
| `created_from` | fecha `YYYY-MM-DD` | día inclusivo, desde la medianoche local |
| `created_to` | fecha `YYYY-MM-DD` | día inclusivo, hasta la medianoche local del día siguiente (exclusiva) |
| `active` | bool, por defecto `false` | `true` oculta `WON` y `LOST` |
| `limit` | 1–200, por defecto 50 | |
| `offset` | ≥ 0, por defecto 0 | |

- Los días de `created_from`/`created_to` se interpretan en `APP_TIMEZONE`
  del API. `/openapi.json` solo dice "the agency's timezone"; el valor
  `America/Bogota` sale de `app/config.py` (es el por defecto de esa
  variable). Valor en producción asumido, no confirmado.
- **422** si `created_from > created_to`, con `{"detail": "created_from is
  after created_to"}` (forma simple). Un mismo día en los dos es válido.
- `active=true` es el tablero de trabajo. Un lead `WON`/`LOST` sale de ahí
  pero sigue consultable con `stage=WON` o `stage=LOST` (la descripción del
  endpoint lo dice así). Qué pasa con `active=true` junto con `stage=WON` o
  `stage=LOST` no está documentado: el front no los combina.

Forma exacta de una tarjeta (`LeadCard`), confirmada contra `/openapi.json` el
2026-09-27. Son los 8 campos de `LeadOut` más seis:
```json
{ "id":"uuid", "client_id":"uuid", "listing_id":"uuid", "agent_id":"uuid",
  "source_channel":"TELEGRAM", "current_stage":"VISIT_SCHEDULED",
  "created_at":"...", "updated_at":"...",
  "client_name":"string|null",
  "listing_address":"string|null",
  "neighborhood":"string|null",
  "operation_type":"SALE|RENT",
  "asking_price":"650137717.29",
  "last_interaction": { "occurred_at":"...", "direction":"INBOUND|OUTBOUND",
                        "type":"MESSAGE|CALL|NOTE|STATUS_CHANGE",
                        "body":"string|null" } | null }
```
- Obligatorios: los 8 de `LeadOut`, `operation_type` y `asking_price`
  (string, como todo el dinero).
- **Nullable**: `client_name`, `listing_address`, `neighborhood` y
  `last_interaction` completo. Dentro de `last_interaction`, `body` también es
  nullable y no viene marcado obligatorio.
- `last_interaction.body` es un **avance**, no el texto completo: el servicio
  lo corta a 140 caracteres en SQL (`_PREVIEW_CHARS` en
  `app/services/lead.py`). El texto completo está en
  `GET /leads/{id}/interactions`.
- `client_name` resuelve **para el tablero** el bloqueo 6 de
  `docs/SPRINT_LINEA2.md`. `GET /leads/{id}` sigue devolviendo `LeadOut`
  sin nombre.
- La tarjeta no trae el nombre del agente ni la ciudad.

`GET /leads/{id}`, `POST /leads` y `POST /leads/{id}/reassign` siguen
devolviendo `LeadOut` (los 8 campos). No asumas que un `LeadOut` trae los
campos de la tarjeta.

### `GET /leads/{lead_id}` · `GET /leads/at-risk?hours=&limit=`

`GET /leads/{lead_id}` devuelve `LeadOut`.

**`GET /leads/at-risk` — HU-10, HU-13.** Confirmado contra `/openapi.json` y
contra `routers/leads.py` y `services/lead.py` del API el 2026-10-13.
Responde `list[LeadOut]` (los 8 campos, sin `client_name` ni dirección: la
propiedad sale de cruzar `listing_id` con `GET /listings`).

| Parámetro | Rango | Si no se manda |
|---|---|---|
| `hours` | entero 1–8760 (o `null`) | `INACTIVITY_HOURS` del API, que por defecto es **72** |
| `limit` | entero 1–500 | 100 |

- **El front siempre manda `hours`.** HU-10 pide 24 h y el default del API es
  72: un `hours` omitido cambia el resultado sin avisar.
  `api.leadsEnRiesgo({ hours, limit })` lo exige en el tipo y rechaza un
  valor fuera de rango sin llamar al API.
- **Filtra por agencia, no por agente** (`Agent.agency_id == agente.agency_id`).
  Un `AGENT` recibe también los leads de sus compañeros: si la pantalla
  quiere solo los suyos, filtra por `agent_id` ella misma.
- Un lead está en riesgo si cumple las tres:
  1. su etapa no es terminal (`WON`, `LOST`);
  2. se creó **antes** del corte (`created_at < ahora - hours`): un lead más
     nuevo que la ventana nunca está en riesgo;
  3. no tiene respuesta desde el corte. Respuesta es una interacción
     `OUTBOUND` de tipo `MESSAGE` o `CALL` cuyo autor **no** es un
     `AI_AGENT`. Las notas, los `STATUS_CHANGE` y lo que escribe el bot no
     cuentan. Un `created_by` nulo cuenta como humano (es un outer join).
- Ordenado por `created_at` ascendente (más viejos primero) y cortado en
  `limit`. Sin filtros de fecha, propiedad ni agente, y sin paginación: con
  500 resultados puede faltar algo.
- Es el mismo predicado del barrido horario (`core.sweep_inactive_leads`),
  expuesto para ver la cola sin esperar al barrido.
- Errores: 422 con `hours` o `limit` fuera de rango o no enteros.

### `POST /leads` — crear o devolver
`{"client_id","listing_id","source_channel":"TELEGRAM|IN_APP|CALL","message":"..."}`
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
- **200 — mismo horario que la visita abierta.** Confirmado contra
  `/openapi.json` el 2026-09-15 (no estaba en este documento): si el lead ya
  tiene una visita abierta y se hace `POST` **con el mismo `scheduled_at`**,
  el API devuelve esa visita existente con `200` en vez de crear otra — el
  `POST` es seguro de reintentar. Con cualquier otro horario sigue siendo el
  409 de "visita ya abierta" de abajo. El front no necesita nada especial:
  `api.crearCita()` trata el `200` como éxito y valida la respuesta con el
  mismo `AppointmentSchema`.
- **Agentes de IA: solo dentro de `/slots` y con 120 minutos de
  anticipación.** Confirmado contra `/openapi.json` el 2026-09-15: un agente
  de IA reserva únicamente en horarios que devuelve
  `GET /agents/{id}/slots` y al menos `VISIT_MIN_NOTICE_MINUTES` (120)
  minutos adelante. No aplica a este front (autentica como agente humano,
  `lib/session.ts`), pero sí al bot de L3.
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
{ "direction":"INBOUND|OUTBOUND", "channel":"TELEGRAM|IN_APP|CALL",
  "type":"MESSAGE|CALL|NOTE|STATUS_CHANGE", "body":"<=4000 chars",
  "occurred_at":"opcional, para retrofechar" }
```
Una nota manual del agente es
`{"direction":"OUTBOUND","type":"NOTE","channel":"IN_APP","body":"..."}`.
En `OUTBOUND` el `created_by` queda en el agente; en `INBOUND` queda nulo.

### `GET /leads/{lead_id}/tasks` · `POST` · `PATCH .../tasks/{task_id}`
`POST`: `{"due_at":"...","note":"<=1000 chars"}`.
`PATCH`: al menos uno de `status` (`PENDING|DONE|SNOOZED`), `due_at`, `note`.

Confirmado contra `/openapi.json` (`TaskCreate`, `TaskPatch`) y contra
`app/schemas.py` y `services/lead.py` del API el 2026-10-13:

- `POST` responde **201** con `TaskOut`. `due_at` obligatorio, `note`
  opcional y nullable (máx. 1000). La tarea nace `PENDING` y su `agent_id`
  es el **dueño del lead**, no quien la crea. El API **no** rechaza un
  `due_at` en el pasado.
- `PATCH` responde 200 con `TaskOut`. Los tres campos son nullable y un
  `null` significa "no lo toques": no hay forma de borrar una nota.
- El `model_validator` de `TaskPatch` exige al menos uno **distinto de
  `null`**: `{}` y `{"note": null}` dan 422 con
  `{"detail":[{"type":"value_error","loc":["body"],"msg":"Value error, provide at least one of: status, due_at, note",...}]}`.
  Como Pydantic corre antes del handler, ese 422 sale aunque el lead no
  exista. `PatchTaskBody` en `lib/schemas.ts` lo replica.
- 404 `"Task not found"` si la tarea no es de ese lead; 404 si el lead es
  de otra agencia.

Forma exacta de una tarea, confirmada contra `/openapi.json` el 2026-09-10:
trae también `agent_id` y `created_at`, ninguno documentado antes:
```json
{ "id":"uuid", "lead_id":"uuid", "agent_id":"uuid", "due_at":"...",
  "note":"...", "status":"PENDING", "created_at":"..." }
```

### `GET /leads/{lead_id}/transitions` — **HU-06, HU-09**
**Existe.** Confirmado contra `/openapi.json` el 2026-09-10 — corrige la
sección 6 de este documento, que decía lo contrario. Devuelve el log de
transiciones completo (`list[TransitionOut]`), del más viejo al más nuevo:
```json
{ "id":"uuid", "lead_id":"uuid", "from_stage":"INTERESTED|null",
  "to_stage":"VISIT_SCHEDULED", "changed_by":"uuid|null", "changed_at":"..." }
```
Los seis campos son obligatorios; `from_stage` y `changed_by` pueden ser
`null` (la primera fila del log no tiene etapa de origen). Es la fuente de
verdad; `lead.current_stage` es una caché que mantiene un trigger de la base
sobre este log. **El log no trae el motivo de pérdida** — ver abajo dónde
queda.

### `POST /leads/{lead_id}/transitions` — **HU-06, HU-09**
Revisado contra `/openapi.json` y contra `app/schemas.py`,
`app/routers/leads.py`, `app/services/lead.py` y `tests/test_transitions.py`
del API el 2026-09-27.

Body (`TransitionCreate`):
```json
{ "to_stage":"INTERESTED|VISIT_SCHEDULED|VISITED|NEGOTIATING|WON|LOST",
  "lost_reason":"PRICE|LOCATION|BOUGHT_ELSEWHERE|NO_RESPONSE|FINANCING|OTHER|null",
  "note":"<=2000 chars|null" }
```
Solo `to_stage` es obligatorio en el esquema. Respuesta: **201** con un
`TransitionOut` (misma forma que el `GET` de arriba).

Saltos legales, confirmados contra `/openapi.json` el 2026-09-10:
`INTERESTED → VISIT_SCHEDULED → VISITED → NEGOTIATING → WON`, en ese orden
estricto y solo hacia adelante: no se salta etapas ni se devuelve. Cualquier
etapa no terminal puede saltar a `LOST`. `WON` y `LOST` son terminales.

Errores:
- **409** — salto ilegal (`"Illegal transition X -> Y. Allowed from X: [...]"`)
  o lead ya terminal (`"Lead is already in terminal stage X and cannot be
  moved"`). Forma simple `{"detail": "..."}`.
- **422** — `LOST` sin `lost_reason`, **o `lost_reason` enviado con cualquier
  otra etapa**. Esto último no lo dice `/openapi.json` ("LOST without a
  lost_reason, or unknown reason"); sale del `model_validator` de
  `TransitionCreate` y hay prueba (`test_lost_reason_is_only_valid_on_lost`).
  Como es un validador de Pydantic, **el 422 llega con el array de Pydantic,
  no con `{"detail": "mensaje"}`**, aunque `/openapi.json` diga `Message`. Lo
  mismo para un código de razón desconocido (lo rechaza el `enum`). Regla
  práctica: en una transición que no es `LOST`, omite `lost_reason` (o
  mándalo en `null`); lo que da 422 es un valor no nulo.
- **403** — solo cuentas de servicio (bots) sin el scope `leads:close` al
  mover a `WON` o `LOST`. No aplica a este front: autentica como agente
  humano (`lib/session.ts`).
- **404** — lead de otra agencia o inexistente.

Efectos colaterales que el front tiene que conocer:
- **Mover a `LOST` siempre escribe una interacción** `STATUS_CHANGE`
  (`OUTBOUND`, `IN_APP`) con cuerpo `"Lost: <CÓDIGO>"` o
  `"Lost: <CÓDIGO> — <note>"`. Así el motivo queda legible en
  `GET /leads/{id}/interactions` (HU-09 AC2). En las otras etapas la
  interacción solo se escribe si hay `note`, con la nota como cuerpo.
- El motivo y la nota de un `LOST` se guardan también en una tabla aparte
  (`lead_lost_detail`) que ningún endpoint de lectura por lead expone. La
  única lectura agregada es `GET /analytics/lost-reasons` (sección 7).
- **Cerrar un lead (`WON` o `LOST`) cancela sus visitas abiertas** en la misma
  transacción: el horario del agente se libera. La pantalla que lo cierre
  debe avisarlo antes, no después.
- Al revés, **el calendario también mueve etapas solo** (`_sync_funnel` en
  `app/services/appointment.py`, leído el 2026-09-27), solo hacia adelante y
  solo en dos casos: cita `CONFIRMED` con lead en `INTERESTED` →
  `VISIT_SCHEDULED`; cita `COMPLETED` con lead en `VISIT_SCHEDULED` →
  `VISITED`. Queda en el log como cualquier transición. No hay push: el
  tablero se entera al releer `GET /leads`.

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

### `POST /leads/{lead_id}/reassign` — **HU-08**
Confirmado contra `/openapi.json` el 2026-09-27 (antes solo estaba listado
en la sección 7).

Body (`ReassignRequest`):
```json
{ "to_agent_id":"uuid" }
```
Respuesta: **200** con el `LeadOut` ya actualizado (mismos 8 campos de
`GET /leads/{id}`, con el `agent_id` nuevo). Cambia `lead.agent_id` **y**
escribe `assignment_audit` en la misma transacción.

Errores (todos con la forma simple `{"detail": "..."}`, `Message`):
- **403** — quien llama no es `TEAM_ADMIN`.
- **404** — el agente destino no es de la agencia (o el lead no existe / es
  de otra agencia, como en todo el API).
- **409** — el agente destino está desactivado, es un bot (`AI_AGENT`,
  `"Cannot assign a lead to an AI agent"`, leído en `app/services/lead.py`
  del back el 2026-09-28), o ya es el dueño del lead.
- **422** — `to_agent_id` falta o no es un uuid (array de Pydantic).

**No escribe interacción** (verificado contra `/openapi.json` el 2026-09-27:
solo `assignment_audit`, que el front no lee): la reasignación no aparece en
el historial del lead ni cambia `last_interaction` de la tarjeta. Las tareas
abiertas se quedan con el anterior (decisión del back, DECISIONS §20).

**Corrección 2026-10-25:** este documento decía que tampoco notificaba al
agente nuevo. Ya no es así: desde los PRs #28 y #29 del back, reasignar le
genera al agente nuevo un aviso `LEAD_ASSIGNED` con
`assigned_via: "REASSIGNED"` y `from_agent_id` = el dueño anterior (ver
"Avisos" abajo). Al anterior no le llega nada (bloqueo 19). La descripción
del endpoint en `/openapi.json` no lo menciona, pero **se confirmó contra el
API real el 2026-10-26** (tarea 2.37): un admin reasignó dos leads y a la
agente nueva le llegó un `LEAD_ASSIGNED` + `REASSIGNED` por cada uno, con
`from_agent_id` = el admin, dueño anterior (bloqueo 23, cerrado).

Los agentes destino salen de `GET /agents`, justo abajo.

### `GET /agents` — **HU-08, HU-17**
Confirmado contra `/openapi.json` desplegado el 2026-09-28 (PR #20 del back,
`app/routers/agents.py`). Cualquier agente autenticado puede llamarla. Los
agentes de la agencia del token, **más viejos primero**
(`list[AgentListItem]`):
```json
[{ "id":"uuid", "agency_id":"uuid", "role":"AGENT|TEAM_ADMIN|AI_AGENT",
   "active":true, "full_name":"Paula Gómez" }]
```
- `full_name` es `string | null` (sale de la persona asociada; `null` si no
  tiene). En `/openapi.json` no está en `required` porque tiene default
  `None`, pero siempre viene.
- **Sin `email` ni ningún dato de contacto**, y no es `AgentOut`: en el front
  es `AgentListItemSchema`; `AgentSchema` sigue siendo el de `GET /me`.

Query, todos opcionales:

| Parámetro | Tipo | Nota |
|---|---|---|
| `active` | bool | `true` solo activos, `false` solo desactivados; sin él, todos |
| `role` | `AGENT` \| `TEAM_ADMIN` \| `AI_AGENT` | `role=AI_AGENT` trae los bots aunque falte `include_bots` |
| `include_bots` | bool | por defecto `false`: los `AI_AGENT` no salen (no pueden ser dueños de un lead) |
| `agency_id` | uuid | solo la propia; **otra da 404** (`"Agency not found"`). El front no la manda |
| `limit` | int | 1–200, por defecto **100** |
| `offset` | int | ≥ 0 |

**Difiere de lo que se había propuesto** (2026-09-27, `list[AgentOut]` igual
a `/me`): no trae `email`, `role` admite `AI_AGENT` (con `include_bots`) y la
ruta pagina. `useAgentes()` (`features/agentes/hooks.ts`) pide `limit=200`
sin bots, activos e inactivos, en una sola petición.

### `GET /analytics/funnel` — **HU-17**
Confirmado contra `/openapi.json` el 2026-09-27. **Solo `TEAM_ADMIN`.**

De los leads **creados** en la ventana, cuántos llegaron alguna vez a cada
etapa del embudo (`INTERESTED → VISIT_SCHEDULED → VISITED → NEGOTIATING →
WON`), con la conversión desde la etapa anterior y desde la primera, más
cuántos se perdieron.

Query, todos opcionales:

| Parámetro | Tipo | Nota |
|---|---|---|
| `created_from` | `YYYY-MM-DD` | inclusivo, zona de la agencia |
| `created_to` | `YYYY-MM-DD` | inclusivo, zona de la agencia |
| `agent_id` | uuid | agente dueño del lead |
| `listing_id` | uuid | |
| `property_id` | uuid | trae SALE y RENT del mismo inmueble |
| `operation_type` | `SALE` \| `RENT` | |
| `format` | `json` \| `csv` | por defecto `json` |

Respuesta JSON (`FunnelOut`):
```json
{ "stages":[
    { "stage":"INTERESTED", "leads_reached":120, "pct_from_prev":null, "pct_of_first":100.0 },
    { "stage":"VISIT_SCHEDULED", "leads_reached":54, "pct_from_prev":45.0, "pct_of_first":45.0 }
  ],
  "lost": 38,
  "filters": { "created_from":"2026-09-01" } }
```
- `stage` usa el enum de etapas completo; `leads_reached` es entero.
- `pct_from_prev` y `pct_of_first` son **número o `null`** (los dos
  obligatorios en el esquema). El ejemplo de arriba es ilustrativo: el
  `null` de la primera etapa es lo esperable, pero `/openapi.json` no dice
  en qué casos exactos llega `null` (p. ej., división por cero). El front
  tiene que aceptarlo en cualquier fila.
- `filters` es un objeto `string → string` con el eco de los filtros.
- `format=csv` responde `text/csv` con las mismas filas. **El PDF es trabajo
  del front**, dice la descripción del endpoint.

Leído en el código del back el 2026-09-27 (`app/routers/analytics.py`,
`app/services/analytics.py` y `tests/test_analytics.py` de
`Luisrrodriguezg/homelitics-crm`, rama `main`), porque `/openapi.json` no lo
dice:
- Los porcentajes son `100 * n / denominador` con **dos decimales, mitad
  hacia arriba**, y `null` solo cuando el denominador es 0.
  `pct_from_prev` de la primera etapa siempre es `null`.
- `filters` solo trae las claves de filtro que llegaron con valor:
  `created_from`, `created_to`, `agent_id`, `listing_id`, `property_id`,
  `operation_type`. Nunca `format`.
- El CSV sale de `csv.writer` de Python (líneas con `\r\n`, `None` como
  celda vacía, floats como `100.0`). Cabecera
  `stage,leads_reached,pct_from_prev,pct_of_first`, una fila por etapa y una
  última fila `LOST,<perdidos>,,<perdidos/primera etapa, 2 decimales>`
  (vacío si la primera etapa es 0). Ejemplo del test del back:
  `INTERESTED,2,,100.0` … `LOST,1,,50.0`.
- Llega con `Content-Disposition: attachment; filename="funnel.csv"`. El
  proxy (`app/api/homelitics/[...path]/route.ts`) lo reenvía; el front
  descarga con su propio nombre, que incluye el rango.

Errores:
- **403** — no es `TEAM_ADMIN` (`Message`).
- **422** — `created_from` posterior a `created_to` (`Message`, forma
  simple). Validar antes de pedir, como en `GET /leads`: `api.embudo()` lo
  rechaza sin llamar.

Visto contra el API real el 2026-09-27: el agente demo de la etapa 1 de
`lib/session.ts` es `AGENT`, y el 403 llega con
`"This action requires the TEAM_ADMIN role"` con cualquier filtro, también con
`format=csv` (el 403 del CSV es JSON, no texto). Con ese token, `/embudo`
muestra el aviso de "solo para administradores". **Con datos reales la
respuesta no se ha visto**: falta un token `TEAM_ADMIN`. `FunnelOut` y
`FunnelStageOut` de `/openapi.json` se volvieron a comparar ese día con
`FunnelSchema` y coinciden.

### `GET /analytics/lost-reasons?days=` — **HU-17** (y HU-09 AC3)
Confirmado contra `/openapi.json` el 2026-09-27. Leads perdidos en la
ventana (`days` 1–730, por defecto 90, contado sobre la **fecha de
pérdida**, no la de creación), agrupados por el motivo con que se movieron a
`LOST`, más común primero (`list[LostReasonOut]`):
```json
[{ "reason":"PRICE", "leads":12, "pct":40.0 }, ...]
```
`reason` usa el enum de razón de pérdida (sección 5); `pct` es la
proporción sobre los perdidos de la ventana, así que las filas suman 100.
`/openapi.json` no declara un 403 para esta ruta (a diferencia de
`/analytics/funnel`): hoy cualquier agente puede leerla (confirmado con el
agente demo, rol `AGENT`, el 2026-09-27; `pct` llegó con dos decimales, p.
ej. `23.53`).

**No acepta los filtros del embudo** (fechas de creación, agente, propiedad,
operación): solo `days`. La pantalla de HU-17 le pone su propio selector y lo
dice en pantalla.

### Avisos (tag `notifications`) — **tareas 2.28 a 2.37**
Confirmado contra `/openapi.json` el 2026-10-25 (PRs #28 y #29 del back).
Las reglas de negocio salen de la guía del back,
`homelitics-crm/docs/NOTIFICATIONS.md`, leída el mismo día; donde
`/openapi.json` no dice lo mismo, está anotado en los bloqueos 21 a 23 de
`docs/SPRINT_NOTIFICACIONES_LINEA2.md`.

Bandeja de mensajes dentro de la app. **Quién genera mensajes:** solo el bot
de Telegram (`AI_AGENT`) o un `TEAM_ADMIN`, cuando le pasan trabajo a un
agente:
- `LEAD_ASSIGNED` + `assigned_via: "CREATED"` — el bot o un admin le abrió un
  lead sobre uno de sus listings.
- `LEAD_ASSIGNED` + `assigned_via: "REASSIGNED"` — un admin le reasignó un
  lead (`POST /leads/{lead_id}/reassign`, arriba).
- `VISIT_SCHEDULED` — el bot o un admin le agendó una visita en uno de sus
  leads.

Nadie recibe un mensaje por algo que hizo él mismo, y lo que hace un `AGENT`
nunca genera mensajes. No hay correo, push ni websockets: el front consulta
(cada 60 s con la pestaña visible, dice la guía). **No llegan avisos** por
visitas movidas o canceladas, ni al dueño anterior de un lead reasignado
(bloqueo 19); la cancelación se ve porque `visit_status` del mensaje original
cambia.

**Paginación distinta a la del resto del API** (sección 2): por cursor, no
por `offset`. `limit` 1–**20**, por defecto 20, más nuevo primero; la
siguiente página se pide con `before=<next_before>`.

Respuesta de `GET /me/notifications` y `GET /notifications`
(`NotificationPage`, los tres campos obligatorios):
```json
{ "items":[ /* NotificationOut */ ],
  "unread_count":3,
  "next_before":null }
```
- `unread_count` (entero) — no leídos que cumplen **los filtros**, contando
  todas las páginas. En `GET /me/notifications` sin filtros es el número de
  la campana.
- `next_before` — `int | null`. Se pasa tal cual como `?before=` para la
  página anterior (más vieja); `null` = no hay más.

`NotificationOut` (los 21 campos están en `required`; los que no aplican al
tipo llegan en `null`):
```json
{ "id":1287, "type":"VISIT_SCHEDULED", "read":false, "read_at":null,
  "created_at":"2026-10-25T21:14:03.512Z",
  "recipient_agent_id":"uuid", "recipient_name":"Laura Gómez",
  "actor_agent_id":"uuid", "actor_name":"Asistente Ramírez",
  "actor_role":"AI_AGENT",
  "lead_id":"uuid", "client_name":"Juan Pérez",
  "listing_address":"Cra 43A #10-25", "neighborhood":"El Poblado",
  "assigned_via":null, "from_agent_id":null,
  "appointment_id":"uuid", "visit_scheduled_at":"2026-10-30T15:00:00Z",
  "visit_duration_min":60, "visit_status":"PENDING_CONFIRMATION",
  "booked_status":"PENDING_CONFIRMATION" }
```

| Campo | Tipo | Nota |
|---|---|---|
| `id` | int | **Entero, no uuid.** Mayor = más nuevo. Es el que se marca leído |
| `type` | `LEAD_ASSIGNED` \| `VISIT_SCHEDULED` | sección 5 |
| `read` | bool | La marca de leído: `false` se dibuja como no leído |
| `read_at` | date-time \| null | Cuándo se abrió por primera vez |
| `created_at` | date-time | Cuándo pasó |
| `recipient_agent_id` | uuid | Quién lo recibió (en la bandeja propia, siempre uno mismo) |
| `recipient_name` | string \| null | |
| `actor_agent_id` | uuid \| null | Quién lo causó |
| `actor_name` | string \| null | |
| `actor_role` | `AGENT` \| `TEAM_ADMIN` \| `AI_AGENT` \| null | La guía dice que solo llega `AI_AGENT` o `TEAM_ADMIN`; el esquema admite `AGENT` (bloqueo 22) |
| `lead_id` | uuid | El lead del aviso, siempre presente |
| `client_name` | string \| null | |
| `listing_address` | string \| null | |
| `neighborhood` | string \| null | |
| `assigned_via` | `CREATED` \| `REASSIGNED` \| null | Solo `LEAD_ASSIGNED` |
| `from_agent_id` | uuid \| null | Solo `REASSIGNED`: quién lo tenía antes |
| `appointment_id` | uuid \| null | Solo `VISIT_SCHEDULED` |
| `visit_scheduled_at` | date-time \| null | La visita **como está ahora**: pudo moverse desde el aviso |
| `visit_duration_min` | int \| null | Ídem |
| `visit_status` | estado de cita \| null | Ídem. Decide "requiere tu confirmación" |
| `booked_status` | estado de cita \| null | Con qué estado se agendó (`PENDING_CONFIRMATION` = necesitaba confirmación; `CONFIRMED` = el bot la dejó confirmada). **No** sirve para decidir el texto |

`visit_status` y `booked_status` usan el enum de estado de cita completo
(sección 5). El API manda hechos, no frases: el texto lo arma el front (tabla
"Textos" de `docs/SPRINT_NOTIFICACIONES_LINEA2.md`).

#### `GET /me/notifications` — la bandeja propia
Cualquier agente (y un admin, para sus propios mensajes). **Leer la lista no
marca nada como leído.**

| Parámetro | Tipo | Nota |
|---|---|---|
| `type` | `LEAD_ASSIGNED` \| `VISIT_SCHEDULED` | |
| `read` | bool | `false` solo no leídos, `true` solo leídos; sin él, todos |
| `before` | int | el `next_before` de la página anterior |
| `limit` | int | 1–20, por defecto 20. **Más de 20 → 422** |

Errores:
- **422** — `limit` fuera de 1–20 o `type` que no es del enum (array de
  Pydantic, `HTTPValidationError`).

#### `POST /me/notifications/{notification_id}/read` → **204**
`notification_id` es **entero**. Sin body, y responde **204 sin cuerpo**: no
hay nada que parsear. Se llama al abrir o pulsar el mensaje. **Idempotente**:
repetirlo no hace daño y `read_at` conserva la primera vez.

Errores:
- **404** — el mensaje no es de quien llama (o no existe). `Message`, forma
  simple.
- **422** — `notification_id` no es un entero (array de Pydantic).

#### `POST /me/notifications/read-all`
Sin body. Marca leídos todos los mensajes propios. Responde **200** con
`MarkedRead`:
```json
{ "marked": 3 }
```
`marked` (entero) es cuántos se marcaron. `/openapi.json` no declara errores
propios.

#### `GET /notifications` — monitor, **solo `TEAM_ADMIN`**
Todos los mensajes de la agencia: qué se mandó a quién, quién lo causó y si
ya lo leyó. Misma página y mismo `NotificationOut`, más nuevo primero.
**Mirar el monitor nunca marca nada como leído**: la marca es del
destinatario, y los mensajes propios de un admin se marcan desde su bandeja.
Aquí `unread_count` = no leídos que cumplen los filtros (para un
encabezado tipo "12 sin leer").

| Parámetro | Tipo | Nota |
|---|---|---|
| `recipient_agent_id` | uuid | quién lo recibió (ids de `GET /agents`) |
| `actor_agent_id` | uuid | quién lo causó |
| `by_bot` | bool | `true` causado por el bot, `false` por un admin |
| `type` | `LEAD_ASSIGNED` \| `VISIT_SCHEDULED` | |
| `read` | bool | `false` = "quién no lo ha visto" |
| `lead_id` | uuid | todo lo de un lead |
| `created_from` | `YYYY-MM-DD` | inclusivo, zona de la agencia |
| `created_to` | `YYYY-MM-DD` | inclusivo, zona de la agencia |
| `before` | int | como en la bandeja |
| `limit` | int | 1–20, por defecto 20 |

Errores:
- **403** — no es `TEAM_ADMIN` (`Message`). Ocultar el enlace salvo que
  `GET /me` diga `role: "TEAM_ADMIN"`.
- **422** — `created_from` posterior a `created_to`, `limit` > 20 o un enum
  inválido. `/openapi.json` lo declara como `Message` (forma simple), pero
  llegan las dos formas (confirmado contra el API real el 2026-10-26,
  bloqueo 21): el rango al revés da `{"detail":"created_from is after
  created_to"}`, y `limit=21` o `type=OTRO` dan el array de Pydantic.
  Aceptar las dos, como en todo 422 (sección 2). Validar antes de pedir.

Comunes a los cuatro (sección 1): **401** sin token o vencido, **403** con
token sin agente vinculado; no aparecen en `/openapi.json`, como en el resto
del API.

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
| Salto de etapa ilegal, o lead ya terminal (otro lo movió mientras tanto) | 409 en `POST .../transitions` | Revertir la tarjeta a su columna (deshacer lo optimista), avisar y releer el tablero. |
| `LOST` sin motivo | 422 en `POST .../transitions`, array de Pydantic | No debería pasar: el formulario exige el motivo antes de enviar. |
| Rango de fechas al revés en el tablero | 422 en `GET /leads` | Validar el filtro antes de pedir; no llamar al API con `created_from > created_to`. |
| Token ausente, vencido o inválido | 401 | La sesión no es válida: volver a `/entrar?siguiente=<ruta actual>`. Sin reintento: renovar la sesión es trabajo de `middleware.ts`. El proxy `/api/homelitics/*` responde este mismo 401 si no hay cookie. (El proxy público sí renueva y reintenta una vez el token de la cuenta de servicio, y si sigue fallando responde 502, no 401.) |
| `GET /me` con un usuario de Auth que no tiene agente vinculado (`core.agent.auth_user_id`) | 403 en `GET /me` | Cuenta sin agencia: cerrar la sesión (`/entrar/salir`) y mostrar en `/entrar` "Tu cuenta no está habilitada para ninguna agencia". No confundir con el 403 de rol de la fila de abajo. |
| Reasignar o ver el embudo sin ser `TEAM_ADMIN` | 403 en `POST .../reassign` y `GET /analytics/funnel` | No mostrar la acción a quien no es admin (`useEsAdmin()`); si igual llega el 403, decirlo sin reintentar. |
| Reasignar a un agente desactivado, a un bot, o al que ya es dueño | 409 en `POST .../reassign` | Releer la lista de agentes y pedir que elija otro. |

## 5. Enumeraciones

| Conjunto | Valores |
|---|---|
| Etapa del lead | `INTERESTED`, `VISIT_SCHEDULED`, `VISITED`, `NEGOTIATING`, `WON`, `LOST` |
| Canal | `TELEGRAM`, `IN_APP`, `CALL` — antes `WHATSAPP` en vez de `TELEGRAM`; el API lo renombró, confirmado contra `/openapi.json` (`LeadOut`, `LeadCreate`, `InteractionOut`, `InteractionCreate`) y contra `GET /leads` real el 2026-09-15. `WHATSAPP` ya no existe. |
| Dirección de interacción | `INBOUND`, `OUTBOUND` |
| Tipo de interacción | `MESSAGE`, `CALL`, `NOTE`, `STATUS_CHANGE` |
| Estado de cita | `PENDING_CONFIRMATION`, `CONFIRMED`, `RESCHEDULED`, `CANCELLED`, `COMPLETED`, `NO_SHOW` |
| Estado de tarea | `PENDING`, `DONE`, `SNOOZED` |
| Operación | `SALE`, `RENT` |
| Estado de listing | `ACTIVE`, `PAUSED`, `CLOSED` |
| Razón de pérdida | `PRICE`, `LOCATION`, `BOUGHT_ELSEWHERE`, `NO_RESPONSE`, `FINANCING`, `OTHER` — confirmado contra `/openapi.json` (`TransitionCreate`, `LostReasonOut`) el 2026-09-27. No hay endpoint que dé las etiquetas: el texto en español lo pone el front. |
| Objeción | `PRICE`, `SIZE`, `LOCATION`, `CONDITION`, `HOA_FEE`, `OTHER` |
| Rol de agente | `AGENT`, `TEAM_ADMIN` — `AgentOut` en `/openapi.json` admite también `AI_AGENT` (confirmado el 2026-09-27), pero `/me` con un token humano nunca lo devuelve: `AgentSchema` lo deja fuera y, si alguna vez llega, zod falla a propósito. `GET /agents` sí lo devuelve con `include_bots=true` o `role=AI_AGENT`, y por eso `AgentListItemSchema` lo admite. |
| Día de la semana | `0` lunes … `6` domingo |
| Tipo de aviso (`NotificationType`) | `LEAD_ASSIGNED`, `VISIT_SCHEDULED` — confirmado contra `/openapi.json` (`NotificationOut`, query `type`) el 2026-10-25 |
| Origen de una asignación (`assigned_via`) | `CREATED` (el bot o un admin abrió el lead para el agente), `REASSIGNED` (un admin se lo pasó) — solo en avisos `LEAD_ASSIGNED`; en los demás llega `null`. Confirmado contra `/openapi.json` el 2026-10-25 |

## 6. Lo que el API NO tiene

- No hay forma de crear ni listar clientes. `POST /leads` exige un `client_id`
  que ya exista.
- No hay identidad de cliente final: toda petición se resuelve a un agente. Las
  vistas "de cliente" corren, por debajo, con credencial de agente.
- No hay websocket ni SSE. Para "tiempo real" se relee cada 5 segundos.
- No hay forma documentada de resolver `objection_id` (la respuesta de
  `.../feedback`) a un texto legible. Ver esa sección.
- No hay lectura del motivo de pérdida de **un** lead como campo. Se ve en la
  interacción `STATUS_CHANGE` que deja el `LOST` (`"Lost: PRICE — nota"`), o
  agregado en `/analytics/lost-reasons`.
- No hay `GET /properties`: el filtro `property_id` de `GET /leads` existe,
  pero la lista de inmuebles para elegir hay que armarla desde
  `GET /listings` (cada listing trae su `property_id`).
- No hay `GET /agents/{id}`: un `agent_id` se resuelve a nombre buscándolo
  en `GET /agents` (sección 3), que existe desde el 2026-09-28.

**Corrección 2026-09-10:** este documento decía que no había endpoint para leer
el historial de transiciones. Es falso — `GET /leads/{lead_id}/transitions`
existe y está documentado arriba. Pendiente de decidir si la tarea 2.4 lo usa.

## 7. Otros endpoints del API, no usados por la línea 2

Existen en `/openapi.json` pero ninguna pantalla de `docs/SPRINT_LINEA2.md` los
necesita hoy. Se listan para no reinventarlos si hiciera falta:

- `GET/POST /agents/{agent_id}/availability`,
  `PATCH/DELETE .../availability/{rule_id}` — las reglas semanales que
  alimentan `/slots`. Las mantiene la línea 1.
- `GET/POST /agents/{agent_id}/time-off`,
  `DELETE .../time-off/{off_id}` — ausencias del agente, también consumidas
  por `/slots`.
- `GET /analytics/funnel-daily`, `/analytics/agent-response-time`,
  `/analytics/listing-performance`, `/analytics/north-star` — métricas de
  agencia, no hay pantalla de línea 2 que las pida.

`POST /leads/{lead_id}/reassign`, `GET /analytics/funnel` y
`GET /analytics/lost-reasons` estaban en esta lista; desde el 2026-09-27
están documentados en la sección 3 (HU-08 y HU-17).

## 8. Propuestos (no existen todavía)

**Nada de esta sección existe en el API.** Es lo que la línea 2 le pide a L1
para la épica E3 (tarea 2.24 de `docs/SPRINT_E3_LINEA2.md`, bloqueos 9 a
12). Solo las tareas del **bloque F** de ese archivo (2.25, 2.26 y 2.27)
pueden usarlo, y únicamente contra los mocks de `lib/mock/`. Ninguna otra
pantalla, hook ni esquema puede asumir un endpoint o campo de aquí.

Cuando uno se confirme en `/openapi.json`, se **mueve** a su sección real
(la 3, junto a los endpoints que ya existen) con la fecha de la
confirmación y lo que haya cambiado respecto a esta propuesta, y se borra
de aquí. Si L1 lo publica con otra forma, manda lo que diga `/openapi.json`,
no esta sección.

Revisado contra `/openapi.json` el 2026-10-20: ninguno de los cinco existe.
`GET /leads/at-risk` y `GET /leads/{lead_id}` siguen respondiendo `LeadOut`,
`TaskOut` sigue con sus siete campos y no hay `GET /tasks` ni
`/analytics/at-risk-by-agent`.

Errores comunes a todos (sección 1): **401** si el token falta, venció o es
de otro proyecto, y **403** si el token es válido pero no tiene agente
vinculado. Abajo van solo los propios de cada uno.

### `GET /tasks` — bloqueo 9 · consumen **2.25** (mock) y **2.26** (campanita)

Las tareas de **toda la agencia** del token, con el mismo criterio que
`GET /leads/at-risk`: filtra por `agency_id`, no por agente. Un `AGENT` que
quiere solo las suyas manda `agent_id`.

Query, todos opcionales:

| Parámetro | Tipo | Nota |
|---|---|---|
| `status` | `PENDING` \| `DONE` \| `SNOOZED` | sin él, todas |
| `due_before` | timestamp ISO-8601 con offset | `due_at < due_before` (exclusivo) |
| `agent_id` | uuid | dueño de la tarea (`TaskOut.agent_id`, que es el dueño del lead) |
| `limit` | 1–200, por defecto 50 | convención de paginación (sección 2) |

Respuesta **200** `list[TaskOut]`, ordenada por `due_at` ascendente (la más
vencida primero). Misma forma que `GET /leads/{lead_id}/tasks`, más `source`
si se aprueba el bloqueo 11:
```json
[{ "id":"uuid", "lead_id":"uuid", "agent_id":"uuid",
   "due_at":"2026-10-20T15:00:00Z", "note":"string|null",
   "status":"PENDING", "created_at":"...", "source":"MANUAL" }]
```

Errores:
- **404** — no aplica: es un listado. Propuesto: un `agent_id` de otra
  agencia o inexistente da lista vacía, no 404. El front trata igual los dos
  casos (no hay recordatorios que mostrar).
- **422** — `status` fuera del enum, `due_before` sin offset o mal formado,
  `limit` fuera de rango. El front arma `due_before` con
  `new Date().toISOString()` (siempre `Z`).

Uso en el front: 2.26 pide
`GET /tasks?status=PENDING&due_before=<ahora>&agent_id=<yo>` cada minuto.
Una tarea `SNOOZED` con `due_at` vencido no sale con `status=PENDING`: si el
API la cuenta como pendiente o el front hace dos consultas se decide con L1
al publicarlo.

### Campo `source` en `TaskOut` — bloqueo 11 · consumen **2.25** (mock) y **2.26**

Un campo más, obligatorio, en todo `TaskOut`: `GET`/`POST
/leads/{lead_id}/tasks`, `PATCH .../tasks/{task_id}` y `GET /tasks`.

| Valor | Quién crea la tarea |
|---|---|
| `MANUAL` | un agente, con `POST /leads/{lead_id}/tasks` |
| `SWEEP` | el barrido horario (`core.sweep_inactive_leads`) |
| `FIRST_TOUCH` | el *first-touch* del relay |

- No va en `TaskCreate` ni en `TaskPatch`: lo pone el API. Un `POST` del
  front siempre devuelve `MANUAL`.
- Sin errores propios: no cambia ningún código de los endpoints existentes
  (401, 403, 404 y 422 siguen como en la sección 3).
- En el front entraría como `z.enum([...])` en `TaskSchema`. Mientras no
  exista, solo el mock de 2.25 lo lleva. El panel de 2.19 no lo lee (ver
  "Hueco conocido" en `docs/SPRINT_E3_LINEA2.md`); usarlo ahí sería una
  tarea nueva, fuera del bloque F.

### `GET /leads/at-risk` con `LeadCard` y filtros — bloqueo 10 · ninguna tarea del bloque F

Mismo endpoint y mismo predicado de riesgo que hoy (sección 3), con dos
cambios:

1. Responde **`list[LeadCard]`** (la forma de `GET /leads`, sección 3) en vez
   de `list[LeadOut]`: trae `client_name`, `listing_address`,
   `neighborhood`, `operation_type`, `asking_price` y `last_interaction`.
2. Acepta filtros opcionales, con la semántica de `GET /leads`:

| Parámetro | Tipo | Nota |
|---|---|---|
| `hours` | 1–8760 | igual que hoy; el front lo sigue mandando siempre |
| `limit` | 1–500, por defecto 100 | igual que hoy |
| `agent_id` | uuid | dueño del lead |
| `created_from` | `YYYY-MM-DD` | inclusivo, zona de la agencia |
| `created_to` | `YYYY-MM-DD` | inclusivo, zona de la agencia |
| `property_id` | uuid | todas las publicaciones del inmueble, `SALE` y `RENT` |

Errores:
- **404** — no aplica (listado). Un id de otra agencia en un filtro da lista
  vacía, como se propone para `GET /tasks`.
- **422** — `hours` o `limit` fuera de rango (igual que hoy), y
  `created_from > created_to` con la forma simple de `GET /leads`
  (`{"detail": "created_from is after created_to"}`).

Quién lo consumiría: **ninguna tarea del bloque F**. Lo aprovecharían
2.15–2.18 (dejar de cruzar `listing_id` con `GET /listings` y de filtrar en
el cliente), pero cambiarlas es una tarea nueva cuando se confirme. Para
HU-13, 2.27 usa `/analytics/at-risk-by-agent`, no este.

### `client_name` en `GET /leads/{lead_id}` — bloqueo 12 · ninguna tarea del bloque F

Que `GET /leads/{lead_id}` responda **`LeadCard`** en vez de `LeadOut`. Lo
mínimo es `client_name: string | null`; la tarjeta completa trae además
`listing_address` y `neighborhood`, que también son variables de las
plantillas de HU-12.

Errores, los mismos de hoy:
- **404** — lead inexistente o de otra agencia.
- **422** — `lead_id` que no es uuid.

Quién lo consumiría: **ninguna tarea del bloque F**. Lo necesitan las
plantillas (2.21–2.23) para `{client_name}`, que hoy siempre sale
`[falta: nombre del cliente]`. Conectarlo es una tarea nueva cuando se
confirme. `POST /leads` y `POST /leads/{lead_id}/reassign` pueden seguir
devolviendo `LeadOut`.

### `GET /analytics/at-risk-by-agent` — bloqueos 10 y 15 · consumen **2.25** (mock) y **2.27**

**Solo `TEAM_ADMIN`**, como `GET /analytics/funnel`. El reporte de HU-13
hecho en el servidor: los leads en riesgo de la agencia agrupados por
agente, **sin el tope de 500** de `GET /leads/at-risk`.

Query:

| Parámetro | Tipo | Nota |
|---|---|---|
| `hours` | 1–8760 | mismo predicado que `at-risk`; el front lo manda siempre |
| `from` | `YYYY-MM-DD` | sobre `created_at`, inclusivo, zona de la agencia |
| `to` | `YYYY-MM-DD` | ídem |
| `property_id` | uuid | todas las publicaciones del inmueble |
| `format` | `json` \| `csv` | por defecto `json` |

`from`/`to` se llaman así en la propuesta; en `/analytics/funnel` y
`GET /leads` son `created_from`/`created_to`. Si L1 prefiere alinearlos,
manda lo que publique.

Respuesta JSON:
```json
{ "hours": 24,
  "total": 12,
  "agents": [
    { "agent_id":"uuid", "full_name":"Paula Gómez",
      "leads_at_risk": 5, "oldest_created_at":"2026-10-01T14:00:00Z",
      "leads": [ { "...": "LeadCard" } ] }
  ],
  "filters": { "from":"2026-10-01", "property_id":"uuid" } }
```
- `agents` ordenado por `leads_at_risk` descendente (criterio de 2.17). Un
  agente sin leads en riesgo no aparece.
- `total` es la suma de `leads_at_risk`.
- `full_name` es `string | null`, como en `GET /agents`.
- `leads` es `list[LeadCard]`, más viejos primero, como `at-risk`.
- `filters` es el eco de los filtros que llegaron con valor, como en el
  embudo; nunca `format` ni `hours` (que va aparte).
- Deseable (bloqueo 15): un `last_response_at` (timestamp o `null`) por
  lead, para que "días sin respuesta" deje de contarse desde `created_at`.

`format=csv`: `text/csv` con `Content-Disposition: attachment;
filename="at-risk-by-agent.csv"`, generado igual que el del embudo
(`csv.writer`, `\r\n`, `None` como celda vacía). Una fila por lead,
agrupadas por agente en el orden del JSON. Cabecera propuesta:
`agent_id,agent_name,lead_id,client_name,listing_address,current_stage,created_at`.
El proxy ya reenvía `Content-Disposition`; el front descarga con su propio
nombre, que incluye filtros y umbral, como en 2.18.

Errores:
- **403** — no es `TEAM_ADMIN` (`Message`, `"This action requires the
  TEAM_ADMIN role"`), en JSON también con `format=csv`, como el embudo.
- **404** — no aplica. Un `property_id` de otra agencia da `agents` vacío.
- **422** — `hours` fuera de rango, `from` posterior a `to` (forma simple),
  `format` desconocido.
