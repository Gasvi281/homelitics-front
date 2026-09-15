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
