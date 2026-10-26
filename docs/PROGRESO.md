# Bitácora

## 2026-09-11 — Tarea 2.1: selector de horarios

**Hecho.** `app/(cliente)/propiedades/[listingId]/agendar/page.tsx` (Server
Component: trae listing + lead, valida que el lead sea de ese listing) y
`components/GrillaHorarios.tsx` (Client Component: la única parte con
estado — semana, selección, carga). También `components/FichaPropiedad.tsx`,
`components/Aviso.tsx` y `loading.tsx` de la ruta.

Usa `api.slots()`, `agruparSlotsPorDia()` y `horaLocal()` como se pidió. El
agente cuyos slots se piden es `lead.agent_id`, no `listing.agent_id` (está
remarcado en el código y en CLAUDE.md: es el error más fácil de cometer acá).

Estados cubiertos: carga (con aviso de que la primera petición puede tardar
hasta 60 s, tanto a nivel de página como de grilla), semana sin horarios
libres, error de red con botón de reintentar, sin `leadId` en la URL, listing
o lead no encontrado (404), y navegación de semana anterior/siguiente con
"anterior" deshabilitado en la semana actual. Probado a mano contra
`USE_MOCKS=true` en el navegador (Chrome vía Claude Code): grilla agrupada por
día en hora de Bogotá, los horarios ya ocupados del mock no aparecen,
selección habilita "Continuar" con el horario elegido en la URL.

**Decisiones:**

- `leadId` llega por query string (`?leadId=`), no por la ruta: el path del
  sprint (`.../propiedades/[listingId]/agendar`) no lo lleva, y esta pantalla
  no tiene sesión de cliente. Sin el parámetro, la pantalla lo dice en vez de
  inventar un lead. Ver `docs/SPRINT_LINEA2.md`.
- La grilla muestra solo los horarios libres que devuelve el API, sin pintar
  "ocupado" en gris como el prototipo: `/slots` no expone el horario laboral
  completo del agente para hacer ese diff sin inventar. Cumple igual el
  criterio de "done" ("el cliente ve solo horarios realmente libres"). Ver
  nota en `docs/SPRINT_LINEA2.md`.
- La ficha de la propiedad no muestra el nombre del agente: el API no tiene
  `GET /agents/{id}`. Nuevo bloqueo #4 en `docs/SPRINT_LINEA2.md`.
- `lib/format.ts`: los `formatInTimeZone` de nombres de día/mes no llevaban
  locale y salían en inglés ("Thu 17"). Se agregó `{ locale: es }` de
  `date-fns/locale` en `fechaHoraLarga` y en la etiqueta de
  `agruparSlotsPorDia` (nueva `etiquetaDia`, reutilizada por la grilla). Bug
  preexistente, no de esta tarea, pero la rompía directamente.
- **Bug de arquitectura encontrado y corregido, fuera del alcance nominal de
  2.1 pero bloqueante para ella:** `lib/homelitics.ts` no se podía importar
  desde ningún Client Component. Su `pedir()` hace
  `if (enServidor) { await import("./session") }`, y `lib/session.ts` está
  marcado `"server-only"`: Next niega el build en cuanto un Client Component
  alcanza ese import, así la rama nunca se ejecute en el navegador (no es un
  problema de minificación/dead-code-elimination — pasa igual en dev). Como
  la tarea pide un Client Component que llame `api.slots()`, esto rompía 2.1
  por completo. Se resolvió partiendo el archivo:
  - `lib/errores.ts` — `HomeliticsError`/`ErrorKind`, sin dependencias.
  - `lib/homelitics-nucleo.ts` — el motor (fetch + zod + traducción de
    errores) y `crearApi()`, la lista completa de operaciones, compartida.
  - `lib/homelitics.ts` — mitad servidor (sin cambios de superficie: Server
    Components y route handlers lo siguen importando igual).
  - `lib/homelitics-navegador.ts` — mitad navegador, nueva, para Client
    Components. Pega siempre al proxy, sin tocar `lib/session.ts`.

  De paso apareció un segundo bug relacionado: `USE_MOCKS` tampoco llega al
  navegador (Next solo mete al bundle del cliente las variables
  `NEXT_PUBLIC_*`), así que el selector de horarios intentaba pegarle al
  proxy real en vez de usar los mocks. Se agregó `NEXT_PUBLIC_USE_MOCKS`
  como espejo público (`.env.example`, `.env.local`, `CLAUDE.md`) y
  `crearPedir()` ahora recibe `usarMocks` como parámetro en vez de leer
  `process.env.USE_MOCKS` él mismo.

  No se tocó `lib/session.ts` ni el proxy, como pedía la tarea.

**Pendiente:**

- Tarea 2.2 (confirmar la cita) — el botón "Continuar" ya arma la URL
  (`.../agendar/confirmar?leadId=&horario=`) pero esa ruta no existe todavía.
- No se pudo probar a mano el estado "semana sin ningún horario libre": los
  datos del mock nunca dejan una semana completa sin horarios. El código es
  simple (un `if (slots.length === 0)`) pero no tiene una prueba automatizada.
- Falta decidir si `lib/homelitics-navegador.ts` conviene migrarlo a
  `@tanstack/react-query` (ya está en las dependencias aprobadas) cuando 2.3
  necesite releer cada 5 s.

## 2026-09-11 — Tarea 2.2: confirmar la cita

**Hecho.** `app/(cliente)/propiedades/[listingId]/agendar/confirmar/page.tsx`
(Server Component: trae listing + lead como 2.1, valida `leadId`/`horario` en
la query string y que el horario no esté ya en el pasado antes de mostrar
nada) y dos componentes nuevos:

- `components/TarjetaCita.tsx` — el resumen grande de la cita (insignia de
  estado, horario en hora de Bogotá, duración, dirección, agente y canal de
  contacto). Presentacional puro, sin estado: recibe `scheduledAt`,
  `durationMin`, `status`, `direccion` y `canalContacto` por props, así que
  sirve igual antes de crear la cita (2.2, con el horario elegido en la
  grilla) que después (2.3, con la cita real y cualquiera de los seis
  estados). Ahí queda para que 2.3 la reuse tal cual.
- `components/ConfirmarCitaAcciones.tsx` — el único Client Component de la
  pantalla: dispara `api.crearCita()` con `duration_min: 30` y cubre sus tres
  caminos (éxito, 409, "vencido"). Usa `lib/homelitics-navegador.ts`, como
  `GrillaHorarios`.

Reutiliza `Aviso` de 2.1 tal cual. No reutiliza `FichaPropiedad`: el criterio
de la pantalla (docs/SPRINT_LINEA2.md) pide horario, insignia, dirección,
duración, agente y contacto — no precio ni habitaciones/baños — y eso ya lo
cubre `TarjetaCita`, así que repetir la ficha completa era ruido.

**El caso que más importa, probado a mano:** pedir el mismo horario dos veces
(una cita fija del mock, jueves 17 10:30, ya ocupada) da 409. La pantalla
muestra "Alguien más tomó ese horario..." (no un error genérico) y un botón
"Ver horarios actualizados" que navega de vuelta a `.../agendar` con
`?aviso=conflicto`. Ese query param es la única modificación a la pantalla
2.1 (`app/.../agendar/page.tsx`): si está presente, muestra el mismo aviso
arriba de la grilla. La navegación de vuelta ya remonta `GrillaHorarios`, que
pide `/slots` de nuevo al montarse — es la "recarga de slots" que pide el
criterio de done, no hizo falta código extra para eso.

**422 por fecha en el pasado:** se valida en dos capas, no solo una.
`page.tsx` (servidor) compara `horario` contra `Date.now()` antes de
renderizar nada — si ya pasó, ni siquiera se muestra el botón de envío, solo
un aviso con enlace de vuelta a la grilla. `ConfirmarCitaAcciones` (cliente)
vuelve a revisarlo en un `useEffect` al montar y otra vez justo antes de
enviar, por si el cliente deja la pestaña abierta minutos y el horario vence
mientras tanto sin recargar la página. Probado a mano: el mock ya generaba
horarios de la semana actual que quedaban en el pasado según la fecha de hoy
(2026-09-11) — sirvió de caso real sin tener que forzar nada.

**`PENDING_CONFIRMATION` en la interfaz:** la insignia de `TarjetaCita` la
muestra desde antes de enviar (es el estado en el que nace toda cita nueva,
docs/API_CONTRACT.md) y se mantiene después del `POST` exitoso — no cambia
de estado, cambia el bloque de debajo por un mensaje de éxito.

**Decisiones:**

- "Datos de contacto" en la tarjeta se resolvió como el canal por el que
  llegó el lead (`lead.source_channel`, ya en el contrato) en vez de datos
  propios del cliente: no hay sesión de cliente ni identidad de cliente en el
  API (docs/API_CONTRACT.md §6), así que no hay nombre/teléfono/correo que
  mostrar. Es una lectura razonable de "datos de contacto" con lo que el API
  sí tiene, no una invención de campo nuevo.
- Después del 201 no hay redirección a ninguna pantalla de la cita: la ruta
  de 2.3 (`(cliente)/citas/[appointmentId]`) no existe todavía. La pantalla
  se queda en el mismo lugar con un aviso de éxito.
- No se tocó `lib/session.ts` ni el proxy, como pedía la tarea.

**Pendiente:**

- Tarea 2.3 (mover/cancelar) — puede reusar `TarjetaCita` directo, ya
  preparada para recibir el estado real de una cita existente.
- No se automatizó ninguna prueba de los tres caminos de error; todo se
  probó a mano contra `USE_MOCKS=true` en el navegador (Chrome vía Claude
  Code).

## 2026-09-11 — Tarea 2.3: mover y cancelar

**Hecho.** `app/(cliente)/citas/[appointmentId]/page.tsx` (Server Component:
trae la cita, el lead y el listing, mismo patrón de 2.2) y dos componentes
nuevos:

- `components/CitaAcciones.tsx` — el único Client Component de la pantalla.
  Renderiza `TarjetaCita` (2.2, reusada tal cual) con el estado que trae
  TanStack Query, y debajo las acciones "Mover" y "Cancelar la visita".
- `components/SelectorNuevoHorario.tsx` — la grilla semanal para elegir el
  nuevo horario al mover. Mismo patrón que `GrillaHorarios` (2.1: `/slots`
  agrupado por día en hora de Bogotá con `agruparSlotsPorDia`/`etiquetaDia`),
  pero termina en un botón "Confirmar" en vez de navegar. Es un componente
  nuevo, no una modificación de `GrillaHorarios.tsx`: esta tarea no tocó
  ningún archivo de 2.1.

También `app/providers.tsx` (`QueryClientProvider`, montado en
`app/layout.tsx`): ninguna tarea anterior necesitaba TanStack Query, así que
no existía todavía.

**Reglas del API cubiertas, probadas a mano contra `USE_MOCKS=true`:**

- Terminales (`CANCELLED`, `COMPLETED`, `NO_SHOW`): "Mover" y "Cancelar la
  visita" quedan visibles pero deshabilitados (`disabled`, no ocultos —
  el criterio de done dice literalmente "deshabilitadas"), con el motivo a
  la vista arriba. Probado en las tres citas fijas del mock
  (`APPOINTMENT_ID_CANCELADA`, `APPOINTMENT_ID_COMPLETADA`) y cancelando una
  cita en vivo hasta volverla terminal. El API no manda un campo de "motivo"
  para citas terminales, así que `MOTIVO_TERMINAL` en `CitaAcciones.tsx` lo
  redacta a partir del `status` mismo, no de un campo inventado.
- Cancelar avisa ANTES, no después: un paso intermedio en la misma pantalla
  ("Cancelar es definitivo... ¿Confirmas?" con "Sí, cancelar" / "No,
  mantener"), no un `window.confirm()` del navegador ni una pantalla aparte.
- Mover una `CONFIRMED` sin nombrar estado la deja en `RESCHEDULED`: probado
  con `APPOINTMENT_ID_NO_COMPLETADA` (nace `CONFIRMED`) → mover → la insignia
  cambia sola a "Reagendada" sin que el front mande `status` en el `PATCH`
  (`{ scheduled_at }` nada más, la regla la aplica el API).
- 409 por solapamiento al mover: mismo patrón que el 409 de crear (2.2) —
  mensaje explícito y la grilla se remonta (`key` incremental) para traer
  slots frescos, en vez de reintentar contra la misma lista vieja.
- De paso, al probar "mover" con la primera casilla del lunes de la semana
  en curso salió el 422 documentado ("scheduled_at en el pasado"): el mismo
  límite del mock que ya se había anotado en la bitácora de 2.1
  (`generarSlots` no descarta horas ya pasadas del día de hoy). No es un bug
  de esta tarea; `CitaAcciones` ya lo maneja bien (muestra el mensaje del
  API y deja la grilla abierta para elegir otra), así que no hizo falta
  tocar el mock.

**El requisito de "tiempo real" del criterio de done — decisión que hay que
confirmar con el equipo:**

El criterio dice "el cambio se refleja del lado del agente, aunque sea por
relectura periódica", pero **L2 no tiene ninguna pantalla de agente para
citas**: las cinco pantallas del sprint solo incluyen `(agente)/leads/[leadId]`
(2.4, historial del lead, no el detalle de una cita) — el calendario del
agente vive en `homelitics-crm` (L1), fuera de este repo. Como la instrucción
de la tarea pedía igual "relectura cada 5 segundos con TanStack Query", se
implementó ahí donde sí hay pantalla: `CitaAcciones` usa `useQuery` con
`refetchInterval: 5000` sobre `GET /appointments/{id}` (con la cita del
servidor como `initialData`, así no hay parpadeo al montar). El efecto
práctico es que esta misma pantalla de cliente queda "viva" — si el estado
cambia por otro lado (el agente la confirma o cancela desde el CRM, u otra
pestaña del cliente la mueve), se refleja acá sin recargar. Es una lectura
razonable de "tiempo real, sin websockets" con lo que L2 sí controla, pero no
es exactamente "el agente ve el cambio del cliente" — eso lo cumple quien
sea que construya la pantalla de agente para citas, si llega a existir.
Dejarlo anotado en vez de asumido.

**Límite de las pruebas con mocks, para que no se repita la pregunta:** no se
pudo probar el efecto cruzado (cambiar la cita en una pestaña y ver la otra
actualizarse sola) porque `USE_MOCKS` del lado del navegador
(`lib/homelitics-navegador.ts`) llama a `resolverMock` directo en el bundle
del cliente — cada pestaña (y el proceso de servidor que arma el HTML inicial)
tiene su propia copia en memoria de `lib/mock/index.ts`, no hay estado
compartido entre ellas. Se verificó sí que el refetch cada 5 s funciona
dentro de una misma pestaña (la insignia de `TarjetaCita` se actualiza sola
tras una mutación, vía `queryClient.setQueryData`, sin esperar al primer
`refetchInterval`) y que no hay errores de consola. No es una limitación de
esta tarea: ya se sabía de la bitácora de 2.1 que el estado del mock vive
"en memoria de módulo", pero no se había topado antes con la diferencia entre
la copia del servidor y la del navegador.

**Decisiones:**

- `TarjetaCita` se renderiza dentro de `CitaAcciones` (Client Component) y no
  en `page.tsx` (Server Component) como en 2.2: si se pintara también en el
  servidor quedaría un estado inicial que la relectura de 5 s podría dejar
  desactualizado un instante después de montar. Con un solo punto de verdad
  (la `query` de TanStack Query, sembrada con `initialData` del servidor) no
  hay ese riesgo.
- Esta pantalla tampoco valida sesión de cliente, igual que `.../agendar` y
  `.../agendar/confirmar`: el link es el único control de acceso hoy.
- No se tocó `lib/session.ts` ni el proxy, como pedía la tarea.

**Pendiente:**

- Tarea 2.4 (historial del lead) — si esa pantalla de agente termina
  necesitando ver el detalle de una cita en vivo, puede valer la pena
  revisar si `CitaAcciones`/`SelectorNuevoHorario` se pueden compartir en vez
  de reescribirse para la vista de agente.
- No se automatizó ninguna prueba; todo se probó a mano contra
  `USE_MOCKS=true` en el navegador (Chrome vía Claude Code).
- Sigue sin resolverse si `ENFORCE_AVAILABILITY` está en `true` en producción
  (bloqueo #3 de `docs/SPRINT_LINEA2.md`): si lo está, mover a un horario
  fuera de la agenda publicada también puede dar 409, y `CitaAcciones` ya lo
  mostraría como el mismo mensaje de conflicto genérico (no distingue
  "se solapa con otra visita" de "fuera de la agenda"), porque el API tampoco
  distingue los dos casos en el `detail`.

## 2026-09-11 — Tarea 2.4: historial del lead

**Hecho.** `app/(agente)/layout.tsx` (primer archivo del grupo agente: no
exige sesión real todavía, con un `TODO` marcado para cuando exista
`/entrar`) y `app/(agente)/leads/[leadId]/page.tsx` (Server Component: trae
lead, listing, interacciones, citas y tareas). Componentes nuevos:

- `lib/lineaTiempo.ts` — el tipo `EventoTimeline` (unión de interacción / cita
  / tarea) y `construirLineaTiempo()`, que mezcla las tres listas y ordena por
  fecha. Vive en `lib/`, no en `components/`, a propósito: tiene que poder
  llamarse desde `page.tsx` (Server Component) y no puede vivir en un módulo
  `"use client"` — se intentó primero adentro de `HistorialLead.tsx` y Next
  tiró en runtime "Attempted to call construirLineaTiempo() from the server
  but construirLineaTiempo is on the client", el mismo tipo de límite que ya
  había obligado a partir `lib/homelitics.ts` en la tarea 2.1, pero en la
  dirección contraria (una función de un módulo cliente, no de uno servidor).
- `components/EmbudoLead.tsx` — el embudo completo con la etapa actual
  marcada. Las cinco etapas no terminales en su orden estricto
  (docs/API_CONTRACT.md: `INTERESTED → VISIT_SCHEDULED → VISITED →
  NEGOTIATING → WON`); si `current_stage` es `LOST` no se adivina hasta dónde
  había llegado (no hay historial de transiciones de por medio en esta
  pantalla), se pinta el embudo atenuado con una insignia aparte de "Lead
  perdido". Presentacional puro.
- `components/HistorialLead.tsx` — único Client Component de la pantalla:
  la línea de tiempo (recibe el arreglo ya construido por el servidor como
  estado inicial) y el formulario de nota. No usa TanStack Query como
  `CitaAcciones` (2.3): el criterio de "done" de esta tarea no pide relectura
  periódica, así que un `useState` que agrega la nota nueva al final del
  arreglo tras el `POST` alcanza sin la complejidad de más.

**Qué cuenta como "de dónde vino" cada entrada:** interacciones muestran tipo
(mensaje/llamada/nota/cambio de etapa) + dirección + canal; citas muestran
"Cita" con el horario, duración y estado (reutiliza `ETIQUETA_ESTADO`,
exportado de `TarjetaCita.tsx` para no duplicarlo); tareas muestran "Tarea"
con su estado, nota y vencimiento. `STATUS_CHANGE` no muestra canal/dirección
(es un evento del sistema, no un mensaje real).

**Por qué la fecha de orden de citas y tareas es `created_at` y no
`scheduled_at`/`due_at`:** la línea de tiempo es un registro de "qué pasó y
cuándo se supo", no un calendario de visitas futuras. Una cita creada hoy
para dentro de una semana es un evento de HOY en la historia del lead; usar
`scheduled_at` la habría ubicado en el futuro, fuera de orden con el resto.
Probado a mano: la cita del jueves 17 aparece junto al `STATUS_CHANGE` que la
anuncia (mismo `created_at`, 8 de septiembre), no al final de la línea de
tiempo.

**Nota manual, probada a mano:** el textarea manda
`{direction:"OUTBOUND", type:"NOTE", channel:"IN_APP", body}` contra
`api.crearInteraccion` (mitad navegador). La respuesta se agrega al arreglo en
memoria sin releer el resto — aparece de inmediato, como pide el criterio de
"done" — y no hace falta reordenar porque `occurred_at` de una nota nueva
siempre es "ahora", posterior a todo lo histórico.

**Bloqueo nuevo, #5 en `docs/SPRINT_LINEA2.md`:** el encabezado pedía "el
nombre" del cliente, y no hay forma de resolver `client_id` a un nombre (el
API no tiene endpoint de clientes; "Laura Restrepo" solo existe en el
`README.md` del mock, no en la forma real de `Lead`). Se muestra `client_id`
recortado en su lugar, igual que la ficha de 2.1 no muestra el nombre del
agente por el bloqueo #4 análogo.

**Probado a mano contra `USE_MOCKS=true`:** `LEAD_ID` (historia completa: dos
mensajes, tres citas en distintos estados, un `STATUS_CHANGE`, una tarea) y
`LEAD_ID_VACIO` (el caso de lista vacía que pide la tarea, con aviso de
"Todavía no hay interacciones, citas ni tareas"). Un lead inexistente da el
mensaje de "no encontrado". El caso `LOST` del embudo no tiene lead fijo en
el mock (ninguno de los dos leads llega a esa etapa) — se verificó la lógica
de `perdido`/`indiceActual` por separado en la consola del navegador, no
contra una pantalla real.

**Decisiones:**

- La línea de tiempo mezcla interacciones + citas + tareas, no solo
  interacciones: la tabla de tareas del sprint dice "todas las
  interacciones", pero la descripción de la pantalla 2.4 pide explícitamente
  mezclar las tres fuentes, y así lo pidió también la instrucción de esta
  tarea. Se siguió la descripción detallada.
- No se usa `GET /leads/{id}/transitions` aunque existe (confirmado en
  docs/API_CONTRACT.md el 2026-09-10): la tarea pidió leer los cambios de
  etapa como interacciones `STATUS_CHANGE`, que es justo la forma en que el
  mock ya los modela.
- `current_stage` no se edita desde esta pantalla — `EmbudoLead` es de solo
  lectura, como pide la tarea. No hay ninguna acción de transición de etapa
  en 2.4.
- No se tocó `lib/session.ts` ni el proxy. `app/(agente)/layout.tsx` no
  verifica sesión todavía (queda el `TODO`), como pidió la tarea.

**Pendiente:**

- El `TODO` de sesión en `app/(agente)/layout.tsx` — depende de que exista
  `/entrar` (etapa 2 de `lib/session.ts`), fuera del alcance de esta tarea.
- No se automatizó ninguna prueba; todo se probó a mano contra
  `USE_MOCKS=true` en el navegador (Chrome vía Claude Code).
- El caso `LOST` del embudo no tiene cobertura visual real por falta de un
  lead de mock en esa etapa — si se agrega alguno para otra tarea, vale la
  pena confirmarlo visualmente ahí.

## 2026-09-11 — Tarea 2.5: encuesta post-visita

**Hecho.** `app/(cliente)/citas/[appointmentId]/encuesta/page.tsx` (Server
Component: trae la cita y resuelve los dos casos de solo lectura — cita
inexistente, visita que todavía no ha pasado) y dos componentes nuevos:

- `components/EncuestaFlujo.tsx` — único punto donde vive el parche del
  bloqueo 2 (`completarVisitaProvisional()`, comentada in extenso ahí mismo)
  y la comprobación de si el cliente ya respondió. Es Client Component, no
  Server Component, por una razón encontrada probando a mano (ver más abajo).
- `components/EncuestaAcciones.tsx` — el formulario en sí: escala de 1 a 5
  (exigida antes de habilitar "Enviar"), los seis botones de objeción de
  `docs/API_CONTRACT.md` (precio, tamaño, ubicación, estado, administración,
  otro → `PRICE|SIZE|LOCATION|CONDITION|HOA_FEE|OTHER`, selección única),
  texto libre y el envío. Manda siempre `submitted_by: "CLIENT"` — la llena
  el cliente, no el agente, como pidió la tarea.

**Endpoint que no estaba documentado, encontrado al resolver el bloqueo 2:**
`GET /appointments/{id}/feedback` existe (confirmado contra `/openapi.json`
el 2026-09-11) y no estaba en `docs/API_CONTRACT.md` ni en `docs/API_GUIDE.md`.
Devuelve como mucho una fila por lado (`AGENT`, `CLIENT`) — literalmente el
mismo límite que ya tiene el `POST` ("una segunda petición del mismo lado
devuelve la primera con 200", tampoco documentado antes). Se agregó a
`docs/API_CONTRACT.md`, a `lib/homelitics-nucleo.ts` (`feedbackDeCita`) y al
mock (`feedbackDeCitaMock`, con un arreglo `feedbacks` en memoria y el `POST`
del mock ahora devolviendo la fila existente en vez de duplicarla, para que
el mock se comporte igual que el API real en este punto).

**Bug de arquitectura encontrado a mano, con `USE_MOCKS=true`, que obligó a
mover todo a un Client Component:** el primer intento hacía el `PATCH` de
`completarVisitaProvisional()` en `page.tsx` (Server Component, mitad
servidor del API) y el envío del formulario en un Client Component (mitad
navegador). Con mocks encendidos, `crearPedir()` (`lib/homelitics-nucleo.ts`)
nunca toca la red: llama a `resolverMock()` directo donde sea que se ejecute
el código. Eso significa que, en mock, la mitad servidor y la mitad
navegador **no comparten el mismo módulo `lib/mock/index.ts` en memoria**: el
proceso de Node de `next dev` tiene su copia, y el bundle que corre en el
navegador tiene la suya, ejecutada aparte. El `PATCH {"status":"COMPLETED"}`
del servidor nunca lo veía la copia del navegador, así que el `POST .../feedback`
del formulario siempre daba 409 ("todavía no está COMPLETED") aunque la
pantalla ya hubiera "completado" la visita un segundo antes — probado a mano,
reproducido siempre contra `APPOINTMENT_ID_NO_COMPLETADA`.

No es un bug nuevo: la bitácora de la tarea 2.3 ya había encontrado la misma
raíz (cada pestaña tiene su propia copia del mock) para el caso de releer
entre pestañas, y la dejó documentada sin resolver porque no bloqueaba esa
tarea. Acá sí bloqueaba, porque el flujo completo (marcar completada, revisar
si ya hay encuesta, mandar la encuesta) tiene que ver el mismo estado
mutado. La solución fue mover las tres cosas a un solo lado — el navegador,
en `EncuestaFlujo.tsx` — para que compartan la misma copia del mock dentro de
una misma sesión de pestaña. Contra el API real esto no importa (una sola
base de datos), pero mantener las tres llamadas juntas es de todos modos más
simple de razonar que separarlas sin necesidad.

**Límite de las pruebas con mocks que quedó, para que no se repita la
pregunta:** con esta solución, el flujo completo (completar → revisar →
enviar) funciona probado a mano de principio a fin dentro de una misma
sesión de pestaña — incluida la doble comprobación de que un segundo `POST`
no duplica la fila. Lo que **no** se pudo probar a mano es "volver a abrir el
link de la encuesta después de un rato y ver 'ya la enviaste'" con una
recarga completa del navegador: una recarga dura reinicia el bundle de
JavaScript del navegador, y con él la copia en memoria de `lib/mock/index.ts`
que vive ahí — se pierde el `feedbacks` que se había guardado. La lógica de
la comprobación (`feedbackPrevio.some(f => f.submitted_by === "CLIENT")`,
`EncuestaFlujo.tsx`) es correcta por inspección y se probó tal cual dentro de
una sesión; contra el API real no hay este problema (una sola base de
datos persistente, sin copias separadas). Documentado en vez de perseguido:
mismo criterio que la bitácora de 2.3 para su limitación análoga.

**Casos probados a mano contra `USE_MOCKS=true` (Chrome vía Claude Code):**

- Visita que todavía no ha pasado (`APPOINTMENT_ID`, jueves 17): aviso de
  "todavía no llega la hora de tu visita", sin formulario y sin intentar el
  `PATCH`.
- Visita no completable — el caso del 409 (`APPOINTMENT_ID_CANCELADA`, ya
  pasada y `CANCELLED`): el intento de `completarVisitaProvisional()` da 409
  ("ya es terminal") y la pantalla lo traduce a "Esta visita se canceló, así
  que la encuesta ya no aplica." en vez de un error genérico.
- Visita pasada y no completada (`APPOINTMENT_ID_NO_COMPLETADA`, `CONFIRMED`):
  se completa sola y abre el formulario; envío probado con interés 4,
  objeción "Tamaño" y texto libre — éxito.
- Visita ya completada (`APPOINTMENT_ID_COMPLETADA`): abre el formulario
  directo, sin intentar el `PATCH` (ya estaba en `COMPLETED`); envío
  probado con interés 5 — éxito.
- Cita inexistente (`/citas/no-existe/encuesta`): "No encontramos esa cita."
- Sin errores de consola en ningún caso.

**Decisiones:**

- El interés (1 a 5) se exige en la interfaz antes de habilitar "Enviar",
  aunque el API lo marca opcional (`docs/API_CONTRACT.md`: todo opcional
  salvo `submitted_by`). Una encuesta sin ninguna calificación no aporta
  nada; la objeción y el texto libre sí quedan opcionales.
- No se manda `close_probability`: el AC de la pantalla 2.5
  (`docs/SPRINT_LINEA2.md`) sólo pide escala de interés, objeción y texto
  libre — `close_probability` lee como un valor calculado (¿por un agente de
  IA, para HU-14?), no algo que un cliente llene a mano.
- La objeción es de selección única (un botón activo a la vez, con toggle
  para deseleccionar): el API sólo acepta un código de objeción por envío
  (`objection` es un solo string, no un arreglo).
- No se tocó `lib/session.ts` ni el proxy, como pedía la tarea.

**Pendiente:**

- Confirmar con el equipo si vale la pena que la pantalla de encuesta también
  acepte `submitted_by: "AGENT"` (el bloqueo 2 y la tarea hablan de "la vista
  de agente", pero esta línea no tiene ninguna pantalla de agente para citas,
  ver la nota de tiempo real en la bitácora de 2.3) — hoy siempre manda
  `CLIENT`, que es lo que pidió la instrucción de esta tarea.
- No hay forma de mostrar la objeción ya enviada en texto legible si algún
  día hace falta (p. ej. en el historial de 2.4): `objection_id` es un uuid
  contra un catálogo que el API no documenta (ver `docs/API_CONTRACT.md`,
  sección de la respuesta del `POST`/`GET .../feedback`).
- No se automatizó ninguna prueba; todo se probó a mano contra
  `USE_MOCKS=true` en el navegador (Chrome vía Claude Code).

## 2026-09-11 — Intento de pasar a datos reales (`USE_MOCKS=false`)

**Bloqueado, sin llegar a probar ninguna pantalla.** Se verificó en el orden
que pide el flujo de arranque:

1. `GET /health` → `200 {"status":"ok","database":"ok"}`. El servicio estaba
   despierto (no hizo falta esperar los 30-60 s de arranque en frío).
2. `lib/session.ts` (`getAuthHeader`) → el POST a
   `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password` con
   `DEMO_AGENT_EMAIL`/`DEMO_AGENT_PASSWORD` de `.env.local` sí devuelve un
   JWT válido (200). Decodificado (sin verificar firma, solo para depurar):
   `sub` es un uuid, `user_metadata` trae `agent_id`, `agency_id`,
   `full_name` y `role: "AGENT"` — pinta de agente correctamente provisionado.
3. `GET /me` con ese token → **500 Internal Server Error** (cuerpo de texto
   plano, no JSON), reproducido tres veces seguidas. `GET /listings` con el
   mismo token también da 500. `GET /me` **sin** token sí da el `401` esperado
   (`{"detail":"Not authenticated"}`), así que el problema no es el formato
   del header ni la URL: es específico de que el token se acepte y el
   servidor intente resolver el agente.

No se tocó ningún archivo del front más allá de esta verificación: el `500`
pasa igual por `traducirError()` (`lib/homelitics-nucleo.ts`) y se traduce a
`HomeliticsError("servidor", ...)` sin romper nada — el manejo de errores ya
existente funciona, el bloqueo es enteramente del lado del API.

**No se llegó a probar ninguna pantalla ni a tocar `lib/schemas.ts`**: la
respuesta nunca llega a tener forma JSON que reconciliar, así que no hay nada
que corregir ahí todavía.

**Para L1:** `/openapi.json` documenta `/me` con solo `200`/`401`/`403` como
respuestas esperadas — un `500` ahí no es un caso de negocio (como el 403 "sin
agente vinculado"), lee como una excepción no capturada en el servidor al
resolver el `sub` del JWT contra `core.agent`. Los datos del token (agente,
agencia) parecen correctos, así que probablemente no es un problema de
provisioning del agente demo sino un bug o una migración pendiente en el
backend. `USE_MOCKS` se deja en `false` en `.env.local` (como pidió la tarea);
la app en este estado no puede pasar de la pantalla 2.0 contra el API real
hasta que esto se resuelva del lado de `homelitics-crm`.

**Pendiente:** todo — no se pudo empezar a probar 2.1-2.5 contra el API real.

## 2026-09-14 — Datos reales: 2.0 desbloqueada, 2.1-2.5 probadas una por una

**El bug del 500 quedó resuelto de otro lado del equipo.** Se repitió la
verificación en orden: `GET /health` ahora devuelve un campo nuevo,
`{"status":"ok","database":"ok","schema":"ok"}`; el token de Supabase sigue
saliendo bien; `GET /me` y `GET /listings` ya responden 200 con el agente y
listings reales. Con eso desbloqueado, se probaron las cinco pantallas contra
el API real (clonado `Luisrrodriguezg/homelitics-crm` a un directorio aparte
para leer el código del backend cuando hacía falta explicar un 409 o un campo
nuevo — no se modificó nada de ese repo).

**Esquemas corregidos en `lib/schemas.ts` (y documentados en
`docs/API_CONTRACT.md`) por no calzar con respuestas reales:**
- `SlotsSchema`: faltaba `duration_min` (eco del query param del mismo
  nombre, no documentado antes).
- `AppointmentSchema`: faltaba `created_by` (uuid nullable).
- Nuevo `AppointmentDetailSchema`: `GET /appointments/{id}` (a diferencia de
  `GET /leads/{id}/appointments`) trae también `listing_id`, `location`,
  `agent_name` y `google_calendar_url`. `api.cita()` (`lib/homelitics-nucleo.ts`)
  ahora usa este esquema; `citasDelLead()` y `actualizarCita()` siguen con el
  simple, que es lo que de verdad devuelven esas rutas. `lib/mock/index.ts`
  se actualizó para seguir validando contra los mismos esquemas
  (`citaPorIdMock` ahora arma la forma completa; `crearCitaMock` y las cuatro
  citas fijas ya traen `created_by`; `slotsMock` ya trae `duration_min`).

**Dos hallazgos que no son bugs del front, pero si no se documentan alguien
los va a pisar:**

1. **Toda cita que crea la pantalla 2.2 nace `CONFIRMED`, no
   `PENDING_CONFIRMATION`.** Nuevo bloqueo 5 en `docs/SPRINT_LINEA2.md`: el API
   decide el estado según si quien reserva es el dueño del lead
   (`services/appointment.py` del backend), y como el proxy de este repo
   autentica siempre como el mismo agente demo, siempre lo es. No se puede
   arreglar solo con la etapa 2 de `lib/session.ts` — es un límite de que no
   existe identidad de cliente separada en el API. La pantalla sigue
   mostrando "Pendiente de confirmación" porque es el estado con el que nace
   en el mock (que modela el diseño original); contra el API real casi
   siempre va a mostrar "Confirmada" de entrada. Pendiente de decidir con el
   equipo si la pantalla se ajusta a mostrar el estado real tal cual llega.
2. **`POST .../appointments` tiene dos 409 más, sin documentar antes de
   hoy** (`docs/API_CONTRACT.md`): un lead en etapa terminal ("Lead is LOST;
   a closed lead takes no visits") y un lead que ya tiene una visita abierta
   ("Lead already has an open visit (...); PATCH ... to move it"). Ninguno
   de los dos lo distingue `ConfirmarCitaAcciones.tsx` hoy — cualquier 409
   se muestra como "alguien más tomó ese horario", que es específicamente
   engañoso para el caso de "visita ya abierta" (el horario seguía libre).
   Se reprodujo en vivo probando 2.2 con un lead real: `/slots` seguía
   mostrando el horario como libre después del 409, lo que en un primer
   momento parecía inconsistencia del API — no lo era, era este otro caso.

**Pantallas probadas contra el API real, con IDs reales (Chrome vía Claude
Code, `npm run dev`):**
- **2.1** — grilla real de un agente con datos reales, agrupada por día en
  hora de Bogotá; ficha de propiedad con precio/dirección/habitaciones
  reales. Ningún error.
- **2.2** — probado el camino de éxito (aunque terminó en el hallazgo del
  bloqueo 5 de arriba) y el 409 de "visita ya abierta" (aunque en el momento
  se leyó como conflicto de horario, el mensaje "alguien más tomó ese
  horario" resultó impreciso para ese caso real).
- **2.3** — mover (PATCH real, la tarjeta se actualiza) y cancelar (con el
  paso de confirmación) probados de punta a punta contra una cita real;
  acciones quedan deshabilitadas en el estado terminal, confirmado con JS
  (`button.disabled === true`).
- **2.4** — historial real de un lead (cita, tarea, dos cambios de etapa
  auto-generados por el backend al mover/cancelar la visita) y una nota
  manual real que se guardó y apareció de inmediato.
- **2.5** — probado el caso "cita cancelada, la encuesta ya no aplica"
  contra una cita real ya pasada (mensaje correcto). El caso de éxito
  completo (visita real que pasa, se completa provisionalmente y se envía
  la encuesta) no se terminó de probar en vivo: `duration_min` mínimo es 15,
  así que una cita de prueba tarda al menos 15 minutos en "terminar"; se creó
  una (`afb8d316-25fe-4d71-848a-ad6d4e46586c`, lead `36f34ebf...`) que queda
  disponible para probarse a mano después de las 23:40 UTC del 2026-09-14 si
  hace falta cerrar ese caso.

**Aviso de datos:** las pruebas de 2.2/2.3 escribieron contra la base de datos
compartida real (no un mock): se movió y luego se **canceló** una cita
existente del lead `8d14666e-...` (`eae73b1d-...`, cancelar es terminal e
irreversible por API) y se creó una cita nueva de prueba en el lead
`36f34ebf-...`. Se agregó también una nota real de prueba a la línea de
tiempo del lead `8d14666e-...`. Si el equipo depende de esos leads para otra
demo, vale la pena que lo sepan.

**Aparte, nada que ver con el API:** en algún momento de las pruebas el dev
server (Next con Turbopack) se quedó pintando el `loading.tsx` de una ruta
después de varias ediciones en caliente a `lib/schemas.ts`/`lib/mock/index.ts`
mientras corría — un reinicio del server lo resolvió. Parece un artefacto del
HMR al tocar módulos compartidos por medio proyecto, no un bug de la app; se
anota por si se repite.

**Pendiente:**
- Decidir qué hacer con el bloqueo 5 (estado `CONFIRMED` de entrada) antes de
  dar 2.2 por completamente cerrada contra el API real.
- Decidir si `ConfirmarCitaAcciones.tsx` debe distinguir los tres tipos de
  409 de `POST .../appointments` (solapamiento, lead terminal, visita ya
  abierta) en vez de un mensaje único.
- Cerrar la prueba en vivo del camino de éxito de 2.5 (ver arriba).
- `npx tsc --noEmit` y `npx eslint` corridos después de todos los cambios de
  hoy: limpios, sin errores.

## 2026-09-14 — Cierre de los dos pendientes de la verificación contra datos reales

**Decidido con el equipo, ambos resueltos.**

**Bloqueo 5 (cita nace `CONFIRMED`, no `PENDING_CONFIRMATION`): la pantalla
2.2 ahora muestra el estado real que devuelve el API, en vez de asumir
"pendiente" siempre.**
- `components/TarjetaCita.tsx`: `status` pasa a ser opcional. Antes de que la
  cita exista (antes del `POST`) no hay un estado real que anunciar —
  pintarlo era inventarlo. Sin `status` no se pinta la insignia.
- `app/(cliente)/propiedades/[listingId]/agendar/confirmar/page.tsx`: ya no
  le pasa `status="PENDING_CONFIRMATION"` fijo a `TarjetaCita`. El aviso de
  arriba también se suavizó: ya no dice "el agente confirma la visita" (falso
  en el caso normal contra el API real), dice que el agente "queda al tanto"
  y que avisamos por correo *si* hace falta confirmarla.
- `components/ConfirmarCitaAcciones.tsx`: `pedirVisita()` ahora guarda la
  cita completa que devuelve `api.crearCita()` (antes se descartaba). El
  estado `exito` renderiza `TarjetaCita` con el `scheduled_at`/`duration_min`/
  `status` reales y un mensaje de cierre que depende del `status`: "quedó
  confirmada" si es `CONFIRMED`, el mensaje de "pedimos la visita, el agente
  la confirma" de antes si es `PENDING_CONFIRMATION`.
- No se tocó `lib/schemas.ts`: `AppointmentSchema` ya traía `status` desde la
  corrección del 2026-09-14 de la sección anterior.

**Hallazgo B (dos 409 más sin distinguir): `ConfirmarCitaAcciones.tsx` ahora
separa los tres casos leyendo el `detail` del error — el API no manda un
código de razón propio, así que es lo único disponible.**
- Nueva función `clasificarConflicto(detail)`: `detail.includes("takes no
  visits")` → lead en etapa terminal (mensaje de que la conversación ya se
  cerró, sin botón de reintentar — no tiene caso volver a la grilla).
  `detail.includes("already has an open visit")` → visita ya abierta
  (mensaje de que el horario elegido sigue libre pero hay que mover/cancelar
  la otra primero, con un enlace a `/citas/{id}`: el id de la cita existente
  se saca del propio texto del `detail` con una regex, `(([0-9a-f-]{36})`,
  porque es el único lugar donde el API lo da). Cualquier otro `detail` sigue
  cayendo en el caso original (solapamiento de horario): mensaje de "alguien
  más tomó ese horario" sin cambios.
- **Las dos correcciones se probaron en vivo contra el API real** (no solo
  `tsc`/`eslint`), usando el lead `8d14666e-0ebe-40b5-a8fc-99752135c9eb`
  (`listing_id` `c34b9fbb-8d4a-45b8-951a-c8ea585a0afa`): su única cita
  anterior (`eae73b1d-...`) ya estaba `CANCELLED`, así que no tenía ninguna
  visita abierta — punto de partida limpio.
  1. Se pidió una visita nueva (martes 15, 14:00): el `POST` devolvió
     `status: "CONFIRMED"` de entrada (el agente demo es dueño del lead, tal
     cual predice el bloqueo 5) y la pantalla mostró la insignia "Confirmada"
     + "Listo, la visita quedó confirmada. Te esperamos en el horario
     elegido." — **confirma que el bloqueo 5 quedó resuelto**, no solo por
     inspección de código. Cita real creada: `423190e8-1b56-4200-a214-174d677d99bb`.
  2. Se intentó pedir una segunda visita para el mismo lead (martes 15,
     14:30, un horario distinto y libre): el `POST` dio 409 con
     `"Lead already has an open visit (423190e8-..., CONFIRMED) at ...; PATCH
     /appointments/423190e8-... to move it"`. La pantalla mostró el mensaje
     de "Ya hay una visita agendada para esta conversación..." (no el
     genérico de solapamiento) con el botón "Ver esa visita" →
     `/citas/423190e8-1b56-4200-a214-174d677d99bb` — se verificó que el
     enlace cae exactamente en esa cita (misma fecha/hora/estado). **Confirma
     que `clasificarConflicto()` extrae bien el uuid del `detail` y que el
     hallazgo B quedó resuelto para este caso.**
  3. El caso de "lead cerrado" (`detail` con "takes no visits") no se probó
     en vivo: no hay ningún lead `WON`/`LOST` real con id a mano para
     forzarlo sin mover de etapa un lead real de otra prueba. Se verificó
     por inspección del `detail` documentado en `docs/API_CONTRACT.md`
     (confirmado ahí el 2026-09-14), no contra el API.

**Decisiones:**
- No se guardó el `detail` crudo del API en el estado de "lead cerrado": es
  texto en inglés (`"Lead is LOST; a closed lead takes no visits"`), y
  mostrarlo tal cual rompería la convención de copys en español de
  `CLAUDE.md`. El mensaje de la pantalla es redactado a mano, no una
  traducción campo a campo.
- El regex del uuid (`/\(([0-9a-f-]{36})/i`) depende del formato exacto del
  mensaje documentado en `docs/API_CONTRACT.md`
  (`"...open visit (<uuid>, ESTADO) at <iso>..."`). Si el mensaje cambia de
  forma del lado del API, el enlace a la cita existente simplemente
  desaparece (`idExistente` da `null`) en vez de romper la pantalla — se
  degrada al mensaje de texto solo, sin botón.

**Aviso de datos:** esta verificación escribió otra vez contra la base
compartida real: se creó la cita `423190e8-1b56-4200-a214-174d677d99bb`
(martes 15, 14:00, `CONFIRMED`) en el lead `8d14666e-0ebe-40b5-a8fc-99752135c9eb`.
Si el equipo depende de ese lead para otra demo, queda con una visita real
agendada — no se canceló al terminar la prueba, a propósito, para dejarla
disponible por si hace falta probar 2.3/2.4 contra ella después.

**Pendiente:**
- No se pudo probar en vivo el camino de "lead cerrado" (hace falta un lead
  `WON` o `LOST` real con un horario libre a mano para forzarlo). El de
  "visita ya abierta" y el bloqueo 5 sí quedaron verificados en vivo (ver
  arriba).
- `npx tsc --noEmit` y `npx eslint` sobre el proyecto completo, corridos al
  final: limpios.

## 2026-09-14 — Cierre en vivo del camino de éxito completo de 2.5

**La cita de prueba `afb8d316-25fe-4d71-848a-ad6d4e46586c` (lead
`36f34ebf-b8ef-48d9-b0c0-4b8c5b687159`) ya estaba disponible (después de las
23:40 UTC del 2026-09-14, como quedó anotado). Se probó de punta a punta
contra el API real, quedando cerrado el único caso de 2.5 que faltaba.**

1. Se abrió `/citas/afb8d316-25fe-4d71-848a-ad6d4e46586c/encuesta`:
   `EncuestaFlujo` marcó la visita como `COMPLETED`
   (`completarVisitaProvisional()`, `PATCH` real confirmado en los logs del
   server: `200`) y abrió el formulario.
2. Se envió la encuesta (interés 4, objeción "Ubicación", texto libre): `POST
   .../feedback` devolvió `201` y la pantalla mostró el mensaje de éxito.
3. **Se volvió a abrir el mismo link en una pestaña nueva** — el caso que
   quedó sin probar en la sesión de mocks por la limitación ya documentada
   (cada pestaña tenía su copia en memoria del mock, así que una recarga
   dura perdía el `feedbacks` guardado). Contra el API real no hay ese
   problema: la pantalla mostró directo "Ya enviaste tu encuesta sobre esta
   visita. Gracias por tu tiempo." — confirma que
   `feedbackPrevio.some(f => f.submitted_by === "CLIENT")` en
   `EncuestaFlujo.tsx` funciona igual con estado persistente real, no solo
   por inspección de código.

**Nota aparte, no un bug de la app:** al recargar la MISMA pestaña justo
después del `POST` (sin abrir una pestaña nueva), la pantalla se quedó
mostrando `loading.tsx` ("Buscando tu visita…") indefinidamente, incluso
después de reiniciar el servidor de desarrollo dos veces. La causa real no
fue el server (los logs mostraban la petición completa con `200`) sino la
pestaña del navegador reteniendo el bundle de JavaScript de una sesión
anterior de Turbopack — al abrir una pestaña nueva contra el mismo servidor
recién reiniciado, cargó y renderizó bien de inmediato. Es distinto del
artefacto de HMR de la sección "2026-09-11" de más abajo (ahí un reinicio sí
lo resolvía); acá hizo falta además una pestaña nueva. Anotado por si se
repite: si el dev server se reinicia mientras el navegador ya tiene una
pestaña abierta, recargar esa misma pestaña puede no alcanzar — hay que
abrir una nueva.

**Con esto, las cinco pantallas del sprint quedan probadas de punta a punta
contra el API real**, incluidos todos los caminos de error documentados en
`docs/API_CONTRACT.md` salvo el 409 de "lead en etapa terminal" (2.2), que
sigue sin un lead real `WON`/`LOST` a mano para forzarlo en vivo.

## 2026-09-15 — Herramienta de dev para encontrar ids reales, y el último 409 cerrado

**Motivo:** probar contra el API real venía requiriendo varios `curl` al
proxy (`GET /me`, `GET /listings`, `GET /leads?...`) solo para conseguir un
`leadId`/`listingId` válido antes de tocar una sola pantalla — ningún flujo
del front lista leads (ninguna de las cinco pantallas del sprint lo pide,
ver `docs/SPRINT_LINEA2.md`). Se agregó `app/dev/explorar/page.tsx`: **no es
una sexta pantalla del sprint**, es una herramienta de desarrollo.

**Qué hace:** Server Component que llama `api.yo()` + `api.leads({stage,
limit:15})`, y por cada lead trae en paralelo sus citas
(`api.citasDelLead()`) y su propiedad (`api.listing()`) — ninguna operación
nueva en `lib/homelitics-nucleo.ts`, todas ya existían (se habían agregado
para `/api/mocktest` pero no se usaban desde ninguna pantalla). Por cada
lead arma directo los links a 2.1 y 2.4 (con el id ya puesto), y por cada
cita los links a 2.3 y 2.5. Marca visualmente si el lead es del agente demo
("tu lead", nace `CONFIRMED` al agendar) o de otro agente de la agencia
("de otro agente", debería nacer `PENDING_CONFIRMATION`) — bloqueo 5. Chips
de filtro por `stage` en la URL (`?stage=LOST`, etc.), útil justo para el
caso de abajo. Primer intento resolvía la dirección con un `GET /listings`
de 50 en bloque y buscaba por `listing_id` en memoria — la muestra no
alcanzaba a cubrir los leads reales de la agencia (todos salían "propiedad
fuera de esta muestra"), así que se cambió a un `GET /listings/{id}` por
lead en paralelo con las citas: más llamadas, pero siempre exacto.

**Con la herramienta, se encontraron de una 11 leads reales en `LOST`** (y
uno en `WON`) filtrando `?stage=LOST` — el dato que faltaba para el único
caso sin probar en vivo de todo el sprint. Se intentó pedir una visita sobre
el lead `c6f19fdc-7a17-4c7a-a364-169626a45f34` (`LOST`, listing
`ee6081ac-2dd0-422e-a66b-f2eaeb93f78c`): el `POST` dio 409 con
`{"detail": "Lead is LOST; a closed lead takes no visits"}` y la pantalla
mostró "Esta conversación ya se cerró, así que no se pueden pedir más
visitas sobre ella." — sin botón de reintentar, como se diseñó. **Con esto,
los tres tipos de 409 de crear una cita y el bloqueo 5 quedan verificados en
vivo, sin ningún caso pendiente.**

No se escribió nada nuevo en la base real en esta sesión: el intento sobre
el lead `LOST` nunca llega a crear una fila (el 409 pasa antes), y explorar
leads/listings es de solo lectura.

**Archivos:** `app/dev/explorar/page.tsx` (nuevo). `README.md` menciona la
herramienta como la forma recomendada de conseguir ids reales, en vez de
`curl` a mano. `npx tsc --noEmit` y `npx eslint`: limpios.

## 2026-09-15 — Bug: el API renombró el canal `WHATSAPP` a `TELEGRAM`

**Síntoma:** `/dev/explorar?stage=INTERESTED` (y cualquier pantalla que lea
leads o interacciones) caía en "El API devolvió una forma inesperada en
/leads...: Invalid option: expected one of WHATSAPP|IN_APP|CALL" sobre
`source_channel`. **Causa:** el API cambió el enum de canal a
`TELEGRAM|IN_APP|CALL` — confirmado contra `/openapi.json` (`LeadOut`,
`LeadCreate`, `InteractionOut`, `InteractionCreate`) y contra `GET /leads`
real (9 de 15 leads `INTERESTED` venían en `TELEGRAM`). Es un renombre, no
un valor agregado: `WHATSAPP` ya no existe en el esquema. zod hizo lo que
tenía que hacer (fallar en un solo punto).

**Hecho:** `Channel` en `lib/schemas.ts`, `ETIQUETA_CANAL` en
`components/TarjetaCita.tsx` (`TELEGRAM: "Telegram"`), los tres valores del
mock (`lib/mock/index.ts`, más su narrativa y la de `lib/mock/README.md`) y
las cuatro menciones de `docs/API_CONTRACT.md`, con nota fechada en la tabla
de enumeraciones. Verificado en el navegador contra el API real: los siete
filtros de `/dev/explorar` cargan sin error y el historial 2.4 de un lead
`TELEGRAM` (`33206870-...`) muestra "Telegram". `tsc` y `eslint`: limpios.

**Pendiente:** avisar a L3 (bot de Telegram) y a L1 de que el front ya usa
`TELEGRAM`; si el API vuelve a cambiar el enum, el síntoma será el mismo
mensaje de zod.

## 2026-09-15 — Encuesta 2.5: abrir el link ya no cierra la cita

**Problema:** `EncuestaFlujo.tsx` hacía `PATCH {"status":"COMPLETED"}`
(terminal, irreversible) en un `useEffect` en cuanto se abría
`/citas/{id}/encuesta` sobre una visita ya pasada. Bastaba con abrir el link
— por ejemplo desde `/dev/explorar`, que lo ofrece en toda cita, incluidas
las de otros agentes — para cerrar una cita real. Además lo intentaba sobre
cualquier estado no terminal, incluido `PENDING_CONFIRMATION` (una visita que
el agente nunca aceptó quedaba "realizada").

**Hecho:** el parche del bloqueo 2 sigue existiendo, pero ahora:
- Solo corre tras un paso explícito: "¿sí pudiste ir a la visita?" →
  "Sí, fui a la visita" hace el `PATCH` y abre el formulario; "No, no pude
  ir" no escribe nada y ofrece un enlace a `/citas/{id}` para reagendar.
- Solo sobre `CONFIRMED` o `RESCHEDULED` (`COMPLETABLE`). `PENDING_CONFIRMATION`,
  `CANCELLED` y `NO_SHOW` muestran el motivo sin llamar a la red — antes
  `CANCELLED`/`NO_SHOW` se descubrían provocando el 409 del `PATCH`.
- `COMPLETED` sigue como antes: revisa `GET .../feedback` y muestra
  "ya enviaste" o el formulario.

Probado a mano contra el API real, solo por caminos que no escriben: la
cita `022c6a3c-6446-4d91-a170-6ecdb41c017f` (`CONFIRMED`, ya pasada) muestra
la pregunta al abrir y sigue `CONFIRMED` después (en la red solo hay `GET`,
ningún `PATCH`); "No, no pude ir" deja el aviso con el enlace. Las citas
`66177102-...` (`COMPLETED`) y `eae73b1d-...` (`CANCELLED`) se comportan como
antes. **"Sí, fui a la visita" no se pulsó** contra el API real, para no
cerrar una cita compartida: hace el mismo `PATCH` que ya se había verificado
en vivo el 2026-09-14. No había ninguna cita pasada `RESCHEDULED` ni
`PENDING_CONFIRMATION` para probar esos dos estados. `tsc` y `eslint`:
limpios.

**Pendiente:** sigue siendo un parche. La forma correcta es que L1 dé una
manera real de cerrar visitas (o que el feedback no exija `COMPLETED`).

## 2026-09-15 — Contrato: dos reglas de `POST .../appointments` que faltaban

Revisando `/openapi.json` para saber qué puede escribir el agente demo sobre
leads de otros agentes, aparecieron dos reglas de `POST
/leads/{id}/appointments` que no estaban en `docs/API_CONTRACT.md`: pedir el
**mismo horario** de la visita abierta devuelve esa visita con `200` (el 409
de "visita ya abierta" es solo para otro horario), y los agentes de IA solo
reservan dentro de `/slots` con 120 minutos de anticipación. Agregadas al
contrato. Ningún cambio de código: el `200` ya se trata como éxito.

## 2026-09-27 — Base del tablero (HU-06 / HU-09), sin pantallas

Hecho: `lib/schemas.ts` suma `LostReason`, `LastInteractionSchema`,
`LeadCardSchema` (extiende `LeadSchema`; `asking_price` con el mismo `money`
de los listings), `TransitionSchema` y `CreateTransitionBody`, con un
`superRefine` que replica la regla del back (`lost_reason` obligatorio en
`LOST` y prohibido con valor en cualquier otra etapa; `null` sí vale).
`lib/etapas.ts` es la fuente única de orden (`EMBUDO`, `ETAPAS`), etiquetas de
etapa y de motivo de pérdida, `esTerminal`, `puedeMover` y `destinosLegales`;
`EmbudoLead` ya las importa de ahí. En `lib/homelitics-nucleo.ts`, `leads()`
acepta todos los filtros del contrato (`FiltrosLeads`) y valida con
`LeadCardSchema`; hay `transiciones()` y `moverLead()`. El mock tiene 5
listings (uno con dos publicaciones, uno sin dirección) y 14 leads en las
seis etapas, filtra como el API y aplica las reglas 409/422 de las
transiciones con sus efectos (interacción `STATUS_CHANGE`, visitas canceladas
al cerrar). `/api/mocktest` tiene casos nuevos para todo esto.

Decidido: **no hizo falta un `kind` nuevo** en `lib/errores.ts`: 409 ya es
`conflicto`, 422 ya es `invalido` y `traducirError` ya aplana el array de
Pydantic. La pantalla hace lo mismo con los dos 409 (revertir y releer), así
que no vale separarlos. `leads()` rechaza `created_from > created_to` sin
llamar al API, y `moverLead()` convierte la falla del `superRefine` en
`HomeliticsError("invalido")`, para que la pantalla nunca vea un `ZodError`.
`/dev/explorar` ahora valida su `?stage=` con `Stage.safeParse`.

Verificado: `tsc` y `eslint` limpios. Los mocks se probaron compilando el
núcleo aparte y llamándolo con `usarMocks: true` (sin red): filtros, orden,
paginación, 409 de salto ilegal/retroceso/terminal y los tres 422. **No** se
corrió `/api/mocktest` en el navegador porque `.env.local` tiene
`USE_MOCKS=false` y los casos de `moverLead` moverían leads reales.

Pendiente: `crearCitaMock` no da el 409 "takes no visits" para leads
terminales, y `actualizarCitaMock` no replica el `_sync_funnel` del
calendario (cita `CONFIRMED`/`COMPLETED` que adelanta la etapa). Faltan las
pantallas del tablero.

## 2026-09-27 — Tablero de leads de solo lectura con filtros (2.8 + 2.9)

Hecho: ruta `app/(agente)/tablero/` (Server Component + `loading.tsx`). La
página lee `?etapa=&propiedad=&desde=&hasta=`, precarga `GET /leads`
(`active=true`, `limit=200`) y `GET /listings` con un `QueryClient` nuevo por
request y entrega el caché con `HydrationBoundary`. Código en
`features/tablero-leads/`: `claves.ts` (normaliza los filtros de la URL,
`claveLeadsTablero`, `clavePropiedades`, `aFiltrosApi`), `hooks.ts`
(`useLeadsTablero`, `usePropiedades`, con `lib/homelitics-navegador.ts`) y
`components/` (`FiltrosTablero`, `TableroLeads`, `TarjetaLead`).
`lib/format.ts` suma `tiempoRelativo`. `app/providers.tsx` pone `staleTime`
30 s por defecto. El layout de (agente) tiene una barra con enlace al tablero.

Decidido: la ruta es `/tablero` y no `/leads` como decía el sprint (doc
corregido). Los filtros llegan al tablero como prop desde `searchParams`, no
desde `useSearchParams`: la key del cliente es exactamente la del servidor y
cambiar un filtro no dispara una petición del navegador además de la del
servidor. El selector de propiedad agrupa listings por `property_id`. Una
etapa terminal o una fecha mal formada en la URL se descartan; un rango al
revés en la URL muestra un aviso y no se pide. El formulario usa `noValidate`:
con `min`/`max` en las fechas el navegador frenaba el envío con su propio globo
en vez del mensaje en español. El "hace N" de la tarjeta lleva
`suppressHydrationWarning` y la fecha exacta en Bogotá en el `title`.

Verificado con `USE_MOCKS=true` (cambiado a mano en `.env.local` y
restaurado): `tsc` y `eslint` limpios; cuatro columnas con los 10 leads
abiertos del mock; filtro de propiedad doble (4 tarjetas, SALE y RENT) sin
recargar la página; etapa + fechas; rango al revés frenado en el formulario y
en la URL; en móvil las columnas hacen scroll horizontal sin desbordar la
página; sin errores de consola. Con mocks el navegador no hace peticiones de
red, así que "la hidratación no vuelve a pedir" no se pudo comprobar mirando
la red; queda por mirar contra el API real.

Pendiente: 2.10 (drag & drop + "Mover a…"), 2.11 (perdido), 2.12 (cerrados).
Paginación si una agencia pasa de 200 leads abiertos (hoy solo avisa).

## 2026-09-27 — Drag & drop en el tablero (2.10, primera parte)

Hecho: `@dnd-kit/core` 6.3.1 (versión fija, agregada a las dependencias
aprobadas de `CLAUDE.md`). `TableroLeads` monta un `DndContext` con
`PointerSensor` (8 px de activación: el clic sigue abriendo el lead) y
`KeyboardSensor` (espacio toma y suelta, flechas saltan de columna válida en
columna, Escape cancela, Enter abre el lead), con instrucciones y anuncios
en español. Mientras se arrastra, solo las columnas que `puedeMover()`
permite quedan resaltadas y activas; las demás, atenuadas y deshabilitadas.
"Ganado" es una zona de soltar al final y pide confirmación en un
`<dialog>` modal antes de enviar `WON`. `hooks.ts` suma `useMoverLead`
(optimista), `useLeadsMoviendose` y `mensajeErrorMover`; `claves.ts` suma
`PREFIJO_TABLERO`, `claveTransiciones` y `claveInteracciones`. La tarjeta en
vuelo muestra "Moviendo…" y no se puede volver a arrastrar. `lib/mock` tiene
un interruptor manual (`globalThis.__homeliticsMock`) para latencia y fallas.

Decidido: onError no restaura la foto entera de cada key sino solo la
tarjeta que falló, en su posición: con dos movimientos en vuelo, la foto del
segundo ya trae el primero movido, y restaurarla lo re-aplicaba después de
deshecho (se vio en la prueba). El tablero se relee solo cuando termina el
último movimiento en vuelo (`isMutating() === 1`). `onSettled` no espera las
relecturas: "pendiente" dura lo que dura el POST. El aviso de error va por
un `alFallar` del hook y no por las opciones de `mutate()`, que solo corren
para la última llamada. El aviso de red trae "Reintentar"; el de 409 no. Las
columnas solo se deshabilitan cuando se sabe que son inválidas, y el salto
por teclado filtra con `puedeMover()`: si no, una flecha rápida llegaba
antes del render que habilita las válidas.

Verificado con `USE_MOCKS=true` (cambiado a mano en `.env.local` y
restaurado): `tsc` y `eslint` limpios; salto legal por teclado y por mouse;
salto ilegal (Interesado → Visitó) con falla de red activada, sin aviso ni
pendiente, o sea sin llamada; 409 simulado, la tarjeta vuelve y sale el
mensaje; red simulada con dos tarjetas en vuelo, ambas vuelven a su lugar
y orden, y "Reintentar" completa el movimiento; WON con confirmación sale
del tablero; la tarjeta pendiente no se vuelve a tomar; el clic sigue
navegando; sin errores de consola.

Pendiente de 2.10: el menú "Mover a…" (táctil y alternativa sin arrastre:
en táctil el arrastre no arranca porque no se puso `touch-action: none`,
para no romper el scroll horizontal de las columnas). Después, 2.11
(Perdido) y 2.12.

## 2026-09-27 — Lead perdido (2.11 + 2.12, HU-09)

Hecho: zona "Perdido" en el tablero, fija abajo a la derecha y visible solo
mientras se arrastra (acepta cualquier etapa abierta; con teclado, flecha
abajo). Soltar ahí no llama al API: abre `components/ModalPerdido.tsx`
(`<dialog>` nativo, foco en el motivo, Esc cancela, motivo obligatorio con
las etiquetas de `lib/etapas.ts`, nota opcional con contador de 2000, aviso
de que es definitivo y cancela las visitas). Confirmar llama a
`useMoverLead` con `to_stage: "LOST"`, `lost_reason` y `note`, y solo ahí
corre el optimismo. El detalle del lead tiene el botón "Marcar como perdido"
(`components/EtapaLead.tsx`) con el mismo modal y hook. Vista de cerrados:
"Ver perdidos" cambia a `?etapa=LOST` (sin `active`), lista de solo lectura;
el filtro de etapa ofrece Ganado/Perdido en ese modo. `lib/lineaTiempo.ts`
suma `textoInteraccion()`: "Lost: PRICE — nota" se lee "Perdido: Precio —
nota" en el historial y en las tarjetas. `EmbudoLead` recibe `perdidoDesde`
(del log de transiciones) y muestra "Perdido en <etapa>".

Decidido: el detalle del lead pasó a TanStack Query (el servidor siembra
lead, interacciones, citas, tareas y transiciones con `setQueryData` +
`HydrationBoundary`); sin eso no había nada que invalidar y `HistorialLead`
guardaba los eventos en `useState`. Todo lo del lead cuelga de
`["leads", id]` y `useMoverLead` invalida ese prefijo entero. En el tablero
el modal se cierra al confirmar y un error sale en el aviso de siempre; en el
detalle queda abierto mientras envía y muestra el error adentro para
reintentar. En la detección de colisiones la zona Perdido gana solo bajo el
puntero (con teclado podría rozarla al saltar de columna). `DndContext` lleva
`id` fijo: el que genera @dnd-kit no coincidía entre servidor y navegador y
daba un aviso de hidratación en `aria-describedby`. `mensajeErrorMover` suma
el caso `invalido` y ya no nombra "el tablero".

Verificado con `USE_MOCKS=true` (cambiado a mano en `.env.local` y
restaurado): `tsc` y `eslint` limpios; perdido desde Interesado, Visita
agendada y Visitó en el tablero (una por teclado) y desde Negociando en el
detalle; Cancelar y Esc dejan la tarjeta en su columna; 422 forzado con
`__homeliticsMock = { falla: "invalido" }`: en el tablero la tarjeta vuelve
con aviso, en el detalle el error sale en el modal y el reintento funciona;
"Ver perdidos" lista la semilla con el motivo traducido; el detalle de un
perdido dice "Perdido en Visitó"/"Perdido en Negociando".

Pendiente: el menú "Mover a…" de 2.10 (sigue siendo la única forma de
perder desde el tablero sin arrastrar; en el detalle ya está el botón).
Con mocks, lo perdido en el navegador no aparece en `?etapa=LOST` porque esa
página la precarga la copia del servidor (anotado en `lib/mock/README.md`);
con el API real no pasa. Falta probarlo contra el API real.

## 2026-09-27 — Preparación de HU-08 (reasignar) y HU-17 (embudo): piezas compartidas

Hecho: `docs/API_CONTRACT.md` documenta, verificados contra `/openapi.json`,
`POST /leads/{id}/reassign`, `GET /analytics/funnel` y
`GET /analytics/lost-reasons` (salen de la §7), y una §3 bis "PROPUESTO — aún
no existe en el API" con `GET /agents` (confirmado: el API real responde 404).
Bloqueo 7 en `docs/SPRINT_LINEA2.md`. `api.agentes({active?})` en el núcleo.
Mock: 4 agentes (Hernando TEAM_ADMIN, Paula y Andrés activos, Carlos
inactivo) y leads del tablero repartidos; `/slots` acepta cualquier agente de
la agencia y `agent_name` de la cita sale de su agente.
`features/agentes/`: `useAgentes()` (disponible | pendiente | cargando |
error), `SelectorAgente` y `NombreAgente`. `lib/agente-actual.ts`
(`cache()` sobre `/me`) + `AgenteActualProvider`/`useAgenteActual`/
`useEsAdmin` en `features/agentes/AgenteActual.tsx`; el layout de (agente)
muestra "Embudo" solo a TEAM_ADMIN.

Decidido: el 404 de `/agents` se atrapa en `queryFn` y se guarda como valor
"pendiente", no como error: así no hay reintentos ni relecturas por montaje
(TODO visible en `useAgentes()` para quitarlo). Una sola petición trae todos
los agentes; el selector filtra activos y excluidos del caché. Se agregó el
estado "cargando" a los tres pedidos. Si `/me` falla, el layout sigue y solo
esconde lo de admin. Nuevo interruptor de mock `{ sinAgentes: true }`.

Verificado con `USE_MOCKS=true` (restaurado) en una página temporal ya
borrada: selector con excluidos y solo activos, nombres por id, estado
pendiente deshabilitado con `aria-describedby`, "Embudo" oculto con rol AGENT.
`tsc` y `eslint` limpios.

Pendiente: `/embudo` todavía no existe (el enlace da 404 hasta HU-17);
`api.reasignar()`, `api.embudo()`, `api.motivosPerdida()` y sus esquemas zod
van con la tarea de cada pantalla.

## 2026-09-27 — Reasignar un lead (HU-08)

**Hecho.** `api.reasignarLead()` (`POST /leads/{id}/reassign`, `LeadSchema`,
cuerpo validado con `ReassignBody` antes de enviar) y su mock (403 / 404 /
422 / 409 inactivo o mismo dueño; cambia `agent_id` en memoria).
`features/reasignar/`: `useReasignarLead()` + `mensajeErrorReasignar()`,
`ModalReasignar` (`<dialog>` como ModalPerdido, nota de "sin notificación y
tareas con el anterior") y `ReasignarLead` (botón + modal). Puntos de
entrada solo para `useEsAdmin()`: "A cargo de …" y "Reasignar" en el
detalle (no en leads cerrados), el dueño en `TarjetaLead`, y el filtro
"Agente" del tablero (`?agente=` → `agent_id`).

Decidido: no optimista (solo cambia el dueño, no la columna); al terminar
invalida `PREFIJO_TABLERO` y `prefijoLead(id)`, y con 409 relee la lista de
agentes. Con 403 el modal no deja reintentar. El filtro ofrece también a los
inactivos (pueden conservar leads); el selector del modal no. Nuevas props:
`NombreAgente.prefijo` y `SelectorAgente.autoFocus`. Nuevo interruptor de
mock `{ rol: "AGENT" }`. Verificado en /openapi.json que reasignar no
escribe interacción: `textoInteraccion()` no cambia.

Verificado con `USE_MOCKS=true` (restaurado): casos del mock en
`/api/mocktest`; reasignación ok (el detalle pasa a "A cargo de Andrés
Montoya"); 409 simulado con reintento; 403 sin reintento; "pendiente" con
selector y botón deshabilitados y explicados; rol AGENT sin botón, sin
nombres ni filtro. `tsc` y `eslint` limpios.

Pendiente: contra el API real depende de `GET /agents` (bloqueo 7). Con
mocks, el navegador y el servidor tienen memorias separadas: una
reasignación hecha en el navegador se pierde al recargar la página.

## 2026-09-27 — Embudo de conversión (HU-17)

**Hecho.** `FunnelSchema` y `LostReasonStatSchema` en `lib/schemas.ts`;
`api.embudo()` (`GET /analytics/funnel`, rechaza el rango al revés sin
llamar, con la misma guarda que `leads()`, ahora `rechazarRangoAlReves`) y
`api.motivosPerdida(days)`. `lib/filtros-url.ts` saca de
`features/tablero-leads/claves.ts` la lectura de parámetros y fechas; el
tablero la usa sin cambiar de comportamiento. `features/embudo/`: `claves.ts`
(filtros, `claveEmbudo`, `claveMotivos`, `etapaConMayorCaida`), `hooks.ts`
(`useEmbudo`, `useMotivosPerdida`; no reintentan 403 ni 422),
`FiltrosEmbudo`, `Embudo` (estados), `GraficaEmbudo`, `TablaConversion` y
`MotivosPerdida`. Ruta `app/(agente)/embudo/` con `page.tsx` y
`loading.tsx`. `formatPorcentaje()` en `lib/format.ts`.

Decidido: si `/me` dice que no es `TEAM_ADMIN`, la página muestra el aviso y
no llama a `/analytics/*`; si `/me` falla, se intenta igual y el 403 se
pinta como "sin permiso". Mayor caída = menor `pct_from_prev` no nulo (en
empate, la más temprana); la gráfica va `aria-hidden` y la tabla es la
versión accesible. Motivos con selector propio (estado local, no URL). Mocks
de analítica sobre los 14 leads (vía su log de transiciones) más una cohorte
histórica determinista de ~120 leads solo para analítica; nuevo interruptor
`{ fallaAnalitica }`.

Verificado con `USE_MOCKS=true` (segunda instancia en el 3001, ya apagada):
`/api/mocktest` con cada filtro, vacío, rango al revés (local) y días
30/90/180/0; en pantalla, filtros de operación + agente por formulario y de
propiedad y fechas por URL (renderizado ya en el servidor), rango al revés
frenado en el formulario y en la URL, vacío, motivos cambiando sin tocar la
URL, error y reintento en los dos bloques, y rol `AGENT` sin enlace ni
llamadas. `tsc` y `eslint` limpios. Contra el API real (servidor del 3000):
el demo es `AGENT` y `/analytics/funnel` da 403; `/lost-reasons` responde.

Pendiente: el filtro por agente depende de `GET /agents` (bloqueo 7). Ojo al
probar: dos `next dev` en el mismo repo comparten `.next` y al recompilar se
pisan los manifiestos (404/500 raros); usar uno a la vez.

## 2026-09-27 — Exportar el embudo en CSV y PDF (HU-17 AC3)

**Hecho.** `crearPedir` devuelve ahora `{ pedir, pedirTexto }`
(`Transporte`) y `crearApi` recibe los dos; `pedirTexto` comparte con
`pedir` el envío y la traducción de errores, sin zod. `api.embudoCsv()`
pide `format=csv` y rechaza el rango al revés como `embudo()`. El proxy
reenvía `Content-Disposition`. Mock: `embudoCsvMock` arma el CSV como el
back. `features/embudo/components/ExportarEmbudo.tsx` (botones CSV y PDF
junto al título) y `features/embudo/pdf.ts` (jspdf + jspdf-autotable,
cargado con `import()` al hacer clic). `nombreArchivoEmbudo()` en
`claves.ts`; `diaLargo()` y `fechaHoraConAnio()` en `lib/format.ts`.
`useEmbudo` acepta `enabled`. Dependencias nuevas con versión fija:
`jspdf@4.2.1`, `jspdf-autotable@5.0.8` (en CLAUDE.md).

Decidido: el formato del CSV, el redondeo y el eco de `filters` se leyeron
en el código del back (el repo del API es público), no en /openapi.json.
Eso corrigió el mock de la tarea anterior: redondeaba a 1 decimal (el back
usa 2, mitad hacia arriba) y devolvía en `filters` cualquier parámetro. El
nombre del archivo lo arma el front con el rango
(`embudo_2026-09-01_2026-09-30.csv`, `embudo_todo.pdf`…), no el
`funnel.csv` del back. El PDF usa el JSON en caché de `useEmbudo`; los
filtros salen de `filters` de la respuesta, con nombres de agente y
propiedad cuando se conocen. El API no expone el nombre de la agencia: el
PDF pone quién lo generó y el id de la agencia. Los botones se deshabilitan
con el embudo cargando o en placeholder, sin leads, con error o con el
rango al revés.

Verificado con `USE_MOCKS=true` en una copia del repo (para no pisar el
`.next` del servidor del 3000; ya borrada): CSV fila por fila igual a la
tabla de la pantalla, con `\r\n` y el nombre con el rango; texto del PDF
(título, fecha en Bogotá, filtros, mayor caída, tabla y perdidos) igual a la
pantalla, en WinAnsi ("•" y "—" bien codificados); una descarga por clic;
botones apagados con vacío y rango al revés; error del CSV con
`{ fallaAnalitica: "red" }` y se limpia al reintentar. `tsc`, `eslint` y
`next build` limpios; `/embudo` queda en 4,9 kB (jspdf fuera del bundle).

Pendiente: el estado "cargando" de los botones al cambiar de filtro casi no
se ve con mocks (la página llega ya hidratada). No se pudo mirar el PDF
renderizado en el panel del navegador (el visor no pinta blobs); se revisó
su contenido y codificación.

## 2026-09-27 — Cierre de HU-08 y HU-17 (estructura), prueba contra el API real

**Hecho.** Con `USE_MOCKS=false` y solo lecturas (no se reasignó ningún
lead): `/embudo` con rango, operación y agente, y `format=csv`, dan 403
`"This action requires the TEAM_ADMIN role"` porque el agente demo es
`AGENT`; la pantalla muestra el aviso de "solo administradores" y la consola
queda limpia. `GET /agents` y `GET /agents?active=true` dan 404 por el proxy
y la ruta sigue fuera de `/openapi.json`. `GET /analytics/lost-reasons?days=90`
respondió con datos reales (6 motivos, `pct` con 2 decimales) y pasa por
`LostReasonStatSchema`. `/tablero` carga con datos reales y sin errores.

Decidido: no se tocó `FunnelSchema`. Sin token admin no hay respuesta real
con qué compararlo; se volvió a comparar con `FunnelOut`/`FunnelStageOut` de
`/openapi.json` y coinciden. La checklist "Cuando exista GET /agents" quedó en
`docs/SPRINT_LINEA2.md`, bloqueo 7.

Pendiente: ver el embudo y el CSV reales con un `TEAM_ADMIN` (login de la
etapa 2 o un demo admin en `.env.local`). El estado "pendiente" de
`useAgentes()` solo se ha visto con mocks: con el demo `AGENT` ninguna
pantalla pide `/agents` (todo está detrás de `useEsAdmin()`). Con un admin,
Chrome anotará el 404 como "Failed to load resource" en la consola; eso lo
hace el navegador, no la app.

## 2026-09-28 — Fix: error de hidratación por "Actualizando…" en el tablero

**Hecho.** `TableroLeads` (tablero y lista de cerrados) mostraba
`{isFetching && <span>Actualizando…</span>}`. Si el navegador hidrataba
después de los 30 s de `staleTime` (compilación lenta en dev, pestaña
oculta), useQuery releía al montar, `isFetching` era true en el primer render
del cliente y false en el servidor, y React fallaba la hidratación por ese
`<span>`. Ahora el indicador es `useHidratado() && isFetching`; `ListaCerrados`
recibe `actualizando` en vez de `isFetching`.

Decidido: `useHidratado` con `useSyncExternalStore` (servidor `false`,
cliente `true`) en vez de un `useEffect`, para que en navegaciones del lado
del cliente el indicador salga desde el primer render. Vive dentro de
`TableroLeads.tsx` porque es el único usuario. Se revisaron los demás
`isFetching`: `Embudo.tsx` y `MotivosPerdida.tsx` solo lo usan dentro de la
rama de error, que nunca aparece en el primer render (TanStack no deshidrata
consultas con error), así que no necesitan cambio.

Pendiente: nada. No se reprodujo el error en el navegador (hay que hidratar
pasados 30 s); verificado con `tsc` y `lint`.

## 2026-09-28 — `GET /agents` real (HU-08, HU-17): fin del bloqueo 7

**Hecho.** Verificado en `/openapi.json` desplegado que `GET /agents` existe
(PR #20 del back) y leído `app/routers/agents.py`, `app/services/agent.py` y
`reassign` en `app/services/lead.py`. Forma real `list[AgentListItem]`
(`id, agency_id, role, active, full_name`), **sin email**, con `AI_AGENT`
solo si `include_bots=true` o `role=AI_AGENT`, `limit` ≤ 200 (default 100),
`offset`, y `agency_id` ajena → 404. Nuevo `AgentListItemSchema` en
`lib/schemas.ts` (`AgentSchema` sigue siendo el de `/me`); `api.agentes()`
acepta `active`, `role`, `include_bots`, `limit`, `offset`. `useAgentes()` ya
no traduce el 404: `EstadoAgentes` queda en disponible | cargando | error.
Fuera la rama "pendiente" de `SelectorAgente` y `ModalReasignar` y los
comentarios en `NombreAgente`, `TarjetaLead`, `FiltrosTablero` y
`FiltrosEmbudo`; `nombreAgente()` usa solo `full_name`. Mock con la forma
exacta, un bot (`AGENT_ID_BOT`) y los filtros y el 404 del back; reasignar
al bot da 409 como en el back. Fuera el interruptor `{ sinAgentes }`. Casos
nuevos en `/api/mocktest`. Contrato: entrada en §3, 409 del bot, §3 bis y la
fila del 404 de §4 borradas. Bloqueo 7 marcado como resuelto.

Decidido: "pendiente" desaparece: la ruta existe y el único 404 posible es
el de `agency_id`, que el front no manda, así que si llega es un error real.
`useAgentes()` pide `limit=200` (el default del API es 100) para no perder
dueños en una agencia grande; sin bots, porque no pueden ser dueños.

Verificado: `tsc`, `eslint` y `next build` limpios. Con `USE_MOCKS=true`
(restaurado): casos de `/api/mocktest` (con y sin bots, `role`, paginación,
409 al bot) y selector de `/tablero` con los 4 humanos. Con `USE_MOCKS=false`
y el agente de `.env.local` ya `TEAM_ADMIN` (`GET /me`): `GET /agents` real
trae 8 agentes con exactamente las 5 claves de `AgentListItem`, todos con
nombre; `/tablero` muestra el selector poblado y el dueño en cada tarjeta;
`?agente=` filtra (5 leads de Alfonso Vargas) y sobrevive a recargar;
`/embudo` carga datos reales por primera vez, y el filtro por agente viaja
como `agent_id` (240 interesados vs 1589 sin filtro) y se cambia desde el
formulario. Sin errores de zod en consola. Reasignación en vivo, confirmada
por el usuario, sobre el lead de prueba "Smoke Test User"
(`5311d3b9-…`, de Yuli Rangel Cuéllar; ninguno de los 22 leads del demo
parecía de prueba): desde el modal, que no ofrece a la dueña actual, pasó al
demo (API, "A cargo de" y `GET /leads?agent_id=` lo reflejan); reasignarlo
otra vez al mismo dueño dio 409 `"Lead is already assigned to that agent"`;
y desde el modal volvió a Yuli, en INTERESTED como estaba. Quedan dos filas
en `assignment_audit`. El mock ahora usa los `detail` reales del 404 y el
409.

Pendiente: el 409 de reasignar muestra el `detail` del API tal cual, en
inglés (`mensajeErrorReasignar`); falta traducir los tres casos conocidos.
El 403 no se pudo ver en vivo (el token es admin). CSV y PDF con nombre de
agente no se descargaron en esta prueba. El error de hidratación de
`TableroLeads` visto en esta prueba ya está arreglado (entrada anterior).

## 2026-10-13 — Tarea 2.13: esquemas, cliente y mocks de at-risk y tareas (E3, bloque A)

**Hecho.** `lib/schemas.ts`: `CreateTaskBody` (`due_at`, `note` ≤ 1000) y
`PatchTaskBody`, que replica el `model_validator` de `TaskPatch` (al menos
uno de `status`, `due_at`, `note` distinto de `null`). `lib/homelitics-nucleo.ts`:
`api.leadsEnRiesgo({ hours, limit })` (`hours` obligatorio en el tipo y
validado 1–8760, `limit` 1–500, `z.array(LeadSchema)`), `api.crearTarea` y
`api.actualizarTarea`; los tres validan antes de enviar con un helper nuevo,
`validarAntes`, y fallan como `HomeliticsError("invalido", 422)` sin llamar
al API. `lib/mock/`: `GET /leads/at-risk`, `POST /leads/{id}/tasks` y
`PATCH /leads/{id}/tasks/{task_id}`. 24 casos nuevos en `/api/mocktest`.
`docs/API_CONTRACT.md`: la sección de at-risk ya no está vacía y la de
tareas lleva lo confirmado.

Verificado contra `/openapi.json` y contra el código del API
(`routers/leads.py`, `services/lead.py`, `app/schemas.py`, `config.py` en
`main`): `hours` 1–8760 o null, default `INACTIVITY_HOURS=72`; `limit`
1–500, default 100; responde `list[LeadOut]`; filtra por `agency_id`.
Hallazgos que no estaban en el plan: un `created_by` nulo cuenta como
respuesta humana (outer join contra `agents`); la tarea nace a nombre del
dueño del lead, no de quien la crea; el `POST` no rechaza fechas pasadas;
un `null` en el `PATCH` es "no tocar" (no se puede borrar una nota); y el
422 del `PATCH` vacío sale antes que el 404 del lead.

**Decisiones:**

- El mock de at-risk cuenta desde `Date.now()`, como el API, y no desde un
  "hoy" fijo como la analítica: así un `MESSAGE` saliente registrado en la
  sesión saca al lead del riesgo (lo que prueba 2.23). Para que la ventana
  de 24 h tenga casos de borde estables se agregaron, fechados respecto al
  arranque: un lead nuevo (`LEAD_ID_RECIENTE`, Tomás Echeverri, de Paula,
  creado hace 2 h), una llamada humana hace 6 h a `LEAD_ID_ATENDIDO` y un
  mensaje del bot hace 3 h a `LEAD_ID_SOLO_BOT`. `LEAD_ID_SOLO_NOTA` ya
  existía (solo tiene una `NOTE` saliente). El tablero pasa de 14 a 15
  tarjetas y el embudo cuenta un lead más.
- El 422 del `PATCH` vacío en el mock lleva el `msg` exacto de Pydantic
  (`"Value error, provide at least one of: status, due_at, note"`), que es
  lo que deja `traducirError` de un 422 real. El cliente lo frena antes con
  un mensaje en español, así que en `/api/mocktest` el caso del mock se
  prueba llamando a `resolverMock` directo. `probar()` ahora muestra también
  el `status`.

Resultados con `USE_MOCKS=true` (restaurado a `false` después): a 24 h, 8
leads en riesgo de los cuatro humanos (demo 3, Paula 3, Andrés 1, inactivo
1), con el reciente y el atendido fuera y el del bot y el de la nota dentro;
a 1 h, 10 (entran los dos); a 8760 h, ninguno; `limit: 3` devuelve los tres
más viejos en orden; `hours` 0 o 9000 y `limit` 501 se frenan en el cliente;
sin `hours` el mock usa 72. Una nota saliente no saca al lead del riesgo y un
mensaje sí. Tareas: crear, posponer, marcar hecha, 422 por nota larga,
fecha mala, `PATCH` vacío o todo `null`, 404 por lead o tarea ajena. El
tablero sigue cargando con la tarjeta nueva. `tsc`, `eslint` y `next build`
limpios.

Pendiente: nada se probó contra el API real (sin pantallas en esta tarea;
el plan lo deja para el día 3, con `hours` bajo). El error de zod de una
fecha mal formada sale en inglés (`Invalid ISO datetime`): lo frenará el
formulario de 2.19.

## 2026-10-13 — Tarea 2.14: umbral de horas en cookie (E3, bloque A)

**Hecho.** `lib/umbral.ts`: cookie `umbral_horas`, por defecto 24, validada
con zod (`UmbralSchema`, entero 1–8760, el mismo rango que `hours` en
`at-risk`). `normalizarUmbral()` lleva cualquier valor a uno válido (lo
inválido vuelve a 24 sin romper nada) y `leerUmbral()` lo lee en Server
Components con `cookies()`. `lib/umbral-navegador.ts`: `useUmbral(inicial?)`
devuelve `[umbral, cambiar]`; `cambiar` valida, escribe la cookie (`Path=/`,
un año, `SameSite=Lax`, sin `httpOnly` porque la escribe el cliente y solo
lleva un número), avisa a los demás `useUmbral()` montados y hace
`router.refresh()`. `features/riesgo/components/SelectorUmbral.tsx`: 12 / 24 /
48 / 72 h y "Otro" con un campo numérico que frena fuera de rango con su
propio mensaje. Todavía no está montado en ninguna pantalla: lo montan 2.16 y
2.17. El comentario de cabecera deja dicho que es provisional hasta la
migración 012 (bloqueo 8).

**Decidido.** Dos archivos y no uno, como `lib/homelitics.ts` /
`lib/homelitics-navegador.ts`: con todo en `lib/umbral.ts`, `next build`
falla en cuanto una página servidor lo importa ("You're importing a component
that needs `useRouter`… / `useSyncExternalStore`"), aunque el hook nunca se
llame ahí. `next/headers` entra con `import()` dentro de `leerUmbral()`, así
la mitad navegador importa constantes y validación de `lib/umbral.ts` sin
arrastrarlo (el build lo acepta). Al llegar la 012 se tocan esos dos archivos
y ninguna pantalla. El valor del cliente sale de `useSyncExternalStore`
sobre `document.cookie`; en el render del servidor usa `inicial`, que la
página debe sacar de `leerUmbral()` para no parpadear de 24 al valor real al
hidratar.

**Probado** con una página temporal (`/prueba-umbral`, ya borrada) que leía
`leerUmbral()` y montaba el selector: cookie `abc` → 24 en servidor y
cliente; clic en 48 h → cookie escrita y el servidor lee 48 tras el
`refresh`; recargar lo conserva; "Otro" con 9000 se frena con el mensaje y
con 36 queda 36 en los dos lados. Sin avisos de hidratación en consola.
`tsc`, `eslint` y `next build` limpios (con la página temporal y sin ella).

Pendiente: el criterio de "done" completo ("cambiar el umbral en una
pantalla lo cambia en el tablero, el header y el reporte"; "nunca sale una
petición a `at-risk` sin `hours`") solo se puede comprobar cuando 2.15–2.17
lean de aquí. El tipo de `api.leadsEnRiesgo` ya exige `hours` desde 2.13.

## 2026-10-13 — Tarea 2.15: resaltado de leads en riesgo en el tablero (HU-10 AC3)

**Hecho.** `features/riesgo/claves.ts`: `claveRiesgo(horas)` =
`["leads", "riesgo", horas]`, `PREFIJO_RIESGO` y `queryRiesgo(horas)`, que
siempre manda `hours` y `limit: 500`. `features/riesgo/hooks.ts`:
`useLeadsEnRiesgo(horas, { enabled })`. `tablero/page.tsx` lee el umbral con
`leerUmbral()` y siembra GET /leads/at-risk en el mismo QueryClient que el
tablero (no en la vista de cerrados ni con un rango al revés). `TableroLeads`
toma el umbral con `useUmbral(umbral)`, arma un `Set` de ids y se lo pasa a
cada `TarjetaLead` como `enRiesgo`: borde y anillo rojos **y** la etiqueta
"Sin respuesta hace más de {umbral} h" con un ícono de reloj (no solo color).
El resumen de arriba suma "N sin respuesta hace más de X h". Si la consulta
de riesgo falla, una línea gris lo dice ("…el tablero se muestra sin ese
resaltado", o "…puede estar desactualizado" si había un dato anterior) y el
tablero sigue igual. "Actualizando…" cuenta también la consulta de riesgo,
detrás del mismo `useHidratado()`.

Invalidan `PREFIJO_RIESGO` (todos los umbrales): `useMoverLead` en
`onSettled` (mover etapa, ganado y perdido, desde el tablero y desde
`EtapaLead`), `useReasignarLead` al terminar bien (cambia el `agent_id`, que
es lo que cuentan el header y el reporte) y la nota de `HistorialLead`.

**Decidido.** La invalidación de riesgo en `useMoverLead` va siempre, no solo
en el último movimiento en vuelo como la del tablero: el riesgo no tiene
cambio optimista que una relectura temprana pueda pisar. La nota invalida
aunque hoy una `NOTE` no saca al lead de at-risk (solo `MESSAGE`/`CALL`):
es el único sitio que registra interacciones y deja la key lista para 2.23.

**Probado** con `USE_MOCKS=true` (servidor temporal en el puerto 3001, sin
tocar `.env.local`): a 24 h salen en rojo 9 de 11 tarjetas, fuera
`LEAD_ID_RECIENTE` y `LEAD_ID_ATENDIDO`, como dice el mock; el HTML del
servidor ya trae las 9 etiquetas. Marcar como perdido una tarjeta roja (por
teclado) la saca y deja 8; la key `["leads","riesgo",24]` se relee en ese
momento y ya no trae el lead. Mover otra entre etapas abiertas también la
relee y la tarjeta sigue roja. Forzando el error de la query aparece la línea
y el tablero queda sin resaltar. Con la cookie en 1 h salen las 11 y la
etiqueta dice "1 h". Sin errores ni avisos de hidratación en consola.
`tsc`, `eslint` y `next build` limpios.

Pendiente: reasignar y la nota no se probaron en el navegador (solo el
código). `?riesgo=1` y el conteo del header son de 2.16.


## 2026-10-13 — Tarea 2.16: aviso de leads en riesgo en el header (HU-10 AC2)

`features/riesgo/components/AlertaRiesgo.tsx`, montado al final del `<nav>`
de `app/(agente)/layout.tsx`, que ahora lee `leerUmbral()` y se lo pasa.
"N leads sin respuesta" en rojo; con 0, mientras carga, si la consulta
falla o si GET /me falló, no se dibuja nada. Un `TEAM_ADMIN` cuenta todo
lo que devuelve at-risk; un `AGENT` solo `agent_id === me.id`.
`useLeadsEnRiesgo` acepta ahora `refetchInterval` (5 min) y
`refetchOnWindowFocus`; como la key es la misma, esas relecturas refrescan
también el resaltado del tablero.

Tablero: `?riesgo=1` en `FiltrosTablero` (claves.ts). Lo lee `leerFiltros`
(se descarta en la vista de cerrados), no viaja al API y **no entra en la
query key** (`claveLeadsTablero` lo quita): ponerlo o quitarlo no vuelve a
pedir GET /leads. `TableroLeads` deja solo las tarjetas en riesgo; mientras
no se sabe cuáles son dice "Buscando…" y, si la consulta falló sin dato
anterior, pide quitar el filtro en vez de mostrar un tablero vacío.
`FiltrosTablero` monta el `SelectorUmbral` de 2.14 y una casilla "Ver solo
los que llevan más de N h sin respuesta", **fuera del `<form>`**: el
selector trae su propio formulario para "Otro" y un form no puede ir dentro
de otro. Los dos se aplican al instante. "Quitar los filtros" quita también
`riesgo`; "Ver perdidos" lo suelta. `useHidratado()` salió de
`TableroLeads` a `lib/hidratado.ts` para compartirlo.

**Decidido.**
- El enlace del `AGENT` es `/tablero?riesgo=1&agente=<su id>`, no solo
  `?riesgo=1`: el tablero le muestra la agencia entera, y sin `agente` las
  tarjetas rojas no serían sus N. Como el agente no ve el selector de
  agente, una línea en los filtros dice "Estás viendo solo tus leads".
- El admin enlaza por ahora a `/tablero?riesgo=1`, con `TODO(2.17)` para
  `/riesgo`.
- **Bug encontrado y corregido en la prueba:** el `useQuery` del header
  corría en el render del servidor y creaba la key de riesgo vacía *antes*
  que el `HydrationBoundary` del tablero (el layout va primero). Al hallarla
  ya creada, `HydrationBoundary` deja la siembra para un efecto que en el
  servidor no corre: el HTML salía sin tarjetas rojas y la hidratación
  fallaba. Ahora `AlertaRiesgo` revisa `useHidratado()` y el agente, y el
  `useQuery` vive en un hijo (`Contador`) que solo se monta después.
  Regla: un componente del layout no puede llamar `useQuery` en el render
  del servidor con una key que siembre una página.

**Probado con mocks** (servidor temporal en el 3001): admin, 24 h → header
9, tablero 9 de 11 en rojo; el enlace abre `?riesgo=1` con 9 tarjetas y la
casilla marcada, y sobrevive a recargar. Umbral 1 h desde el selector →
header 11 y 11 tarjetas, sin recargar. Desmarcar la casilla vuelve a
`/tablero`. Con el rol del mock cambiado a `AGENT` (revertido después):
header 4, enlace con `&agente=`, tablero con 4 tarjetas, todas rojas, y la
línea "Estás viendo solo tus leads". Sin errores de hidratación.

**Probado contra el API real** (`USE_MOCKS=false`, umbral 1 h, agente demo
`TEAM_ADMIN`): **60 leads en riesgo**. Header "60 leads sin respuesta";
el tablero tiene 60 leads abiertos y los 60 salen en rojo; `?riesgo=1`
deja los 60. `tsc`, `eslint` y `next build` limpios (el build en una copia
temporal para no pisar el `.next` de un `next dev` que corría en el 3000).

Pendiente: probar el rol `AGENT` contra el API real (falta un agente demo
con ese rol, bloqueo 14). Si at-risk llega a 500 el header no lo avisa;
eso lo cubre el reporte (2.18).

## 2026-10-13 — Tarea 2.17: leads en riesgo por agente (HU-13 AC1)

Hecho: ruta `app/(agente)/riesgo/` (`page.tsx` + `loading.tsx`) con el
mismo control que `/embudo`: si GET /me dice `AGENT`, la página pinta "Esta
vista es solo para administradores del equipo" y no siembra nada. Enlace
"Leads en riesgo" en el nav, solo para admin. El aviso del header (2.16)
ahora lleva al admin a `/riesgo` (se quitó el `TODO(2.17)`); el del agente
sigue yendo a `/tablero?riesgo=1&agente=`.

- `features/riesgo/agrupar.ts`, puro y sin runtime: `agruparPorAgente`
  (de más a menos leads; empate por lead más antiguo y luego por id, para que
  el orden no salte entre relecturas; los leads de cada grupo del más viejo
  al más nuevo), `indexarListings` y `etiquetaListing`. Se usa como `select`
  en `useRiesgoPorAgente(horas)`, con la misma key que `useLeadsEnRiesgo`:
  el header, el tablero y el reporte comparten una sola petición.
- **Propiedad: GET /listings, no `usePropiedades()`.** Ese hook agrupa por
  `property_id` y pierde el `listing_id`, que es lo que trae `LeadOut`.
  `useListingsPorId()` usa la misma key y petición (`clavePropiedades()`)
  con otro `select`, así que no cuesta otra llamada. Un listing que no
  aparece (pide 200) dice "Publicación fuera del listado"; ninguno de los
  60 reales cayó ahí.
- Lo que falta se escribe, no se inventa: el cliente sale como el final de
  su `client_id` (como el detalle del lead, bloqueo 12) con una línea bajo la
  tabla que lo explica; un agente que no está en GET /agents dice "Agente
  fuera de la lista" con el final del id, y si /agents falla, "Nombre no
  disponible". No se usó `NombreAgente` tal cual porque devuelve `null` y la
  celda quedaría vacía.
- Estados: carga (con la nota del minuto del API dormido), error con
  "Intentar de nuevo", vacío "Nadie tiene leads en riesgo con este umbral" y
  `SelectorUmbral` arriba. Cambiar el umbral deja la tabla anterior atenuada
  (`keepPreviousData`) hasta que llega la nueva.
- **Hidratación:** con `loading.tsx` la página es un Suspense aparte y el
  header hidrata primero. El `Contador` de `AlertaRiesgo` alcanza a crear la
  key de riesgo (pendiente) antes que el `HydrationBoundary` de la página,
  que entonces deja la siembra para un efecto: el servidor pintaba la tabla
  y el navegador "Cargando" (error de hidratación reproducido con mocks).
  `ReporteRiesgo` ahora pinta "Cargando" hasta `useHidratado()`, también en
  el servidor; los datos sembrados aparecen un render después, sin otra
  petición. Tres recargas seguidas sin errores.

**Probado con mocks** (dev en el 3001): admin, 24 h → "9 leads … de 4
agentes", Hernando Carrillo 4, Paula Gómez 3, Carlos Úsuga 1 (inactivo, con
nombre), Andrés Montoya 1; desplegar muestra dirección, operación, etapa,
fecha en Bogotá y enlace. 72 h → 9; "Otro" 8760 h → "Nadie tiene leads en
riesgo con este umbral". Con el rol del mock en `AGENT` (revertido): el
aviso de solo administradores, sin enlace en el nav. `agruparPorAgente`
probado aparte con `node --experimental-strip-types` (vacío, empate por
antigüedad, orden interno, offsets de zona).

**Probado contra el API real** (`next build` + `next start` en una copia
temporal, puerto 3002, agente demo `TEAM_ADMIN`, umbral 1 h): 60 leads de 8
agentes, de 15 a 3, el header en "60 leads sin respuesta" con enlace a
`/riesgo`. Los 60 cruzan con un listing; "Abrir el lead" abre el lead
correcto (mismo cliente, dirección, etapa y agente). `tsc`, `eslint` y
`next build` limpios.

Pendiente:
- **El tablero tiene la misma carrera de hidratación** (también tiene
  `loading.tsx` y siembra la key de riesgo). En esta prueba no saltó, pero
  depende del orden en que hidraten header y página. No se tocó aquí (es de
  2.15/2.16); la salida de fondo sería sembrar la key de riesgo en el layout
  o que el header no cree la key antes que la página.
- Sin aviso de los 500 de at-risk ni filtros ni exportación: es 2.18.
- `AGENT` contra el API real sigue sin probarse (bloqueo 14).

## 2026-10-20 — Tarea 2.18: filtros y exportación del reporte de riesgo (HU-13 AC2, AC3)

Hecho:
- `/riesgo` lee `?desde&hasta&propiedad` (`leerFiltrosRiesgo` en
  `features/riesgo/claves.ts`, con `leerDia` de `lib/filtros-url.ts`).
  `FiltrosRiesgo` copia la mecánica de `FiltrosEmbudo`: la URL manda,
  `router.replace` al enviar, un rango al revés se frena en el formulario.
  Si llega al revés por la URL, la pantalla lo avisa y muestra el reporte
  sin filtrar.
- Los filtros no van en la key ni en la query (at-risk no filtra, bloqueo
  10): `useRiesgoPorAgente(horas, filtros)` los aplica en el `select` con
  `armarReporte` (`features/riesgo/agrupar.ts`) antes de agrupar. La fecha
  es el día de `created_at` en hora de Bogotá (`diaLocal`); la propiedad sale
  de cruzar `listing_id` con GET /listings (`property_id`). Cambiar de
  filtro no pide nada al API.
- Aviso de los 500 (`incompleto`, se calcula sobre la lista sin filtrar) en
  la pantalla, en el CSV (línea "Aviso:" arriba de la cabecera) y en el PDF
  (en rojo, antes de las tablas).
- `ExportarRiesgo`: CSV armado en el navegador (`csvRiesgo` en
  `features/riesgo/exportar.ts`, Blob con BOM UTF-8) y PDF con jspdf +
  jspdf-autotable cargados con `import("../pdf")` al hacer clic (`/riesgo`
  pesa 6,7 kB en el build). El PDF trae el resumen por agente y luego el
  detalle. Nombre del archivo con umbral y filtros:
  `riesgo_24h_desde_2026-08-01_propiedad-a10a1000.csv`.
- `descargar()` pasó de `ExportarEmbudo` a `lib/descargar.ts` y la usan los
  dos.

Decidido:
- **Días sin respuesta = días desde `created_at`, rotulado "(máximo)"**, con
  una nota en los dos archivos. `LeadOut` no trae la última respuesta y no
  hay cómo calcularla sin pedir las interacciones de cada lead. Queda como
  **bloqueo 15** en `docs/SPRINT_E3_LINEA2.md`.
- **CSV con `;`**: es el separador de listas de Excel con la configuración
  regional es-CO (confirmado en este equipo); con `,` Excel lo abre en una
  sola columna. El CSV del embudo lo arma el back con `,` y no se tocó.
- Con filtro por propiedad, un lead cuya publicación no está en GET
  /listings (pide 200) queda fuera y se cuenta aparte ("N leads quedaron
  fuera del filtro por propiedad"), en pantalla y en los archivos.
- Exportar se deshabilita mientras carga, sin leads o con el rango al revés.

**Probado con mocks** (dev en el 3001, ya apagado): 24 h sin filtros → 9
leads de 4 agentes; `?desde=2026-08-20&hasta=2026-09-20` → 7 de 3; rango al
revés por URL → aviso y 9 sin filtrar; rango al revés en el formulario →
"La fecha inicial no puede ser posterior a la final." y la URL no cambia;
propiedad Circular 73B → 3 de 2. Descargados y abiertos los dos archivos:
el CSV empieza con `EF BB BF` y Excel (es-CO) lo abre en cinco columnas
con tildes bien; el PDF trae filtros en español, resumen y detalle. Para el
aviso de los 500 se bajó `LIMITE_RIESGO` a 9 un momento (revertido): aviso
ámbar en pantalla, línea "Aviso: Puede estar incompleto…" en el CSV y en
rojo en el PDF. Sin errores en consola. `tsc`, `eslint` y `next build`
limpios.

Pendiente:
- Sin probar contra el API real.
- El filtro por propiedad depende de que la publicación esté entre las 200
  de GET /listings.

## 2026-10-20 — Tarea 2.19: panel de seguimiento del lead (HU-11 AC1)

Hecho:
- `features/seguimiento/`: `PanelSeguimiento` (Client Component), `hooks.ts`
  (`useCrearRecordatorio`, `useAhora`, `mensajeErrorRecordatorio`) y
  `recordatorio.ts` (lo puro: orden, vencido, conversión Bogotá → UTC con
  `fromZonedTime`, atajos).
- Montado en `app/(agente)/leads/[leadId]/page.tsx` al lado del historial
  (`lg:` dos columnas, panel de 20rem); en pantallas angostas va debajo. El
  contenedor pasó de `max-w-3xl` a `max-w-5xl` para que quepan los dos.
- Lista: PENDING y SNOOZED arriba por `due_at`; DONE en un `<details>`
  "Hechos (N)". Abiertas con `due_at` pasado: borde rojo y etiqueta
  "Vencido" con texto.
- Formulario "Nuevo recordatorio": fecha y hora (hora de Bogotá), atajos
  "En 1 día / 3 días / 1 semana" (misma hora de ahora, N días después),
  nota opcional con contador `n/1000` y botón "Guardar recordatorio". Una
  fecha pasada muestra "Esa fecha ya pasó…" y deshabilita el botón; al
  enviar se vuelve a revisar contra el reloj. Al crear: POST
  /leads/{id}/tasks e invalidación de `claveTareasLead`, así que aparece
  también en la línea de tiempo.

Decidido:
- **SNOOZED vencida también lleva "Vencido"**: pospuesta a una fecha que ya
  llegó está tan vencida como una pendiente.
- **"Ahora" sale del servidor** (`ahoraInicial`) y se renueva cada minuto
  con `useAhora`: con `new Date()` en el render, una tarea que vence entre
  el HTML y la hidratación rompe la hidratación. Con la página abierta, un
  recordatorio pasa a "Vencido" sin recargar (como mucho un minuto tarde).
- Hechas ordenadas por `due_at` descendente: el API no dice cuándo se
  marcaron.
- No optimista: el formulario espera al 201 y se limpia solo si se guardó.
- Las tareas del sistema (first-touch, barrido) salen mezcladas, sin intentar
  distinguirlas por la nota (bloqueo 11).

**Probado con mocks:** lead de Laura (`LEAD_ID`): la tarea semilla sale
"Vencido"; fecha de ayer → aviso y botón deshabilitado; "En 3 días" + nota →
aparece en el panel y en la línea de tiempo. Tras `/api/mocktest` (que deja
`TASK_ID` en DONE) sale "Hechos (1)" tachada. En 375 px el panel queda debajo
del historial.

**Probado en vivo** sobre "Smoke Test User" (`5311d3b9-ca51-452e-bdd4-5af35338d51e`):
su tarea "Auto-raised: first-touch follow-up for a new lead." (16 sep) sale
"Vencido". Con "En 1 día" y la nota "Prueba 2.19: llamar para confirmar el
interés en la visita" → POST 201 y GET de tareas 200; aparece en el panel y
en el historial. Guardado `due_at = 2026-10-21T18:02:00Z` = 13:02 de Bogotá,
lo que mostraba el formulario. Esa tarea queda PENDING en el lead de prueba
(se puede cerrar con 2.20). `tsc`, `eslint` y `next build` limpios
(`/leads/[leadId]` 7,17 kB).

Pendiente:
- Posponer y "Hecho" son la 2.20.
- En 375 px la página se desborda unos 23 px por la píldora "N leads sin
  respuesta" del header (2.16), no por este panel.
- Ojo para pruebas: con mocks, un `fetch` a `/api/homelitics/*` desde la
  consola va al API real (los mocks del navegador no pasan por el proxy).
  Una prueba así dio un 404 inofensivo contra el API con un id de mock.

## 2026-10-20 — Tarea 2.20: posponer y marcar hecha una tarea (HU-11 AC3)

Hecho:
- `useActualizarTarea` en `features/seguimiento/hooks.ts`, con la misma
  forma que `useMoverLead` (2.10): onMutate cancela la lectura de
  `claveTareasLead`, guarda la foto de la tarea y aplica el cambio; onError
  devuelve esa tarea (solo esa) y avisa con `alFallar`; onSettled relee
  cuando termina el último PATCH en vuelo. El cuerpo pasa por
  `PatchTaskBody` dentro de `api.actualizarTarea`.
- En el panel, cada PENDING/SNOOZED tiene "Posponer" (1 día, 3 días, "Elegir
  fecha" con fecha y hora de Bogotá, que no deja una fecha pasada) y
  "Hecho". Las DONE no tienen acciones. Los botones de una tarea se congelan
  mientras su PATCH está en vuelo (`useTareasCambiando`).
- `mensajeErrorTarea` traduce cada `kind` a español y nunca muestra el
  `detail` del API. El error queda en la fila de esa tarea y se borra con la
  siguiente acción sobre ella.

Decidido:
- Posponer cuenta desde ahora, no desde el `due_at` viejo
  (`posponerDesdeAhora` en `recordatorio.ts`): a una tarea vencida hace una
  semana, "1 día" sobre la fecha vieja la dejaría todavía vencida. Al minuto,
  como el formulario de 2.19.
- Errores por tarea (un `Record` por id) y no uno global: con dos PATCH en
  vuelo, el error de una no tapa el de otra.
- Como el panel y la línea de tiempo leen la misma key, el cambio optimista
  se ve en los dos ("Tarea · Pospuesta").

**Probado con mocks** (lead de Laura): con
`__homeliticsMock = { latenciaMs: 1500, falla: "red" }`, "1 día" muestra al
instante "Pospuesto" para el 21 oct 13:08 (mañana a esta hora, no el 17 sep)
y al fallar vuelve a "Vencido" del 16 sep con el mensaje de red. Con
`falla: "invalido"`, "Hecho" la pasa a "Hechos (1)" y vuelve. Sin falla:
"Elegir fecha" (precargada en mañana), "3 días" y "Hecho" quedan; en
"Hechos" no hay botones; una fecha de ayer avisa y deshabilita el botón.

**Probado en vivo** sobre el recordatorio de 2.19 en "Smoke Test User"
(tarea `39be6852-a290-489c-8c8b-0d039ad5343e`): "Posponer → 3 días" →
PATCH 200; tras recargar sale SNOOZED con `due_at = 2026-10-23T18:10:00Z`
(13:10 de Bogotá, tres días desde ahora y no desde su `due_at` del 21).
Luego "Hecho" → recargar la muestra en "Hechos (1)", sin acciones. Esa tarea
queda DONE. La "Auto-raised: first-touch" del 16 sep sigue PENDING, sin
tocar. `tsc`, `eslint` y `next build` limpios (`/leads/[leadId]` 8,28 kB).

De paso, `mensajeErrorRecordatorio` (2.19) ya no cae en `e.detail`: trata
los siete `kind` en español, como `mensajeErrorTarea`. Sin `default`, así
que un `kind` nuevo en `ErrorKind` hace fallar `tsc` en los dos.

## 2026-10-20 — Tarea 2.21: plantillas por etapa y `rellenar` (HU-12 AC1, AC2)

Hecho:
- `features/plantillas/plantillas.ts`: las cuatro plantillas base en es-CO
  (bienvenida, confirmación de visita, después de la visita, reactivación),
  cada una con `clave`, `titulo`, `texto` y `etapas`. `plantillaSugerida`
  da la primera para la etapa del lead: `INTERESTED` → bienvenida,
  `VISIT_SCHEDULED` → confirmación, `VISITED` → post-visita, `NEGOTIATING` y
  `LOST` → reactivación, `WON` → ninguna.
- `features/plantillas/rellenar.ts`: `rellenar(texto, contexto)` →
  `{ texto, faltantes }`, pura. Una variable sin dato (o vacía) queda como
  `[falta: <nombre legible>]` y sale una vez en `faltantes`
  (`{ variable, etiqueta }`). `construirContexto(lead, listing, citas,
  agente, ahora)` arma el contexto con lo que ya carga `/leads/[leadId]`.
- En `lib/format.ts`: `fechaLarga` (el día en Bogotá, sin hora) y
  `precioEnTexto`, que redondea al peso con `BigInt` sobre el string, sin
  `Number`.
- 12 casos en `/api/mocktest` (los primeros de la lista, con campo `pasa`),
  con datos fijos validados por los esquemas de zod. Todos pasan.

Decidido:
- Claves y variables tal como en la propuesta del back
  (`PROPOSAL_agency_bots_notifications.md` §3.3): `welcome`,
  `visit_confirmed`, `post_visit_feedback`, `re_engagement`; variables
  `{client_name}`, `{agent_name}`, `{listing_address}`, `{neighborhood}`,
  `{price}`, `{visit_date}`, `{visit_time}`. Las demás de §3.3
  (`{agency_name}`, `{calendar_link}`, `{slots}`…) no se usan: el front no
  tiene de dónde sacarlas en la página del lead.
- El contexto lleva los valores ya formateados (Bogotá, pesos);
  `rellenar` solo sustituye, en una pasada: un valor con llaves no se
  reinterpreta. Una variable que el front no conoce (un error de tipeo)
  también queda como `[falta: …]`, nunca se borra.
- La cita de referencia es la próxima que sigue en pie (no terminal, desde
  `ahora`); si no hay, la última `COMPLETED`. Una cita pasada que nadie
  cerró no cuenta: mejor faltante que una fecha vieja en una confirmación.
- `client_name` solo sale si llega una `LeadCard`; con `LeadOut` (lo que
  devuelve `GET /leads/{id}`) queda faltante (bloqueo 12). `agente` es el
  dueño del lead, no quien usa la app.

Pendiente:
- Sin pantalla: el selector y la vista previa son la 2.22, "Copiar / Ya lo
  envié" la 2.23. Falta decidir (a) o (b) de la edición persistente antes
  de 2.22.
- La página del lead no carga hoy el agente dueño: 2.22 tendrá que
  resolver `lead.agent_id` con `GET /agents` para `{agent_name}`.

`tsc`, `eslint` y `next build` limpios.

## 2026-10-20 — Tarea 2.22: responder con plantilla en el panel de seguimiento (HU-12 AC1)

Hecho:
- `features/plantillas/components/ResponderConPlantilla.tsx`, al final del
  `PanelSeguimiento`: sección "Responder con plantilla" con un selector de
  las cuatro plantillas (la sugerida para la etapa del lead va primero,
  marcada "Sugerida"; la sugerida sigue a la etapa porque el lead se lee del
  caché) y la vista previa ya rellenada (`rellenar` + `construirContexto` de
  2.21) en un `textarea` editable. Lo que el agente escribe ahí es solo de
  ese mensaje; "Deshacer mis cambios a este mensaje" lo regresa a la
  plantilla. Cambiar de plantilla descarta la edición.
- Si hay faltantes, un aviso arriba del `textarea` los lista. Si el agente
  reemplaza a mano un `[falta: …]`, ese faltante deja de avisarse.
- `{agent_name}` sale de `useAgentes()` con `lead.agent_id` (lo pendiente de
  2.21). El `listing` lo pasa la página por props al panel: ya lo traía.
- `features/plantillas/almacen.ts` (decisión (b)): "Editar la plantilla" abre
  un editor del texto **con variables** y "Guardar como mi plantilla" lo
  guarda; "Volver a la original" lo borra. El selector marca "tu versión".
- Probado en vivo contra el API (lead `5311d3b9…`, `INTERESTED`):
  bienvenida sugerida, `{client_name}` como faltante (bloqueo 12) y el
  nombre real de la agente; guardar, recargar (la versión propia sigue),
  volver a la original, JSON corrupto en `localStorage` (se ignora) y
  `setItem` que lanza (aviso en español, la pantalla sigue).

Decidido:
- **Opción (b)** de la nota "Edición persistente de las plantillas", que
  incluye la (a): edición por mensaje siempre, y además una versión propia
  por plantilla en `localStorage`. Todo acceso a `localStorage` vive en
  `almacen.ts`, dentro de try/catch; ese archivo es el que se reemplaza
  cuando exista la migración 012 (`agency_settings.bot.templates`). La
  pantalla dice que se guarda solo en este navegador.
- Lo guardado nunca es el mensaje rellenado sino el texto con variables, y
  por eso hay un editor aparte: no hay forma confiable de volver de un
  mensaje con datos del cliente a la plantilla. Se guarda una llave
  (`homelitics:plantillas:v1`) con `{ clave: texto }`; al leer se valida con
  zod, se ignoran claves desconocidas, textos vacíos o de más de 2000
  caracteres. Una variable mal escrita en la versión propia sale como
  faltante, igual que en 2.21.
- `useSyncExternalStore` con snapshot vacío en el servidor (no hay
  `localStorage` al renderizar), y escucha `storage` para que otra pestaña
  que guarda actualice esta.

Pendiente:
- "Copiar" y "Ya lo envié" (registro de la interacción): tarea 2.23.
- Mientras `GET /agents` carga (la primera vez, con el API despertando),
  `{agent_name}` se ve como faltante unos segundos.
- La versión propia es por navegador, no por agente ni por agencia, hasta la
  migración 012 (bloqueo 8).
- Nota de prueba: con el panel del navegador oculto la página no hidrata
  hasta que se dibuja; no es un error de la app.

`tsc`, `eslint` y `next build` limpios.

## 2026-10-20 — Tarea 2.23: copiar y "Ya lo envié" (HU-12 AC3, parcial)

Hecho: `features/plantillas/components/EnviarMensaje.tsx`, bajo el textarea
de 2.22, y `features/plantillas/hooks.ts` (`useRegistrarMensaje`,
`mensajeErrorRegistro`). Dos pasos: "Copiar mensaje"
(`navigator.clipboard.writeText`; si el navegador no deja, enfoca y
selecciona el textarea y le dice al agente que copie con Ctrl+C) y luego
"Ya lo envié" con un selector de canal (`Channel.options`, por defecto el
`source_channel` del lead, marcado "por donde llegó"). "Ya lo envié" hace
POST /leads/{id}/interactions con `OUTBOUND`/`MESSAGE`, el canal elegido y
el texto, por `CreateInteractionBody`. Con faltantes pide "¿Lo enviaste
así?" antes de registrar. Al registrar invalida `claveInteracciones`,
`PREFIJO_RIESGO` y `PREFIJO_TABLERO`. Una línea dice que el mensaje lo envía
el agente desde su canal y la app solo lo registra.

Decidido:
- "Ya lo envié" solo aparece si lo copiado es igual al mensaje que se ve. Si
  cambia después de copiar, hay que copiarlo otra vez: así lo registrado es
  lo que salió. Pasa también sin que el agente edite nada, cuando
  `GET /agents` llega tarde y rellena `{agent_name}`; el aviso lo dice.
- No es optimista: "Listo: quedó registrado" solo tras el 201. Después del
  registro vuelve al paso 1, para no registrar dos veces el mismo envío.
- Un mensaje de más de 4000 caracteres no deja copiar (el API lo rechazaría
  y no se podría registrar lo enviado).
- Etiquetas de canal propias del selector ("En la app", "Llamada"):
  `ETIQUETA_CANAL` de `TarjetaCita` está pensada para "por …".

**Probado en vivo** sobre "Smoke Test User" (`5311d3b9-…`) con umbral 1 h:
60 en riesgo, el lead entre ellos, header "60 leads sin respuesta".
Bienvenida sugerida; el panel del navegador negó el portapapeles, así que
salió el respaldo (texto seleccionado, 218 de 218 caracteres). Con
`[falta: nombre del cliente]`, "Ya lo envié" abrió la confirmación sin
mandar nada. Quité el marcador a mano (el aviso de faltantes se fue y "Ya lo
envié" se escondió hasta copiar otra vez), copié, elegí Telegram y confirmé:
POST 201, relectura de interacciones y de at-risk. El lead salió de
`/leads/at-risk?hours=1` (59), el header bajó a "59 leads sin respuesta" sin
recargar y la línea de tiempo muestra "Mensaje · Saliente por Telegram". La
interacción queda en el lead de prueba, con "(prueba 2.23)" al final. El
umbral se devolvió al de por defecto.

`tsc`, `eslint` y `next build` limpios (`/leads/[leadId]` 12,2 kB). El build
corrió en una copia del repo: otra sesión tenía `next dev` sobre esta
carpeta y `next build` le habría pisado `.next`.

Pendiente:
- El camino feliz del portapapeles (sin respaldo) no se vio en el panel del
  navegador; hay que confirmarlo en un navegador normal.
- HU-12 AC3 sigue parcial: el envío real desde la app necesita que el API
  mande mensajes (Telegram lo maneja L3).
- `client_name` sigue faltando siempre (bloqueo 12), así que casi todo
  mensaje pasa por la confirmación de faltantes si el agente no lo completa.

## 2026-10-20 — Tarea 2.24: endpoints propuestos en el contrato (bloqueos 9 a 12)

Solo documentación. Nueva sección 8, "Propuestos (no existen todavía)", al
final de `docs/API_CONTRACT.md`, con forma de respuesta, filtros, errores
(401, 403, 404, 422) y la tarea del front que consume cada uno:

- `GET /tasks?status=&due_before=&agent_id=&limit=` → `list[TaskOut]`, por
  agencia (bloqueo 9; 2.25 y 2.26).
- `source` en `TaskOut`: `MANUAL | SWEEP | FIRST_TOUCH` (bloqueo 11; 2.25 y
  2.26).
- `GET /leads/at-risk` con `LeadCard` y filtros `agent_id`, `created_from`,
  `created_to`, `property_id` (bloqueo 10).
- `client_name` en `GET /leads/{id}`, propuesto como `LeadCard` completo
  (bloqueo 12).
- `GET /analytics/at-risk-by-agent?hours=&from=&to=&property_id=&format=csv`,
  solo `TEAM_ADMIN`, JSON por agente y CSV como el del embudo (bloqueos 10 y
  15; 2.25 y 2.27).

Revisado antes contra `/openapi.json` (2026-10-20): **ninguno existe**.
`at-risk` y `GET /leads/{id}` siguen en `LeadOut` y `TaskOut` sigue con siete
campos, así que nada pasó a la sección 3.

Decidido:
- La sección abre diciendo que solo el bloque F (2.25–2.27) puede usarla, y
  solo con mocks; cada endpoint se mueve a la sección 3 cuando se confirme.
- En los listados no hay 404: un id de otra agencia en un filtro da lista
  vacía. Es propuesta, no comportamiento verificado.
- `at-risk` con `LeadCard` y `client_name` en el perfil no los consume
  ninguna tarea del bloque F. Aprovecharlos (2.15–2.18, 2.21–2.23) será una
  tarea nueva cuando existan; la sección lo dice para que nadie los use
  antes.
- `at-risk-by-agent` sin tope de 500, agentes por `leads_at_risk`
  descendente, `leads` como `list[LeadCard]`, CSV de una fila por lead y
  `last_response_at` como deseable (bloqueo 15).

Pendiente:
- Llevarle la sección a L1. Puntos abiertos: `from`/`to` frente a
  `created_from`/`created_to` del embudo, y si `GET /tasks?status=PENDING`
  debe contar los `SNOOZED` vencidos.
- 2.25 (mocks con esta forma) y 2.26 (campanita).

## 2026-10-20 — Tareas 2.25 y 2.26: mocks de lo propuesto y campanita de recordatorios (HU-11 AC2)

**Solo con mocks. Falta la prueba en vivo:** `GET /tasks` y
`GET /analytics/at-risk-by-agent` siguen sin existir en `/openapi.json`, así
que nada de esto se ha probado contra el API real.

**Hecho (2.25).**
- `lib/schemas.ts`: sección "PROPUESTO" con `TaskSource`,
  `TareaAgenciaSchema` (`TaskOut` + `source`), `RiesgoAgenteSchema` y
  `RiesgoPorAgenteSchema`, con la forma de `docs/API_CONTRACT.md` §8.
- `lib/homelitics-nucleo.ts`: `api.tareasAgencia(filtros)` (valida `status`,
  `due_before` con zona, `agent_id` uuid y `limit` 1–200 antes de llamar) y
  `api.riesgoPorAgente(filtros)` (`hours` obligatorio 1–8760 y rango
  `from`/`to` al revés rechazados aquí).
- Mocks en `lib/mock/index.ts` con la forma exacta, semilla fechada respecto
  al arranque (ver `lib/mock/README.md`), incluido `TASK_ID_POR_VENCER`, que
  vence 3 min después de arrancar. `at-risk-by-agent` reusa el predicado de
  `at-risk` (extraído a `leadsSinRespuesta`) y da también el CSV propuesto.
- Interruptores `USE_MOCK_TAREAS_AGENCIA` y `USE_MOCK_RIESGO_POR_AGENTE` en
  `lib/interruptores.ts` (documentados en `CLAUDE.md` y `.env.example`).
- 23 casos nuevos en `/api/mocktest` (12 de `GET /tasks`, 11 de `at-risk-by-agent`).

**Hecho (2.26).** `features/seguimiento/components/CampanaRecordatorios.tsx`
en el header, al lado de `AlertaRiesgo` (los dos van ahora en un contenedor
con `ml-auto`). `useRecordatoriosVencidos` pide
`GET /tasks?status=PENDING&due_before=<ahora>&agent_id=<yo>&limit=200` con
`refetchInterval` de 1 min y `refetchOnWindowFocus`. Conteo en la campanita
("200+" si llega al tope) y, al abrir, la lista con la nota (o "Recordatorio
sin nota"), "Venció el …" en hora de Bogotá con el relativo, el origen si no
es `MANUAL` y enlace a `/leads/{lead_id}`. Con 0, cargando, con error, sin
`/me` o antes de hidratar (`useHidratado()`) no dibuja nada. Crear,
posponer o marcar hecha una tarea invalida su key.

Decidido:
- `source` no entra en `TaskSchema`: el `TaskOut` real tiene siete campos y
  un campo obligatorio de más rompería `GET /leads/{id}/tasks`. El mock lo
  guarda pero solo lo devuelve en `GET /tasks`.
- El interruptor vive en el servidor y lo consultan `lib/homelitics.ts` y el
  proxy (que responde desde el mock con el código y el `{ detail }` del
  API). Así basta una variable por endpoint, sin espejo `NEXT_PUBLIC_`. Sin
  la variable cuenta como `true`: el endpoint no existe.
- `due_before` se arma en cada lectura y no va en la key: la relectura de
  cada minuto trae lo que venció sin cambiar de key.

Verificado: `tsc`, `eslint` y `next build` limpios (el build, en una copia
fuera del repo: había otro `next dev` usando `.next`). Con `USE_MOCKS=true`
(`.env.local` restaurado a `false` después): todos los casos de
`/api/mocktest`; el proxy con el interruptor (`/api/homelitics/tasks` 200 y
422, CSV de `at-risk-by-agent`) sin tocar el API real. En `/tablero`: la
campanita sale con 3, la lista abre con hora de Bogotá y origen, y **sin
recargar pasó de 3 a 4 cuando venció `TASK_ID_POR_VENCER`**. Marcarla hecha
desde el lead la bajó a 3 al instante; vaciando las demás desde sus enlaces
quedó "1 recordatorio vencido" y luego desapareció. Sin errores en consola
tras recargar.

Pendiente:
- **Prueba en vivo** (criterio de 2.26) cuando L1 publique `GET /tasks`:
  verificar contra `/openapi.json`, moverlo a la sección 3 del contrato,
  poner `USE_MOCK_TAREAS_AGENCIA=false`, crear un recordatorio a 2 minutos y
  ver que la campanita lo muestra; después borrar el interruptor. Si `source`
  no llega, ajustar `TareaAgenciaSchema`.
- Lo mismo con `at-risk-by-agent` en 2.27.
- Con L1: si los `SNOOZED` vencidos cuentan como pendientes (hoy el mock no
  los devuelve con `status=PENDING`).

## 2026-10-25 — HU-23, fase 0: reconocimiento para el login del agente

Sin cambios de código. Resultado completo en `PLAN.md`, sección
"Reconocimiento (fase 0)".

Hecho:
- URLs reales: cliente `/propiedades/{id}/agendar[/confirmar]` y
  `/citas/{id}[/encuesta]`; agente `/tablero`, `/leads/{id}`, `/embudo`,
  `/riesgo`. Fuera de los grupos: `/`, `/dev/explorar` y `/api/mocktest`, que
  no tienen guarda y deben quedar protegidas por el middleware.
- Inventario de `api.` en `(cliente)`: los Server Components llaman GET
  `/listings/{id}`, `/leads/{id}` y `/appointments/{id}` directo al API; los
  Client Components usan slots, POST de cita, GET/PATCH de cita y GET/POST
  de feedback por el proxy. A la lista blanca de la fase 6 no le falta nada.
- `QueryClient` del navegador en `app/providers.tsx:24`; las páginas de
  agente crean otros por petición en el servidor, solo para precargar.
- Reasignar (`features/reasignar/`, `EtapaLead.tsx:64`), `/embudo` y
  `/riesgo` ya existen y ya se esconden según `/me`.

Decidido / propuesto:
- GET `/listings/{id}` y GET `/leads/{id}` salen de la lista blanca del
  proxy público (aplicado en `PLAN.md`, fase 6): solo los usan Server
  Components, que no pasan por el proxy. Ya no se lee el `LeadOut` crudo por
  UUID desde el navegador; los riesgos aceptados y los casos de `curl` de
  las fases 6 y 9 quedaron ajustados.
- La fase 4 reutiliza `lib/agente-actual.ts` y
  `features/agentes/AgenteActual.tsx` en vez de crear archivos nuevos.
- En la fase 2, el `onError` global va en `QueryCache`/`MutationCache`
  (React Query v5); `HistorialLead.tsx:68` y `ExportarEmbudo.tsx:39` llaman
  sin React Query y necesitan su propio manejo.

Pendiente:
- Las cuatro casillas de Supabase y cuentas de la fase 0 (registro
  apagado, `auth_user_id`, cuentas `TEAM_ADMIN`/`AGENT`, cuenta de servicio).
- Decidir si `/embudo` y `/riesgo` pasan de `Aviso` a `notFound()` (fase 5).

## 2026-10-25 — HU-23, fase 1: infraestructura de sesión

Hecho:
- `middleware.ts`: crea un `createServerClient` sobre las cookies de la
  petición (patrón `updateSession`), verifica con `getClaims()` y aplica una
  política cerrada. Públicas: `/entrar`, `/propiedades`, `/citas`,
  `/api/publico` y `/api/homelitics` (prefijo completo: `/citasx` no pasa).
  Sin sesión → `302 /entrar?siguiente=<ruta+query>`; con sesión en `/entrar`
  → `rutaSegura(siguiente)`. Con `USE_MOCKS=true` deja pasar todo.
- `lib/redireccion.ts`: `RUTA_TABLERO` y `rutaSegura()`.
- `lib/supabase/servidor.ts`: `crearClienteServidor()`, todavía sin uso (fase 2).
- `app/entrar/page.tsx` provisional: "Login en construcción".
- `.claude/launch.json`: configuración `homelitics-web-sin-mocks` (puerto
  3001, `USE_MOCKS=false` sin tocar `.env.local`).
- Probado con `USE_MOCKS=false`: `/leads/{id}?x=1`, `/tablero`, `/`,
  `/dev/explorar`, `/embudo`, `/riesgo` y `/api/mocktest` → `/entrar?siguiente=...`;
  `/citas/{id}`, `/citas/{id}/encuesta`, `/propiedades/{id}/agendar` y
  `/api/homelitics/health` → 200. Una cookie `sb-*-auth-token` fabricada
  también redirige. Con `USE_MOCKS=true`, `/tablero` y `/embudo` → 200.
  `type-check` y `lint` limpios.

Decidido:
- 302 explícito y no el 307 por defecto de `NextResponse.redirect`: un 307
  reenviaría un POST (Server Action) a `/entrar`.
- La redirección "con sesión en `/entrar`" compara la ruta exacta, para no
  atrapar `/entrar/salir` (fase 4).
- `rutaSegura()` rechaza además caracteres de control (el navegador borra el
  tab y `/\t/otro.sitio` queda como `//otro.sitio`) y comprueba al final que
  la URL resuelta no cambie de origen.
- Las cookies que Supabase renueve se copian también a la respuesta de
  redirección.

Pendiente:
- Fase 2: `lib/session.ts` y el proxy. Hasta entonces `/api/homelitics/*`
  sigue usando el agente demo, y sin login real no se puede probar el caso
  "con sesión".

## 2026-10-25 — HU-23, fases 6 y 2: cuenta de servicio para cliente y sesión por cookie

Las dos en la misma rama: sin la 6, la 2 rompe las pantallas de cliente.

Hecho (fase 6):
- `lib/credencial-servicio.ts` (`server-only`): el código de la etapa 1 de
  `lib/session.ts`, con `SERVICE_AGENT_EMAIL`/`SERVICE_AGENT_PASSWORD`.
  Exporta `getServiceAuthHeader()` e `invalidarTokenServicio()`. Es la única
  variable de módulo permitida (una sola identidad compartida a propósito);
  el comentario del archivo lo explica.
- `apiPublico` en `lib/homelitics.ts` (API directo + credencial de servicio)
  y en `lib/homelitics-navegador.ts` (por `/api/publico`). Mismo `crearPedir`,
  `lib/homelitics-nucleo.ts` sin cambios.
- `app/api/publico/[...path]/route.ts`: lista blanca de método + ruta con
  regex ancladas e ids UUID: GET `/health`, GET `/agents/{id}/slots`, POST
  `/leads/{id}/appointments`, GET/PATCH `/appointments/{id}`, GET/POST
  `/appointments/{id}/feedback`. Todo lo demás (incluido DELETE) → 404 sin
  tocar la red. Reintento tras 401 con el token de servicio renovado.
- Las 4 páginas de `app/(cliente)/` y `GrillaHorarios`, `SelectorNuevoHorario`,
  `ConfirmarCitaAcciones`, `CitaAcciones`, `EncuestaFlujo`, `EncuestaAcciones`
  usan `apiPublico` (comprobado que ninguno lo importa `(agente)`).

Hecho (fase 2):
- `lib/session.ts` reescrito como en `PLAN.md`: `cache()` de React +
  `crearClienteServidor()` + `getSession()`. Sin `cached`, `SKEW_MS`,
  `invalidateToken` ni password grant.
- Proxy `/api/homelitics`: sin reintento; si `getAuthHeader()` lanza →
  `401 {"detail":"Sesión vencida"}`. Un 401 del API pasa tal cual.
- `app/providers.tsx`: `onError` global en `QueryCache` y `MutationCache`
  (la v5 no lo acepta en `defaultOptions`): `no_autenticado` →
  `/entrar?siguiente=<ruta+query>`.
- `.env.example` y `.env.local`: `DEMO_AGENT_*` → `SERVICE_AGENT_*` (en
  `.env.local` solo se renombraron las claves).

Probado con `USE_MOCKS=false` y sin cookies (servidor `homelitics-web-sin-mocks`):
- `curl`: `/api/publico/me`, `/leads`, `/leads/<uuid real>`,
  `/listings/<uuid real>`, `/analytics/north-star`, `/appointments/no-es-uuid`,
  `/appointments/<uuid>/x` y DELETE `/appointments/<uuid>` → 404;
  `/api/publico/health` → 200; slots y GET de una cita real → 200;
  `/api/homelitics/me` → 401 `{"detail":"Sesión vencida"}`.
- En el navegador, sin sesión: 2.1 (`/propiedades/6c645c15-…/agendar?leadId=5311d3b9-…`)
  pinta la ficha y pide los slots por `/api/publico`; 2.3 (`/citas/ee702b0c-…`)
  pinta la cita con "Mover" y "Cancelar la visita"; 2.5
  (`/citas/b1100033-…/encuesta`, ya `COMPLETED`) muestra la encuesta tras un
  GET de feedback 200 por `/api/publico`. No se envió nada.
- `type-check` y `lint` limpios. Búsqueda de `let`/`var` de módulo en los
  archivos `server-only` (`lib/agente-actual.ts`, `lib/credencial-servicio.ts`,
  `lib/interruptores.ts`, `lib/session.ts`, `lib/supabase/servidor.ts`):
  solo `cached` en `lib/credencial-servicio.ts`.

Decidido:
- El proxy público responde **502** (no 401) si la cuenta de servicio no
  sirve (falla el password grant o el API sigue en 401 tras renovar). Un 401
  se traduciría a `no_autenticado` y el `onError` global mandaría a `/entrar`
  a un cliente que nunca tuvo sesión.
- El proxy público no consulta `mockForzado`: ninguna ruta de la lista es un
  endpoint propuesto.

Hallazgos:
- **La cuenta de `.env.local` es `TEAM_ADMIN`** (`GET /me`), y `PLAN.md`
  (fase 0) pide un `AGENT` para la cuenta de servicio. Hay que cambiarla
  antes de llevar esto a `main`.
- Los ids de prueba de septiembre (`8d14666e-…`, `423190e8-…`,
  `afb8d316-…`) ya no existen en el API: la base se recargó. Los de arriba
  son los actuales.

Pendiente:
- `/entrar` sigue siendo la página provisional (fase 3): la redirección del
  `onError` cae ahí.
- Llamadas directas sin React Query del lado agente (`HistorialLead`,
  `ExportarEmbudo`): no ven el `onError` global.
- Fase 8: README, `CLAUDE.md` y `docs/API_CONTRACT.md` siguen nombrando
  `DEMO_AGENT_*` y el reintento tras 401.
- No se probó el caso "con sesión" de `/api/homelitics` (no hay login todavía).

## 2026-10-25 — HU-23, fase 3: pantalla `/entrar`

Hecho:
- `app/entrar/acciones.ts` (`"use server"`): `entrar()` valida con zod
  (correo y contraseña no vacíos; la contraseña sin `trim`), llama
  `signInWithPassword` con `crearClienteServidor()` y redirige con
  `rutaSegura(siguiente)`. `salir()`: `signOut()` + `redirect("/entrar")`.
- `components/FormularioEntrar.tsx`: `useActionState`, botón "Entrar al
  panel" ("Entrando…" y deshabilitado mientras envía), `siguiente` como campo
  oculto. Al montar, `fetch("/api/publico/health")` sin esperar (AC5).
- `app/entrar/page.tsx` reemplaza la provisional: tarjeta centrada, aviso de
  `?error=sin-agencia` con `Aviso` (AC4) y el texto de `PLAN.md` en lugar de
  "Crear cuenta" / "Olvidé mi contraseña".

Decidido:
- Un solo mensaje, "El correo o la contraseña no coinciden.", para todo
  fallo: validación, error de Supabase o excepción de red. No se distingue
  un Supabase caído para no abrir una segunda vía de diferenciar respuestas.
- `redirect()` va fuera del `try`: lanza a propósito y el `catch` se lo comería.
- El estado devuelve el correo intentado para no hacerlo escribir otra vez;
  la contraseña se borra.

Probado (servidor `homelitics-web-sin-mocks`):
- Sin sesión, `/leads/abc?x=1` → `/entrar?siguiente=%2Fleads%2Fabc%3Fx%3D1`.
- `?error=sin-agencia` muestra el aviso.
- Correo inexistente → mensaje genérico, correo conservado.
- `GET /api/publico/health` → 200 al cargar la página.
- `type-check` y `lint` limpios.

Pendiente (pruebas manuales más adelante, con las dos cuentas de prueba):
- Login correcto con el `TEAM_ADMIN` y con el `AGENT`.
- Contraseña incorrecta con un correo real: debe dar el mismo mensaje.
- `/entrar?siguiente=//otro.sitio` (y `https://otro.sitio`): debe ir al tablero.
- `salir()` todavía no tiene botón: lo pone el layout de `(agente)` en la fase 4.

## 2026-10-25 — HU-23, fase 4: layout de `(agente)` con identidad y rol

Hecho:
- `app/(agente)/layout.tsx`: resuelto el TODO. GET /me con 403
  (`sin_permiso`) → `/entrar/salir`; con 401 (`no_autenticado`) → `/entrar`;
  cualquier otro error (API dormido, 5xx) sigue con `agente = null` como antes.
  Encabezado con el nombre del agente (`full_name`, o el correo si no tiene) y
  el botón "Salir" (Server Action `salir()`).
- `app/entrar/salir/route.ts` (nuevo): `signOut()` y
  `/entrar?error=sin-agencia`. El layout no puede escribir cookies.
- `app/(agente)/loading.tsx` (nuevo): "Despertando el servicio…" (AC5).
- `.claude/launch.json`: `homelitics-web-sin-mocks-3003`, porque el 3001
  estaba ocupado por otro servidor.

Decidido:
- **No** se crearon `obtenerAgente` ni `components/AgenteProvider.tsx` con
  `{ id, nombre, rol, agenciaId }`: ya existían `obtenerAgenteActual`
  (`lib/agente-actual.ts`) y `AgenteActualProvider`/`useAgenteActual`/
  `useEsAdmin` (`features/agentes/AgenteActual.tsx`), con el `Agent` de /me
  sin token. Los usan 8 componentes y los PDF leen `agente.email`; cambiar
  la forma obligaba a tocar pantallas internas.
- Un `loading.tsx` no envuelve el layout de su propio segmento, así que el
  `await` de /me va en un componente interno dentro de
  `<Suspense fallback={<Cargando />}>`, reusando el de `loading.tsx`.

Probado (`homelitics-web-sin-mocks-3003`, `USE_MOCKS=false`):
- `TEAM_ADMIN`: el encabezado muestra "Carlos Juan Restrepo Pulido", igual que
  `/me`, con "Embudo" y "Leads en riesgo".
- `AGENT`: el encabezado muestra "Liliana Rengifo Ortiz", igual que `/me`,
  sin "Embudo" ni "Leads en riesgo".
- Con las dos cuentas: "Salir" → `/entrar`; "atrás" →
  `/entrar?siguiente=%2Ftablero`; `/api/homelitics/me` → 401.
- `/entrar/salir` sin sesión → `/entrar?error=sin-agencia` con el aviso.
- `type-check` y `lint` limpios.

Pendiente:
- Caso 403 completo: falta un usuario de Auth sin agente vinculado.

## 2026-10-25 — HU-23, fase 5: permisos por rol en la UI

Hecho:
- `app/(agente)/embudo/page.tsx` (HU-17) y `app/(agente)/riesgo/page.tsx`
  (HU-13): si `/me` dice que el agente no es `TEAM_ADMIN` → `notFound()`, en
  vez del `Aviso` "solo para administradores". Misma convención 404 del API.
- Reasignar (HU-08) no se tocó: ya se renderizaba solo con `useEsAdmin()`
  (`components/EtapaLead.tsx`), que es `useAgenteActual()?.role ===
  "TEAM_ADMIN"`. Las dos pantallas existían; no hubo nada que anotar como
  faltante.

Decidido:
- Se usan los nombres que ya existen (`obtenerAgenteActual`, `useEsAdmin`) y
  no `obtenerAgente`/`useAgente().rol` del plan, igual que en la fase 4.
- Si `/me` falla por otra cosa que 401/403 (API dormido), la página se
  intenta igual: el API es la autoridad. No se duplica autorización.
- El 404 llega con estado HTTP 200: el layout de `(agente)` hace streaming
  dentro de un `Suspense` y la cabecera ya salió cuando la página llama
  `notFound()`. Next igual pinta la página 404 y le pone `noindex`. Para la UI
  da lo mismo.

Probado (`homelitics-web-sin-mocks-3003`, `USE_MOCKS=false`):
- `AGENT` (Liliana Rengifo Ortiz): `/embudo` y `/riesgo` muestran la página
  404; sin "Embudo" ni "Leads en riesgo" en el encabezado; en
  `/leads/{id}` no aparece "Reasignar" ni "A cargo de".
- `TEAM_ADMIN` (Carlos Juan Restrepo Pulido): `/embudo` y `/riesgo` cargan
  con sus datos; en `/leads/{id}` aparecen "Reasignar" y "A cargo de".
- `type-check` y `lint` limpios.

Pendiente:
- No hay `app/not-found.tsx`: la página 404 es la de Next, en inglés ("This
  page could not be found."). Falta un 404 propio en español.

## 2026-10-25 — HU-23, fase 7: modo mocks

Hecho:
- `MOCK_AGENT_ROLE` (`AGENT` | `TEAM_ADMIN`, por defecto `TEAM_ADMIN`) en
  `lib/mock/index.ts` (`rolMock()`): fija el `role` del agente demo, que es el
  que devuelve `GET /me`, el que sale en `GET /agents` y el que decide los 403
  del mock (reasignar, embudo, riesgo por agente). Un valor que no sea uno de
  los dos lanza un error claro. Documentada en `.env.example` y
  `lib/mock/README.md` (reemplaza el "cambia `agente.role` a mano").
- `next.config.ts` pasa `MOCK_AGENT_ROLE` también al navegador (`env`), para
  que las dos mitades del mock respondan con el mismo rol.
- `/entrar` con `USE_MOCKS=true` redirige a `rutaSegura(siguiente)` (el
  tablero si no hay). El middleware ya no exigía sesión con mocks desde la
  fase 1.
- "Salir" (`salir()`) y `/entrar/salir` con mocks no llaman a Supabase (sin
  credenciales fallaba `createServerClient`): van a `/entrar`, que salta al
  tablero.

Decidido:
- Una sola variable y no un espejo `NEXT_PUBLIC_MOCK_AGENT_ROLE`: `env` de
  `next.config.ts` la inlina en los dos bundles. No es secreto. Cambiarla
  exige reiniciar `npm run dev`.

Probado (servidor lanzado por un script de Node que vacía
`HOMELITICS_API_URL`, `NEXT_PUBLIC_SUPABASE_*` y `SERVICE_AGENT_*`; con el
`bash` de WSL las variables no llegan al proceso de Windows):
- `TEAM_ADMIN`: `/`, `/tablero`, `/leads/<id>` (con Reasignar), `/embudo`,
  `/riesgo`, `/dev/explorar`, `/propiedades/<id>/agendar` (y `confirmar`),
  `/citas/<id>` y su encuesta → 200, sin errores en el log. `/entrar` →
  `/tablero`; `?siguiente=/riesgo` → `/riesgo`; `?siguiente=//otro.sitio` →
  `/tablero`; "Salir" y `/entrar/salir` → `/entrar` → `/tablero`.
- `MOCK_AGENT_ROLE=AGENT`: `/me` responde `AGENT`, sin Reasignar en el lead,
  sin enlaces a Embudo ni Leads en riesgo, y `/embudo` y `/riesgo` pintan 404.
- `type-check` y `lint` limpios.

Pendiente:
- Fase 8 (documentación y `DEMO_AGENT_*` → `SERVICE_AGENT_*` en README y
  `CLAUDE.md`).

## 2026-10-25 — HU-23, fase 8: limpieza y documentación

Hecho:
- README: `DEMO_AGENT_*` → `SERVICE_AGENT_*` (solo la usan `apiPublico` y
  `/api/publico/*`), `MOCK_AGENT_ROLE`, login en `/entrar`, cómo probar la
  cuenta de servicio (`curl /api/publico/health`) y la del agente (`/me` en
  el navegador con sesión, porque con `curl` da 401), bloqueo 5 con la
  cuenta de servicio, mapa de arquitectura con el middleware y los dos
  proxies, y la regla de las variables de módulo.
- `CLAUDE.md`: árbol de archivos actualizado; tabla de etapas con la 2 como
  actual y la 1 retirada (su código vive en `lib/credencial-servicio.ts`);
  sección "`api` frente a `apiPublico`, y los dos proxies"; sección "Nada
  que dependa del usuario en una variable de módulo", con el `grep` de
  comprobación; variables de entorno y "Estado actual".
- `docs/API_CONTRACT.md` §4: el 401 ya no es "renovar y reintentar" sino
  "la sesión no es válida: volver a `/entrar`"; fila nueva para el 403 de
  `GET /me` (cuenta sin agencia), distinta del 403 de rol.
- `docs/SPRINT_LINEA2.md`, "Bloqueos": 16 (la cuenta de servicio es de una
  sola agencia) y 17 (el enlace es el control de acceso), como riesgos
  aceptados, con la solución de fondo para L1 (endpoints públicos con token
  firmado en el enlace). Numerados después del 15 de
  `docs/SPRINT_E3_LINEA2.md`.
- `docs/PRUEBAS_HU23.md`: los 13 casos de la fase 9 con columna de
  resultado.

Comprobación de variables de módulo (`grep -rn "^let \|^var " lib/ app/`):
`lib/credencial-servicio.ts:22` (`let cached`) y siete en `lib/mock/index.ts`.
Nada más. Los `let` con sangría son locales de función. Los `Set` de módulo
de `lib/umbral-navegador.ts` y `features/plantillas/almacen.ts` son del
navegador (oyentes), no del servidor.

Probado (`USE_MOCKS=false`, puerto 3001, `curl` sin cookie):
- Caso 12: `/api/publico/leads`, `/leads/<uuid real>`, `/listings/<uuid
  real>`, `/me` y `/analytics/north-star` → 404. Control: `/health` → 200.
- Caso 13: `/api/homelitics/me` → 401 `{"detail":"Sesión vencida"}`.

Pendiente:
- Casos 1 a 11 de `docs/PRUEBAS_HU23.md`, con navegador y las cuentas de
  la fase 0 (las cuatro casillas de Supabase y cuentas siguen abiertas).
- Quedan menciones al "agente demo de la etapa 1" fuera de §4 en
  `docs/API_CONTRACT.md` (bloqueo 5, `/analytics/funnel`) y el bloqueo 14
  de `docs/SPRINT_E3_LINEA2.md` ("sigue sin login real"), que ya no es
  cierto. No se tocaron: no estaban en el alcance de esta fase.

## 2026-10-25 — Sistema visual "B + C" en todas las pantallas

**Motivo:** el front usaba los grises de fábrica de Tailwind sobre blanco y la
tipografía del sistema. Se eligió la combinación de las direcciones de marca
B (Plano: azul, cifras, embudo como barra) y C (Vereda: burbujas de chat,
botones redondos, verde para lo que sale bien). Solo escritorio por ahora.

**Hecho:**

- `app/globals.css`: tokens de color en `@theme` (`tinta`, `neblina`,
  `plano`, `montana`, `sol`, `alerta` con sus variantes) y clases
  compartidas (`btn`, `btn-primario`, `btn-secundario`, `btn-peligro`,
  `campo`, `etiqueta`, `panel`, `insignia`, `dialogo`, `titulo-pagina`).
  Foco visible global y `prefers-reduced-motion` respetado.
- Fuentes Figtree (texto) y Bricolage Grotesque (títulos y cifras grandes)
  servidas desde `app/fuentes/` con `next/font/local`, licencia OFL incluida.
- Marcos: `app/(cliente)/layout.tsx` (encabezado) + `components/MarcoCliente.tsx`
  (pasos de la visita a la izquierda, contenido a la derecha);
  `features/agentes/components/NavAgente.tsx` (barra lateral del agente con
  el nombre y "Salir" al pie; embudo y riesgo solo para admin, igual que
  antes). `AlertaRiesgo` y `CampanaRecordatorios` quedan arriba a la derecha
  del contenido.
- Pantallas de Sprint 7 incluidas: `/entrar` (pantalla dividida con el
  formulario a la derecha), `/riesgo`, el panel de seguimiento y la
  respuesta con plantilla en el perfil del lead (columna lateral), la
  etiqueta de riesgo en las tarjetas y el selector de umbral.
- Componentes nuevos: `Logo`, `Cargando` (todos los `loading.tsx` lo usan),
  `SemanaHorarios` (grilla compartida entre agendar y mover).
- `Aviso` ganó las variantes `exito` y `espera`, con ícono.
- Historial del lead como conversación (entrante a la izquierda, saliente en
  azul, notas en amarillo, separadores por día). Tarjetas del tablero con la
  última interacción como burbuja y una barra de reparto por etapa.
- `lib/format.ts`: `fechaLarga`, `horaFin`, `partesDia`, `rangoSemana`.

**Decisiones:**

- No se tocó lógica, llamadas al API (incluido `apiPublico`), hooks,
  middleware ni esquemas: solo marcado y clases. Hecho sobre `feat/Sprint7`. Los criterios de "done" de cada tarea siguen igual.
- `next/font/local` y no `next/font/google`: en el entorno donde se hizo el
  cambio Google Fonts estaba bloqueado y el build fallaba; así no depende de
  la red.
- En el éxito de 2.2 se agregó "Ver mi visita" (enlace a 2.3, que ya
  existe); antes no había a dónde ir.
- "Cancelar" de los diálogos pasó a "Volver" para no confundirlo con
  "Cancelar la visita".
- `/dev/explorar` se dejó con su estilo de herramienta de desarrollo.

**Probado** con `USE_MOCKS=true`: `npm run type-check`, `npm run lint`,
`npm run build` limpios; capturas a 1440 px de agendar, confirmar (y su
éxito), la visita (mover, cancelar, cancelada), la encuesta (asistencia y
formulario), el tablero (con arrastre, riesgo y campanita), los perdidos, el lead
(abierto, perdido, con seguimiento y plantilla), el modal de perdido, el
embudo y el reporte de riesgo. Sin errores de consola.

**Pendiente:** vistas de celular (fuera de alcance por ahora); pasar los PDF
del embudo y del riesgo (`features/*/pdf.ts`) a los colores nuevos. (`/entrar`
se revisó levantando la app con `USE_MOCKS=false`: con mocks redirige al
tablero.)

## 2026-10-25 — 2.28: contrato de avisos (tag `notifications`)

Documentados en `docs/API_CONTRACT.md` §3 los cuatro endpoints de avisos, verificados contra `/openapi.json` y la guía `homelitics-crm/docs/NOTIFICATIONS.md`, y `NotificationType`/`assigned_via` en §5; corregido que reasignar "no notifica" en el contrato, `ModalReasignar` y el README. Las diferencias entre `/openapi.json` y la guía quedan como bloqueos 21 a 23 (forma del 422 del monitor, `actor_role: AGENT`, reasignar notifica solo según la guía). **Pendiente:** 2.29 en adelante; confirmar los bloqueos 21 a 23 con L1.

## 2026-10-25 — 2.29: esquemas y operaciones de avisos

`NotificationType`, `AssignedVia`, `NotificationSchema` (tipo `NotificationOut`, para no tapar el `Notification` del navegador), `NotificationPageSchema` y `MarkedReadSchema` en `lib/schemas.ts`; `visit_status`/`booked_status` reutilizan `AppointmentStatus` y `actor_role` el enum de `AgentListItemSchema`. En `crearApi`: `avisos(q)`, `marcarAvisoLeido(id)`, `marcarTodosLeidos()` y `avisosAgencia(q)`, con la query validada por zod antes de salir (`limit` 1–20, `before` e `id` enteros, uuids, días con `z.iso.date`, `rechazarRangoAlReves`); las dos mitades las heredan sin tocarlas. `pedir()` ya tenía una rama para el 204 pero ninguna operación la usaba: ahora toda respuesta sin cuerpo (204 o 200 vacío) llega como `undefined` por el mismo `safeParse` (la operación declara `z.void()`), y un cuerpo que no es JSON sale como `servidor` en vez de un `SyntaxError` suelto; el proxy `/api/homelitics/*` responde 204 cuando un mock forzado no devuelve nada. Probado con un `fetch` falso: el 204 da `undefined`, `limit: 21`, `limit: 0`, rango al revés, día inválido, uuid malo e id no entero fallan como `invalido` sin tocar la red. **Pendiente:** 2.30 (mocks; hoy con `USE_MOCKS=true` estas cuatro rutas no tienen mock) y probar contra el API real en 2.37.

## 2026-10-25 — 2.30: mocks de avisos

34 avisos en `lib/mock/` (22 del demo, 7 de Paula, 5 de Andrés) con la forma de `NotificationSchema`, ids enteros desde 1201 en orden de creación, y las cuatro rutas en `resolverMock`: bandeja propia, `read` (204, `read_at` solo la primera vez, 404 si es ajeno), `read-all` y el monitor (403 con `AGENT` antes que cualquier 422, filtros del contrato, días en Bogotá). Decidí guardar solo los hechos del aviso y resolver nombres, dirección y la visita al responder, como los joins del API: así `visit_status` es el de ahora ("mover ok" de `/api/mocktest` gana a Daniel y su aviso pasa a `CANCELLED` con `booked_status: CONFIRMED`). Para que cada `VISIT_SCHEDULED` enlace a una cita real y cubrir `RESCHEDULED` y `NO_SHOW` agregué 11 citas semilla en leads existentes (las futuras, relativas al arranque). Como el demo es el único admin con nombre y nadie se avisa a sí mismo, lo que no le manda el bot al demo viene de un admin sin nombre (`actor_name` nulo). 43 casos nuevos en `/api/mocktest`, todos con el resultado esperado; `type-check` y `lint` limpios. **Pendiente:** 2.31 en adelante.

## 2026-10-25 — 2.31: textos de los avisos

`features/avisos/texto.ts`, funciones puras: `nombreActor(n, posicion)` ("El asistente" si `actor_role` es `AI_AGENT`, si no `actor_name`, si es nulo "Un administrador"; en `"medio"` los genéricos van en minúscula y un nombre propio queda igual), `fraseAviso(n)` → `{ frase, etiqueta, requiereConfirmacion }` con la tabla "Textos" del plan, y `destinoAviso(n)` (`/leads/{id}`, o `#cita-{appointment_id}` en `VISIT_SCHEDULED` si la cita viene). Decidí: "Nuevo lead de {actor}" contrae a "del asistente"; `requiereConfirmacion` y la etiqueta salen solo de `visit_status` (nulo → sin etiqueta ni confirmación); `visit_scheduled_at` nulo omite " el {fecha}"; `assigned_via` nulo en un `LEAD_ASSIGNED` usa el texto de `CREATED`; la dirección es solo `listing_address`, sin `neighborhood`. Probado con un script temporal (jiti, ya instalado como dependencia transitiva; borrado después) sobre los 34 avisos del mock más 12 variantes con nulos, `actor_role: AGENT` y `booked_status` distinto del actual: todas con el texto esperado. `type-check` y `lint` limpios. **Pendiente:** 2.32 en adelante; las etiquetas "movida", "realizada" y "no asistió" siguen siendo propuesta (bloqueo 16).

## 2026-10-25 — 2.32: hooks de avisos

`features/avisos/claves.ts` (`PREFIJO_AVISOS`, `prefijoBandeja`, `claveResumen`, `prefijoAnteriores`, `claveAnteriores`, `claveMonitor`, `CLAVE_MARCAR_AVISOS`) y `features/avisos/hooks.ts`: `useResumenAvisos` (primera página, relee cada 60 s y al volver a la pestaña; su `unread_count` es el badge), `useAvisosAnteriores` (infinita desde un `desde` fijo, apagada con `null`, sin relectura sola), `useDescartarAnteriores` (para cerrar el panel), `useMarcarLeido` y `useMarcarTodosLeidos` (optimistas sobre el resumen y las páginas de "Ver más", sin releer) y `mensajeErrorAviso`. En `app/providers.tsx`, un `onSuccess` del `MutationCache` invalida `PREFIJO_AVISOS` tras toda mutación cuya `mutationKey` no empiece por `"avisos"`; el `onError` de sesión vencida queda igual. Decidí: el id del agente va en las keys de la bandeja (el `QueryClient` sobrevive a cerrar sesión sin recargar, y otro agente vería los avisos del anterior), como `useRecordatoriosVencidos`; si falla marcar uno, se revierte solo ese aviso y no la foto entera (con dos clics seguidos se desharía el que sí se guardó); marcar todos sí restaura la foto; la invalidación global no devuelve la promesa porque TanStack 5.102 espera ese `onSuccess` antes del de la mutación. `type-check` y `lint` limpios; sin prueba en el navegador porque todavía no hay pantalla. **Pendiente:** 2.33 (CentroAvisos, donde se revisan los criterios del badge con los mocks) y 2.34, que debe congelar `desde` en estado al pulsar "Ver más".

## 2026-10-25 — 2.33: CentroAvisos

`features/avisos/components/CentroAvisos.tsx` reemplaza a `CampanaRecordatorios` en `app/(agente)/layout.tsx`: mismo guardián (`useHidratado` + `useAgenteActual`), mismo botón y panel, cierre con Escape y clic afuera; badge con `unread_count` ("99+" desde 100), punto `bg-alerta` si hay recordatorios vencidos y un `aria-label` que nombra los dos; pestañas accesibles "Mensajes" y "Recordatorios {n}" (flechas, Inicio/Fin, foco itinerante). Cada mensaje: frase de `fraseAviso`, etiqueta e insignia "bot", tiempo relativo; sin leer en negrita con punto. Clic: `useMarcarLeido` sin esperar, cierra y navega con `Link` a `destinoAviso`. La lista de recordatorios se movió a `features/seguimiento/components/ListaRecordatorios.tsx` y se borró `CampanaRecordatorios.tsx`. Decidí: la campana se ve también con 0 (es la entrada a la bandeja); sin datos no hay badge ni spinner, y dentro del panel `Cargando` o un `Aviso` de error; si marcar uno falla después de navegar, el error se guarda en el centro (el layout no se desmonta) y se ve al reabrir; nueva perilla del mock `globalThis.__homeliticsMock = { avisosSinLeer: true }` (una vez) para el caso 20+. Probado con `USE_MOCKS=true`, `TEAM_ADMIN` y `AGENT`: 6 sin leer, marcar uno (6→5, navega a `/leads/{id}`), aviso de cita (→ `/leads/{id}#cita-…`), marcar todo (badge y botón desaparecen), 22 sin leer con la perilla, `falla: "red"` (vuelve a no leído y el error sale al reabrir); `type-check`, `lint` y `build` limpios. **Pendiente:** 2.34 ("Ver más" y el desplazamiento a `#cita-…`); "99+" y el arranque lento (sin badge mientras carga) revisados solo en el código, porque la perilla de latencia se pierde al recargar.

## 2026-10-25 — 2.34: "Ver más" y ancla de la cita

CentroAvisos: botón "Ver más" en Mensajes (activa `useAvisosAnteriores` con el `next_before` del resumen, "Cargando…" deshabilitado, desaparece sin más páginas) y `removeQueries` de las anteriores al cerrar. HistorialLead: `id="cita-{id}"` con `scroll-mt-24`, desplazamiento tras montar y en `hashchange`, resaltado 2,5 s con `bg-sol-claro`. Probado con mocks (22 avisos en dos páginas; VISIT_SCHEDULED llega a la cita centrada). type-check, lint y build en verde. Pendiente: 2.35 y 2.36.
