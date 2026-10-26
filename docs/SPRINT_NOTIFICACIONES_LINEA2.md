# Sprint línea 2: bandeja de avisos (notificaciones del CRM)

Continúa la numeración de `docs/SPRINT_E3_LINEA2.md` (la última tarea fue la
2.27 y el último bloqueo el 15).

El CRM ya tiene una bandeja de mensajes dentro de la app
(`homelitics-crm/docs/NOTIFICATIONS.md`, PRs #28 y #29). Cuando el bot de
Telegram o un `TEAM_ADMIN` asigna un lead o agenda una visita, el agente
afectado recibe un mensaje. No hay correo, push ni websockets: el front
consulta el API cada 60 s.

Esto cambia lo que decían el bloqueo 13 y la tarea 2.26: la campanita del
header deja de ser solo de recordatorios y pasa a ser un **centro de avisos**.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Cómo llega el navegador al API | Por el proxy que ya existe, `/api/homelitics/[...path]`. No se agrega nada: el proxy reenvía cualquier ruta con el token de la cookie. |
| Patrón de pantallas | Híbrido, como HU-06/HU-17: carga inicial en Server Component donde hay página propia (monitor), interacción con TanStack Query. |
| Estructura del header | **Centro de avisos unificado**: una sola campana con dos pestañas, "Mensajes" (API real) y "Recordatorios" (la lista de 2.26, que sigue en mock). |
| Paginación de la bandeja | Botón **"Ver más"** con `next_before`. |
| Destino de `LEAD_ASSIGNED` | `/leads/{lead_id}` |
| Destino de `VISIT_SCHEDULED` | `/leads/{lead_id}#cita-{appointment_id}`. La página `/citas/[appointmentId]` es la del **cliente** (cuenta de servicio, acciones de mover y cancelar), no la del agente. |
| Despliegue | Se define después (probablemente AWS). Ver bloqueo 18. |

## Cómo funciona

```
Header (layout de agente)
└── CentroAvisos  (Client Component, se monta después de hidratar)
    ├── useResumenAvisos ── GET /me/notifications (sin filtros, 20)  ← polling 60 s
    │     └── unread_count = el número del badge
    ├── useAvisosAnteriores ── GET /me/notifications?before=…        ← solo al pulsar "Ver más"
    ├── useMarcarLeido / useMarcarTodosLeidos ── POST …/read, …/read-all (optimistas)
    └── pestaña Recordatorios ── useRecordatoriosVencidos (2.26, sin cambios)

/avisos  (solo TEAM_ADMIN)
└── page.tsx (Server Component): /me → 404 si no es admin, precarga GET /notifications
    con los filtros de la URL y entrega el caché con HydrationBoundary
    └── MonitorAvisos (Client): tabla, barra de filtros y "Ver más"
```

### Por qué dos queries y no una sola infinita

Un `useInfiniteQuery` con `refetchInterval` vuelve a pedir **todas** las páginas
cargadas en cada relectura. Con el API dormido y tres páginas abiertas serían
tres peticiones lentas cada minuto. Por eso:

- **Resumen** (`useQuery`): la primera página, sin filtros. Es la que se relee
  cada 60 s y la que da el badge.
- **Anteriores** (`useInfiniteQuery`): arranca en el `next_before` del resumen
  y solo se activa al pulsar "Ver más". No se relee sola. Al cerrar el panel se
  descarta (`removeQueries`), así la próxima vez se abre limpio.

Marcar como leído actualiza **las dos** en el caché, sin volver a pedir nada.

### Polling

TanStack Query ya hace casi todo lo que pide la guía del API:

- `refetchInterval: 60_000` y `refetchIntervalInBackground: false` (el valor por
  defecto): se pausa con la pestaña oculta.
- `refetchOnWindowFocus: true`: relee al volver a la pestaña.
- "Releer después de que el usuario actúe sobre un lead o una visita": un
  `onSuccess` en el `MutationCache` de `app/providers.tsx` que invalida
  `PREFIJO_AVISOS` tras cualquier mutación que no sea de avisos.
- No se solapan peticiones: TanStack deduplica la misma key mientras una está
  en vuelo, lo que importa durante el arranque en frío.

## Tareas

### A. Contrato y datos

| # | Tarea | Criterio de "done" |
|---|---|---|
| 2.28 | Documentar en `docs/API_CONTRACT.md` §3 los cuatro endpoints (`GET /me/notifications`, `POST /me/notifications/{id}/read`, `POST /me/notifications/read-all`, `GET /notifications`), verificados contra `/openapi.json`. Corregir lo que quedó viejo: el "Tampoco notifica al agente nuevo" de `POST /leads/{id}/reassign`, el texto de `ModalReasignar` y el README. | Cada campo, query y código de error del contrato coincide con `/openapi.json`. Ningún texto del repo dice que reasignar no notifica. |
| 2.29 | `NotificationSchema` y `NotificationPageSchema` en `lib/schemas.ts`; operaciones en `crearApi` (`lib/homelitics-nucleo.ts`): `avisos(q)`, `marcarAvisoLeido(id)`, `marcarTodosLeidos()`, `avisosAgencia(q)`. Validar la query antes de enviarla (`limit` 1–20, rango de fechas). | Pasa `type-check`. `limit: 21` y un rango al revés fallan como `invalido` sin tocar la red. El 204 de `/read` no rompe el parseo. |
| 2.30 | Mocks en `lib/mock/` con la forma exacta: unos 30 mensajes que cubran los dos tipos, `CREATED` y `REASSIGNED`, todos los `visit_status`, actor bot y admin, `actor_name` nulo, leídos y no leídos, de varios agentes. Paginación con `before`/`limit`, `read` y `read-all` que cambian el estado, 403 en `/notifications` con `MOCK_AGENT_ROLE=AGENT`, 404 al marcar uno ajeno, 422 con `limit` > 20. Casos nuevos en `/api/mocktest`. | Todo pasa por zod. Con `USE_MOCKS=true` las pantallas funcionan sin red. |

### B. Lógica pura

| # | Tarea | Criterio de "done" |
|---|---|---|
| 2.31 | `features/avisos/texto.ts`: `fraseAviso(n)` → `{ frase, etiqueta, requiereConfirmacion }`, `destinoAviso(n)` → href, `nombreActor(n)`. Textos de la tabla de abajo. Funciones puras, sin React. | Cubre cada combinación de tipo, `assigned_via` y `visit_status`, y los nulos. La fecha sale de `visit_scheduled_at` con `lib/format.ts`. "Requiere tu confirmación" depende de `visit_status`, nunca de `booked_status`. |

### C. Bandeja del agente

| # | Tarea | Criterio de "done" |
|---|---|---|
| 2.32 | `features/avisos/claves.ts` y `hooks.ts`: `useResumenAvisos`, `useAvisosAnteriores`, `useMarcarLeido`, `useMarcarTodosLeidos` (optimistas, con vuelta atrás si fallan) y la invalidación global tras mutaciones de leads o citas en `app/providers.tsx`. | Marcar uno resta 1 al badge al instante y no dispara GET. Si el POST falla, el mensaje vuelve a no leído y se muestra el error. |
| 2.33 | `CentroAvisos` reemplaza a `CampanaRecordatorios` en el layout. Pestañas "Mensajes" y "Recordatorios". Badge = `unread_count`; si hay recordatorios vencidos, la pestaña muestra su número y la campana un punto. Mensaje no leído en negrita con punto. Clic: marca leído, cierra y navega. "Marcar todo como leído". | Se ve con 0, 1 y 20+ no leídos. Se cierra con Escape y clic afuera, como hoy. Con el API dormido no hay spinner ni error a la vista mientras carga. |
| 2.34 | "Ver más" en la pestaña Mensajes. Ancla `id="cita-{id}"` en la entrada de cita de `HistorialLead` y desplazamiento hacia ella al llegar con `#cita-…`. | "Ver más" desaparece cuando `next_before` es `null`. Desde un `VISIT_SCHEDULED` se llega al lead con la cita a la vista. |

### D. Monitor del admin

| # | Tarea | Criterio de "done" |
|---|---|---|
| 2.35 | `app/(agente)/avisos/page.tsx` (Server Component): `notFound()` si no es `TEAM_ADMIN`, como `/embudo`. Precarga `GET /notifications` con los filtros de la URL y la entrega con `HydrationBoundary`. `MonitorAvisos` con la tabla (Cuándo, Para, Qué, Lead, Por, Leído), barra de filtros (agente, tipo, bot o admin, leído, rango de días) en la URL y "Ver más". Enlace "Avisos enviados" en `NavAgente`, solo para admin. Encabezado "N sin leer" con el `unread_count`. | Un `AGENT` no ve el enlace y recibe 404. Los filtros sobreviven a recargar. Mirar el monitor no marca nada como leído. |

### E. Cierre

| # | Tarea | Criterio de "done" |
|---|---|---|
| 2.36 | (Opcional) Aviso flotante de mensaje nuevo: se recuerda el `id` más alto mostrado; si una relectura trae uno mayor, se muestra un `Aviso` breve. Nunca en la primera carga. | No aparece al entrar ni al recargar, solo cuando llega algo nuevo. |
| 2.37 | Probar contra el API real (`USE_MOCKS=false`) con un agente y un admin; `type-check`, `lint` y `build` limpios; actualizar `CLAUDE.md` (estado actual y la campana), `docs/PROGRESO.md` y los bloqueos. | Cada criterio de arriba revisado en vivo y anotado en `PROGRESO.md`. |

## Textos

`{actor}` es "El asistente" cuando `actor_role` es `AI_AGENT`; si no,
`actor_name`; si es nulo, "Un administrador".

| Caso | Texto | Etiqueta |
|---|---|---|
| `LEAD_ASSIGNED` + `CREATED` | Nuevo lead de {actor}: {cliente}, {dirección} | — |
| `LEAD_ASSIGNED` + `REASSIGNED` | {actor} te asignó un lead: {cliente}, {dirección} | — |
| `VISIT_SCHEDULED`, `PENDING_CONFIRMATION` | {actor} agendó una visita con {cliente} el {fecha hora}: requiere tu confirmación | — |
| `VISIT_SCHEDULED`, `CONFIRMED` | {actor} agendó una visita con {cliente} el {fecha hora} | — |
| `VISIT_SCHEDULED`, `RESCHEDULED` | Igual que `CONFIRMED`, con la fecha nueva | "movida" (propuesta del front) |
| `VISIT_SCHEDULED`, `CANCELLED` | Igual que `CONFIRMED` | "cancelada" (de la guía del API) |
| `VISIT_SCHEDULED`, `COMPLETED` | Igual que `CONFIRMED` | "realizada" (propuesta del front) |
| `VISIT_SCHEDULED`, `NO_SHOW` | Igual que `CONFIRMED` | "no asistió" (propuesta del front) |

Con `client_name` nulo: "un cliente". Con `listing_address` nulo: se omite la
dirección.

## Bloqueos

16. **El API no define texto para `RESCHEDULED`, `COMPLETED` ni `NO_SHOW`.**
    La guía solo cubre `PENDING_CONFIRMATION`, `CONFIRMED` y `CANCELLED`. Las
    etiquetas de esos tres son propuesta del front: confirmarlas con L1.
17. **El agente no puede confirmar una visita desde el front.** El aviso dice
    "requiere tu confirmación", pero en el perfil del lead no hay botón para
    pasarla a `CONFIRMED` (`PATCH /appointments/{id}`). Por ahora el aviso
    lleva a la cita en el historial. Candidata a historia del siguiente sprint.
18. **Arranque en frío y tiempo máximo del proxy.** La primera petición tras
    ~15 min puede tardar ~1 min. Si el front se despliega en una plataforma
    serverless (Lambda, Amplify, Vercel), el route handler puede cortarse
    antes. Revisarlo al definir el despliegue.
19. **Avisos que el API todavía no manda:** visitas movidas o canceladas, y al
    dueño anterior de un lead reasignado. La cancelación se ve igual porque
    `visit_status` del mensaje original cambia.
20. **Recordatorios siguen en mock** (bloqueo 9): la pestaña "Recordatorios"
    del centro de avisos depende de `GET /tasks`, que no existe.
