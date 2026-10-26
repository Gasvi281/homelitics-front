# Datos de ejemplo

`resolverMock(path)` devuelve, para cada ruta del API, un objeto con **la misma
forma** que la respuesta real. Todo lo que salga de aquí se valida contra
`lib/schemas.ts`, igual que los datos reales: un mock con forma libre convierte
el día de la integración en dos días.

Datos base del prototipo, para que las capturas y la demo coincidan:

- Propiedad: Manila 206, Medellín. Transversal 80A # 81-57 apto 206.
  83,80 m², 1 habitación, 1 baño, `asking_price: "650137717.29"`.
- Agente: Hernando Carrillo, rol `TEAM_ADMIN` (o `AGENT` con `MOCK_AGENT_ROLE=AGENT`). Hay tres más en su agencia (ver tabla de abajo).
- Cliente: Laura Restrepo. Primer contacto el 1 de septiembre por Telegram.
- Lead en etapa `VISIT_SCHEDULED`.
- Cita el jueves 17 a las 10:30 de Bogotá, o sea `2026-09-17T15:30:00Z`.
- Horarios ocupados de ejemplo, en hora de Bogotá:
  lunes 09:00 y 10:30, martes 11:00, miércoles 09:00 09:30 10:00,
  viernes 10:00 y 11:30.

## Casos de error para maquetar

`resolverMock` (en `index.ts`) guarda estado en memoria mientras corre
`npm run dev`, así que crear una cita o una interacción en una pantalla se ve
reflejado en otra. Para los casos que no dependen de qué se envía, hay ids
fijos (exportados como `MOCK_IDS`):

| Caso | Cómo se dispara |
|---|---|
| Horario ocupado (2.2) | Pedir dos veces la misma `crearCita` con el mismo horario, o uno de los horarios ya ocupados de la tabla de arriba. |
| Cita ya cancelada (2.3) | `PATCH` sobre `APPOINTMENT_ID_CANCELADA`: cualquier cambio da 409. |
| Encuesta sobre visita no completada (2.5) | `POST .../feedback` sobre `APPOINTMENT_ID_NO_COMPLETADA`: siempre 409. |
| Encuesta que sí procede (2.5) | `POST .../feedback` sobre `APPOINTMENT_ID_COMPLETADA`. |
| Lista vacía (2.4 y 2.3) | `LEAD_ID_VACIO`: sin interacciones, tareas ni citas. |
| Tablero completo (HU-06) | `GET /leads`: 15 tarjetas en las seis etapas (4 INTERESTED, 3 VISIT_SCHEDULED, 2 VISITED, 2 NEGOTIATING, 2 WON, 2 LOST). Respeta `stage`, `active`, `property_id`, `created_from`/`created_to` y el resto de filtros del contrato. La 15.ª (Tomás Echeverri, `LEAD_ID_RECIENTE`) es de HU-10 y se crea "hace 2 h" cada vez que arranca el mock. |
| Leads en riesgo (HU-10, HU-13) | `GET /leads/at-risk?hours=&limit=` cuenta desde AHORA con el mismo predicado del API: no terminales, creados antes del corte y sin `MESSAGE`/`CALL` `OUTBOUND` de un humano desde el corte; más viejos primero, cortado en `limit` (default 100), y `hours` 72 si falta. Casos fijos, fechados respecto al arranque: `LEAD_ID_RECIENTE` (fuera a 24 h por nuevo, dentro a 1 h), `LEAD_ID_ATENDIDO` (llamada humana hace 6 h: fuera a 24 h), `LEAD_ID_SOLO_BOT` (solo le contestó el bot: dentro) y `LEAD_ID_SOLO_NOTA` (solo una nota: dentro). A 24 h hay leads en riesgo de los cuatro humanos; con `hours=8760` no hay ninguno (todos son más nuevos). Registrar un `MESSAGE` saliente saca al lead; una nota no. |
| Tareas (HU-11) | `POST /leads/{id}/tasks` crea `PENDING` a nombre del dueño del lead. `PATCH .../tasks/{task_id}` solo pisa lo que no es `null`; `TASK_ID` es la tarea de Laura. Un `PATCH` sin campos (o todo `null`) da 422 `"Value error, provide at least one of: status, due_at, note"` antes de mirar el lead, como el API; 404 `"Task not found"` si la tarea es de otro lead. |
| Tareas de la agencia (2.25, PROPUESTO) | `GET /tasks?status=&due_before=&agent_id=&limit=` con la forma de docs/API_CONTRACT.md §8: `TaskOut` más `source` (`MANUAL`, `SWEEP`, `FIRST_TOUCH`), `due_at` ascendente, `limit` 1–200 (50 por defecto), 422 con `status` fuera del enum o `due_before` sin zona, lista vacía con un `agent_id` ajeno. Semilla fechada respecto al arranque: el demo tiene vencidas la de Laura (`TASK_ID`), una del barrido sin nota y una de primer contacto; una `SNOOZED` vencida y una `DONE` que no salen con `status=PENDING`; y `TASK_ID_POR_VENCER`, que vence **3 minutos después del arranque** (con mocks en el navegador, 3 min después de abrir la página: la campanita de 2.26 la ve aparecer sin recargar). Paula tiene una vencida. `source` no sale en `GET /leads/{id}/tasks`, porque el `TaskOut` real todavía no lo trae. |
| Riesgo por agente (2.25, PROPUESTO) | `GET /analytics/at-risk-by-agent?hours=&from=&to=&property_id=&format=`: el predicado de `at-risk` sin tope, agrupado por dueño (`leads_at_risk` descendente, leads como `LeadCard`, más viejos primero), con `total` y el eco `filters`. `format=csv` da una fila por lead con la cabecera de la propuesta. 403 sin `TEAM_ADMIN` (`{ rol: "AGENT" }`), 422 con `hours` fuera de rango, `from > to` o `format` desconocido. Sin filtros, `total` coincide con `GET /leads/at-risk` al mismo umbral. |
| Avisos (2.30) | 34 mensajes con ids enteros desde 1201 (mayor = más nuevo): 22 del demo (6 sin leer, más de una página de 20), 7 de Paula y 5 de Andrés. Cubren `CREATED` y `REASSIGNED` (con `from_agent_id`), los seis `visit_status`, `booked_status` distinto del actual, bot y admin como actor, un admin sin nombre (`actor_name` nulo, lo que le llega al demo cuando no es el bot) y el lead sin nombre de cliente. Cada `VISIT_SCHEDULED` apunta a una cita real de su lead (hay 11 citas semilla nuevas para eso); nombres, dirección y la visita se resuelven al responder, así que cancelar o mover una cita cambia su aviso. `GET /me/notifications` (solo los del demo) y `GET /notifications` (403 sin `TEAM_ADMIN`, con todos los filtros del contrato y los días en hora de Bogotá) paginan con `before`/`limit`; `unread_count` cuenta todas las páginas. `POST .../{id}/read` responde sin cuerpo y guarda `read_at` solo la primera vez (404 si es de otro); `read-all` da `{ marked }`. 422 con `limit` fuera de 1–20, un enum o bool inválido, un uuid o día mal escrito, o el rango al revés. |
| Filtro por inmueble | `property_id = PROPERTY_ID_DOBLE`: casa de Laureles publicada en venta y en arriendo. |
| Mover etapa (HU-06) | `LEAD_ID_NEGOCIANDO` puede ir a `WON` o `LOST`; cualquier otro destino da 409. |
| Lead terminal | `LEAD_ID_GANADO` (WON) y `LEAD_ID_PERDIDO` (LOST): mover cualquiera da 409. |
| `LOST` sin motivo, o motivo con otra etapa | 422, igual que el API. |
| Agentes de la agencia (HU-08, HU-17) | `GET /agents` (`AgentListItem`, sin email): Hernando Carrillo (`TEAM_ADMIN`, el demo), Paula Gómez y Andrés Montoya (`AGENT`, activos), Carlos Úsuga (`AGENT`, inactivo; no sale con `?active=true`) y el bot Asistente Homelitics (`AI_AGENT`, solo con `include_bots=true` o `role=AI_AGENT`). Respeta `active`, `role`, `limit`/`offset` y da 404 con otra `agency_id`, como el back. Los leads del tablero están repartidos entre los cuatro humanos; Laura y el lead vacío siguen siendo del demo porque las citas semilla son suyas. |
| Reasignar (HU-08) | `POST /leads/{id}/reassign`: 409 si el destino es `AGENT_ID_INACTIVO`, el bot (`AGENT_ID_BOT`) o el dueño actual, 404 si el id no es de un agente, 403 si el rol no es `TEAM_ADMIN`; si no, cambia `agent_id` en memoria. No escribe interacción, igual que el API. |
| Embudo (HU-17) | `GET /analytics/funnel` se calcula sobre los 15 leads del tablero (hasta dónde llegaron sale de su log de transiciones, así que mover uno cambia el embudo) **más una cohorte histórica de ~120 leads que solo existe para analítica** y no sale en `GET /leads`. La caída clara está en Visitó → Negociando (~30 %); el arriendo convierte mejor a visita, Paula negocia más y Andrés cierra menos, así que cada filtro cambia la foto. Los porcentajes salen de `leads_reached` con dos decimales, mitad hacia arriba, y van en `null` con denominador 0, como `pct()` del back; `filters` solo repite las claves de filtro (nunca `format`). 403 sin `TEAM_ADMIN`, 422 con el rango al revés. |
| Embudo en CSV (HU-17) | `GET /analytics/funnel?format=csv`: el mismo CSV que arma el back (`csv.writer`, líneas con `\r\n`, `100.0`, celda vacía para `null`, fila final `LOST`). Ver docs/API_CONTRACT.md. |
| Embudo vacío | `created_from=2030-01-01`: todas las etapas en 0 y porcentajes en `null`. |
| Motivos de pérdida (HU-17) | `GET /analytics/lost-reasons?days=`: misma cohorte, contada sobre la fecha de pérdida hacia atrás desde un "hoy" fijo (`2026-09-27`, o ahora si es más tarde). 422 con `days` fuera de 1–730. Sin 403, como el API. |
| Error en analítica | `globalThis.__homeliticsMock = { fallaAnalitica: "red" }` (o `"servidor"`): los GET de `/analytics/*` fallan con ese `kind`. `falla` no sirve aquí porque solo toca escrituras. Ojo: la página precarga en el servidor, así que desde la consola solo se ve en lo que el navegador vuelve a pedir (cambiar los días de motivos, reintentar). |
| Usuario sin permiso de admin | `globalThis.__homeliticsMock = { rol: "AGENT" }` en la consola del navegador: reasignar da 403 (el modal lo dice). Los botones siguen visibles porque el layout lee `/me` en el servidor; para esconderlos, `MOCK_AGENT_ROLE=AGENT` en `.env.local` y reiniciar `npm run dev`. |

Para lo que los datos solos no producen (una escritura que falla por red, un
409 que el front no pudo prever, una respuesta lenta para ver estados
pendientes) hay un interruptor manual. Desde la consola del navegador:

```js
globalThis.__homeliticsMock = { latenciaMs: 2000, falla: "red" } // o "conflicto", etc.
globalThis.__homeliticsMock = undefined                            // lo apaga
```

`latenciaMs` demora todas las respuestas; `falla` hace fallar solo las
escrituras (no los `GET`) con ese `kind`. Ojo: con mocks, servidor y
navegador tienen cada uno su copia en memoria. Lo que se mueve desde el
navegador no lo ve la página del servidor, y un recargado o un hot reload
vuelve a mostrar lo del servidor.

El formulario de "Perdido" nunca manda un `LOST` sin motivo, así que el 422
de HU-09 no sale solo: se fuerza con `{ falla: "invalido" }`. Por la misma
razón de las dos copias, los leads que se pierden en el tablero no aparecen
en `/tablero?etapa=LOST` (esa página la precarga el servidor): ahí se ven
los dos perdidos de la semilla. En el detalle de un lead sí se ve todo,
porque lo que se relee después de marcarlo sale de la copia del navegador.

Mover un lead actualiza `current_stage` en memoria, agrega la fila al log de
`GET /leads/{id}/transitions`, escribe la interacción `STATUS_CHANGE` que
escribe el API (siempre en `LOST`, en las demás solo con `note`) y, al
cerrarlo, cancela sus visitas abiertas.

`LEAD_ID` es el lead de Laura Restrepo con toda la historia (citas, tareas e
interacciones descritas arriba); `APPOINTMENT_ID` es su cita del jueves 17.
