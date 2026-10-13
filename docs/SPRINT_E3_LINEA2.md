# Siguiente sprint, línea 2: automatización del seguimiento (E3)

Historias: **HU-10, HU-11, HU-12 y HU-13**. Continúa la numeración de
`docs/SPRINT_LINEA2.md` (la última tarea fue la 2.12).

La estructura combina tres ideas:

- **Capa de riesgo compartida (bloques B y C).** Una sola consulta a
  `GET /leads/at-risk` alimenta el tablero, el aviso del header y el reporte
  de admin.
- **Panel de seguimiento en el perfil del lead (bloques D y E).** Desde ahí se
  manejan los recordatorios y las plantillas.
- **Contrato primero, con mocks (bloque F).** Cubre lo que el API todavía no
  tiene. Se construye contra `lib/mock/` y se conecta cuando L1 lo publique.

Mismo patrón que HU-06/HU-17: carga inicial en Server Component, interacción
con TanStack Query, una `claves.ts` por feature, zod en todo lo que llega y
mocks con la forma exacta del API.

## Contexto que cambia el alcance

La propuesta del back (`homelitics-crm/docs/PROPOSAL_agency_bots_notifications.md`,
del 2026-10-07) tiene dos decisiones ya acordadas:

- **D3:** los mensajes al cliente, incluidas las plantillas de HU-12, son de
  los bots, no del CRM.
- **D4:** las notificaciones (push, correo, Telegram al agente) salen del CRM
  y pasan a un *notifier* aparte, que todavía no existe.

La misma propuesta dice que la campanita dentro de la app es solo una
consulta al API. Por eso este sprint cubre **todo lo que se ve dentro de la
app**. El push de HU-10 y el envío real de HU-12 quedan como dependencias
externas (ver Bloqueos).

## Hechos del API que condicionan el diseño

Revisados en `homelitics-crm` `main` (merge #21, 2026-10-07):

1. **El umbral por defecto no coincide con la historia.** `GET /leads/at-risk`
   usa `INACTIVITY_HOURS=72` si no se manda `hours`, pero HU-10 pide 24 h.
   **El front siempre manda `hours` explícito.** Rango aceptado: 1–8760.
2. **`at-risk` es de toda la agencia, no del agente.** Filtra por `agency_id`.
   Un `AGENT` recibe también los leads de sus compañeros, así que el filtro
   por `agent_id` lo hace el front.
3. **Devuelve `LeadOut`**, con 8 campos y sin `client_name` ni dirección.
   Para mostrar la propiedad hay que cruzar `listing_id` con `GET /listings`.
4. **Tope de 500, ordenado por `created_at`.** No tiene filtros de fecha ni de
   propiedad: se filtra en el cliente.
5. **Qué cuenta como respuesta:** un `MESSAGE` o `CALL` `OUTBOUND` escrito por
   un humano. Las notas y lo que escribe un `AI_AGENT` no cuentan. Además, un
   lead creado hace menos de `hours` nunca está en riesgo.
6. **Las tareas ya existen por lead:** `GET/POST /leads/{id}/tasks` y
   `PATCH .../tasks/{task_id}` con `PENDING|DONE|SNOOZED`, `due_at` y `note`
   (máx. 1000). **No hay listado para toda la agencia.**
7. **Hay tareas que crea el sistema.** El barrido horario y el *first-touch*
   del relay también crean `follow_up_task`, y `TaskOut` no dice de dónde
   vino cada una.

## Tareas

### A. Base compartida

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.13 | Esquemas y cliente: `api.leadsEnRiesgo({ hours, limit })` → `z.array(LeadSchema)`; `api.crearTarea(leadId, body)` y `api.actualizarTarea(leadId, taskId, body)` en `lib/homelitics-nucleo.ts`; `CreateTaskBody` y `PatchTaskBody` en `lib/schemas.ts` (el patch replica el `model_validator` del API: al menos un campo); mocks de las tres rutas en `lib/mock/` | HU-10, HU-11, HU-13 | Los mocks pasan por zod. El mock de `at-risk` respeta `hours`, excluye terminales y leads más nuevos que la ventana, y corta en `limit`. Un `PATCH` vacío da 422 en el mock igual que en el API. Casos nuevos en `/api/mocktest`. |
| 2.14 | Umbral de horas: `lib/umbral.ts` con `leerUmbral()` (servidor, `cookies()`) y `useUmbral()` (cliente). Cookie `umbral_horas`, por defecto 24, validada 1–8760. Selector pequeño (12/24/48/72 h u otro valor) | HU-10 AC1 | Cambiar el umbral en una pantalla lo cambia en el tablero, el header y el reporte. Recargar no lo pierde. Un valor inválido en la cookie vuelve a 24. Nunca sale una petición a `at-risk` sin `hours`. |

**Decidido en 2.14: cookie y no URL.** Lo leen tres pantallas, incluido el
layout, y un parámetro de URL no viaja entre ellas. Es provisional: cuando
exista `agency_settings.notify.unanswered_threshold_hours` (migración 012, ver
bloqueo 8), `leerUmbral()` pasa a leerlo del API y el selector queda solo para
el admin. Ninguna pantalla cambia.

### B. HU-10: alerta por lead sin respuesta

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.15 | Resaltado en el tablero: `features/riesgo/hooks.ts` con `useLeadsEnRiesgo(horas)` (key `["leads","riesgo",horas]`, sembrada desde `tablero/page.tsx`). `TableroLeads` arma un `Set` de ids y `TarjetaLead` recibe `enRiesgo` | HU-10 AC3 | Una tarjeta en riesgo tiene borde rojo **y** la etiqueta "Sin respuesta hace más de 24 h" (no solo color). Mover la etapa, marcar como perdido o registrar un mensaje saliente invalida la key de riesgo. Si la consulta de riesgo falla, el tablero sigue funcionando sin resaltar y lo dice en una línea. |
| 2.16 | Aviso en el header: `AlertaRiesgo` en `app/(agente)/layout.tsx` con el conteo. Un `AGENT` cuenta solo los suyos (`agent_id === me.id`) y un `TEAM_ADMIN` cuenta toda la agencia. Enlaza a `/tablero?riesgo=1` (agente) o `/riesgo` (admin). `refetchInterval` de 5 min y `refetchOnWindowFocus` | HU-10 AC2 | Con 0 leads en riesgo no se muestra nada. El número coincide con las tarjetas rojas del tablero bajo el mismo umbral. Usa `useHidratado()` como en `TableroLeads`, sin errores de hidratación. `?riesgo=1` en el tablero deja solo las tarjetas en riesgo y sobrevive a recargar. |

**Fuera de este bloque:** el push "opcional" de HU-10 AC2. Le toca al
notifier (D4), ver bloqueo 13.

### C. HU-13: reporte de leads en riesgo por agente

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.17 | Ruta `(agente)/riesgo`, solo `TEAM_ADMIN` (mismo control que `/embudo`). Agrupa `useLeadsEnRiesgo` por `agent_id` en una tabla con agente, número de leads en riesgo y lead más antiguo. Cada fila se despliega con los leads (propiedad, etapa, creado, enlace a `/leads/{id}`). Nombres con `useAgentes()` y propiedad cruzando `listing_id` con `usePropiedades()` | HU-13 AC1 | Ordenado por cantidad de leads en riesgo, de mayor a menor. Un agente sin nombre o un listing que no aparece se muestran como falta, no se inventan. Un `AGENT` ve el aviso de "solo administradores" sin llamar al API. Hay estados de carga, vacío ("Nadie tiene leads en riesgo") y error con reintento. |
| 2.18 | Filtros en la URL (`?desde&hasta&propiedad`) sobre `created_at` y `property_id`, aplicados en el cliente con `select`. Exportación CSV (Blob en el navegador) y PDF (reutilizando el patrón de `features/embudo/pdf.ts`) | HU-13 AC2, AC3 | Un rango al revés se frena en el formulario, como en el embudo. El archivo lleva en el nombre los filtros y el umbral. Si la respuesta trae exactamente 500 leads, la pantalla y el archivo avisan que puede estar incompleto (bloqueo 10). |

### D. HU-11: recordatorios manuales (en el perfil del lead)

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.19 | Panel "Seguimiento" en `(agente)/leads/[leadId]`, junto a `HistorialLead`. Lista de tareas del lead: pendientes y pospuestas arriba, por `due_at`; hechas colapsadas. Formulario con fecha y hora en hora de Bogotá (convertidas a UTC con `date-fns-tz`), atajos "en 1 día / 3 días / 1 semana" y nota opcional (máx. 1000) → `POST /leads/{id}/tasks` | HU-11 AC1 | No se puede crear un recordatorio en el pasado (se frena en el formulario). El nuevo aparece de inmediato y también en la línea de tiempo (misma key `claveTareasLead`). Un recordatorio vencido se marca "Vencido" en rojo. |
| 2.20 | Acciones por tarea: "Posponer" (1 día / 3 días / elegir fecha → `PATCH {status:"SNOOZED", due_at}`) y "Hecho" (`PATCH {status:"DONE"}`). Mutación optimista con rollback, como el drag & drop de 2.10 | HU-11 AC3 | El cambio se ve al instante. Un error devuelve la tarea a su estado anterior con un mensaje en español. Recargar muestra el estado guardado. |

**HU-11 AC2 ("avisar a la hora") queda partido.** Dentro del perfil del lead,
2.19 marca los vencidos. El aviso global ("tienes 3 recordatorios vencidos")
necesita `GET /tasks` para toda la agencia y es la tarea 2.26 (bloque F).

**Hueco conocido:** el panel mezcla los recordatorios manuales con las tareas
que crea el sistema (punto 7 de los hechos). Mientras no exista
`source` en `TaskOut` (bloqueo 11), el panel no intenta distinguirlas.

### E. HU-12: plantillas por etapa del embudo

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.21 | `features/plantillas/`: cuatro plantillas base en es-CO (bienvenida, confirmación de visita, post-visita, reactivación) con los **mismos nombres de variable que la propuesta del back** (`{client_name}`, `{listing_address}`, `{neighborhood}`, `{visit_date}`, `{visit_time}`, `{agent_name}`). `rellenar(plantilla, contexto)` es una función pura | HU-12 AC1, AC2 | Una variable sin dato queda visible como `[falta: fecha de la visita]` y el botón de enviar avisa: nunca se inventa. Las fechas salen en hora de Bogotá. La plantilla sugerida depende de la etapa del lead (por ejemplo, `VISIT_SCHEDULED` → confirmación de visita). |
| 2.22 | Selector de plantilla en el panel de 2.19: vista previa ya rellenada en un `textarea` editable antes de usarla | HU-12 AC1 | El agente cambia el texto de ese mensaje sin tocar la plantilla base. Ver la nota sobre la edición persistente. |
| 2.23 | "Usar plantilla" en dos pasos: **Copiar** (`navigator.clipboard`) y luego **"Ya lo envié"**, que registra `POST /leads/{id}/interactions` con `direction: OUTBOUND, type: MESSAGE` y el canal del lead (editable) | HU-12 AC3 (parcial) | La interacción se registra solo si el agente confirma el envío. Registrar un mensaje que no salió dañaría el tiempo de respuesta y sacaría al lead del riesgo sin motivo. Al confirmar se invalidan la línea de tiempo y la key de riesgo: si el lead estaba en rojo, deja de estarlo. |

**Edición persistente de las plantillas (AC1):** su lugar definitivo es
`agency_settings.bot.templates` (migración 012, bloqueo 8). Mientras tanto
hay dos opciones; decidir antes de 2.22:

- **(a)** Solo edición por mensaje, que es lo que ya cubre 2.22.
- **(b)** Guardar los cambios del agente en `localStorage`, aislado en un
  único módulo que se reemplaza cuando exista el endpoint. Es por navegador,
  así que hay que decirlo en la pantalla.

**HU-12 AC3 completo ("enviar con un clic") no se puede cumplir** en este
sprint: el front no envía mensajes al cliente (D3) y no existe un endpoint
para mandarlos por Telegram. Ver bloqueo 13.

### F. Contrato primero, con mocks (depende de L1)

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.24 | Documentar en `docs/API_CONTRACT.md`, en una sección aparte "Propuestos (no existen todavía)", los endpoints que faltan: `GET /tasks`, `source` en `TaskOut`, `LeadCard` en `at-risk` y en `GET /leads/{id}`, y `GET /analytics/at-risk-by-agent` | todas | Cada endpoint tiene forma de respuesta, filtros y errores esperados. La sección deja claro que no existen y que nada fuera del bloque F puede usarlos. |
| 2.25 | Mocks de `GET /tasks` y `GET /analytics/at-risk-by-agent` con la forma propuesta, más casos en `/api/mocktest` | HU-11, HU-13 | Pasan por zod. Un interruptor por endpoint permite apuntar al real apenas se publique, como se hizo con `GET /agents` (bloqueo 7). |
| 2.26 | Campanita de recordatorios vencidos en el header: `GET /tasks?status=PENDING&due_before=<ahora>&agent_id=<yo>`, `refetchInterval` de 1 min, lista desplegable con enlace a cada lead | HU-11 AC2 | Funciona con el mock. Cuando el endpoint exista, se verifica contra `/openapi.json` y se prueba en vivo creando un recordatorio a 2 minutos. |
| 2.27 | Cuando exista `/analytics/at-risk-by-agent`, `/riesgo` lo usa en vez de agrupar en el cliente. Filtros y CSV del servidor, como `GET /analytics/funnel?format=csv` (el proxy ya reenvía `Content-Disposition`) | HU-13 | Desaparece el aviso de los 500. Los números coinciden con la versión de 2.17 bajo el mismo umbral. |

## Cobertura por criterio de aceptación

| HU | AC | Cubierto por | Al cierre del sprint |
|---|---|---|---|
| HU-10 | AC1 umbral configurable (24 h por defecto) | 2.14 | Sí, por navegador; por agencia al llegar la migración 012 |
| HU-10 | AC2 alerta en dashboard / push opcional | 2.16 | Alerta sí; push no (notifier) |
| HU-10 | AC3 resaltado en el tablero | 2.15 | Sí |
| HU-11 | AC1 fecha, hora y nota | 2.19 | Sí |
| HU-11 | AC2 aviso a la hora programada | 2.19 (en el lead), 2.26 (global) | Parcial; completo cuando exista `GET /tasks` |
| HU-11 | AC3 posponer y completar | 2.20 | Sí |
| HU-12 | AC1 4 plantillas editables | 2.21, 2.22 | Sí; persistencia según la decisión (a)/(b) |
| HU-12 | AC2 variables dinámicas | 2.21 | Sí, salvo `client_name` (bloqueo 12) |
| HU-12 | AC3 enviar con un clic | 2.23 | Parcial: copiar y registrar |
| HU-13 | AC1 agrupado por agente | 2.17 | Sí |
| HU-13 | AC2 filtro por fecha y propiedad | 2.18 | Sí (en el cliente) |
| HU-13 | AC3 CSV/PDF | 2.18 | Sí |

## Bloqueos

Continúa la numeración de `docs/SPRINT_LINEA2.md` (llegó hasta el 7).

8. **Umbral y plantillas sin dónde guardarse.** Ambos dependen de
   `core.agency_settings` (migración 012) y de `GET /agency/settings` y
   `PUT /agency/settings/{bot,notify}`. Por ahora: cookie (2.14) y
   plantillas en el código (2.21).
9. **No hay tareas para toda la agencia.** Sin `GET /tasks?status=&due_before=&agent_id=`
   no hay aviso global de recordatorios (HU-11 AC2). Por ahora: mock (2.25, 2.26).
10. **`at-risk` es limitado.** Devuelve `LeadOut`, sin filtros y con tope de
    500. Por ahora: cruzar datos y filtrar en el cliente, avisando si se
    llega al tope.
11. **Las tareas no dicen de dónde vienen.** Sin `source`
    (`MANUAL|SWEEP|FIRST_TOUCH`) los recordatorios del agente se mezclan con
    los del sistema.
12. **No hay nombre del cliente en el perfil del lead.** Es el bloqueo 5 de
    nuevo: `GET /leads/{id}` devuelve `LeadOut`. Afecta a `{client_name}` en
    las plantillas. `LeadCard` sí trae `client_name`.
13. **Fuera del front, por decisión del equipo:** el push de HU-10 (notifier,
    D4) y el envío real de plantillas de HU-12 AC3 (bots, D3 y D7). Se
    presentan en la review como dependencias, no como trabajo pendiente de
    L2.
14. **Sigue sin login real** (etapa 2 de `lib/session.ts`). "Mis leads en
    riesgo" y "mis recordatorios" se calculan con el agente demo de
    `.env.local`. Para probar la vista de admin hace falta ese agente en
    `TEAM_ADMIN`.

## Orden sugerido

- **Día 1:** 2.13, 2.14 y 2.24.
- **Día 2:** 2.15.
- **Día 3:** 2.16 y prueba de HU-10 contra el API real con `hours` bajo
  (por ejemplo 1) para ver el rojo con datos.
- **Día 4:** 2.17 y 2.18.
- **Día 5:** 2.19 y 2.20.
- **Día 6:** 2.21, 2.22 y 2.23 (decidir antes (a) o (b) de la edición
  persistente). Prueba en vivo: usar una plantilla en un lead en riesgo,
  confirmar "Ya lo envié" y verificar que el lead sale de `/leads/at-risk`.
- **Día 7:** 2.25 y 2.26 contra mocks; 2.27 si L1 ya publicó. Cierre en
  `docs/PROGRESO.md`.