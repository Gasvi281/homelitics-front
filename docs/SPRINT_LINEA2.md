# Sprint 4, línea 2: interfaces que faltan

El equipo se dividió en tres líneas. **L1** trabaja backend y calendario en
`homelitics-crm`. **L3** trabaja el bot de Telegram y el agente conversacional.
**L2 es este repo.**

## Tareas

| # | Tarea | HU | Criterio de "done" |
|---|---|---|---|
| 2.0 | Decidir stack y crear el repo | infraestructura | Corre local, apunta al API de Homelitics con un token de prueba |
| 2.1 | Selector de horarios: consumir `GET /agents/{id}/slots?from=&to=` y mostrar grilla de 30 min | HU-02 | El cliente ve solo horarios realmente libres |
| 2.2 | Confirmación de cita: `POST /leads/{id}/appointments`, manejo del estado "pendiente de confirmación" | HU-02 | La cita creada aparece con el estado correcto y dispara la notificación al agente |
| 2.3 | Reagendar y cancelar desde la misma vista: `PATCH /appointments/{id}` | HU-02 | El cambio se refleja del lado del agente, aunque sea por relectura periódica |
| 2.4 | Historial del lead: `GET /leads/{id}/interactions`, línea de tiempo más notas manuales | HU-07 | El agente ve todas las interacciones ordenadas por fecha, agrega una nota y persiste |
| 2.5 | Encuesta post-visita: `POST /appointments/{id}/feedback` | HU-14 | El formulario aparece como pendiente después de la fecha y hora de la visita |
| 2.6 | Validar con L1 qué trae realmente `/slots` antes de maquetar 2.1 | HU-02, HU-05 | Confirmación explícita en el canal del equipo |

**2.6 ya está medio resuelta.** El repo del API documenta, con fecha
2026-09-03, que `/slots` sí descuenta las citas existentes, y hay una prueba que
lo respalda. Lo que falta confirmar es el valor de `ENFORCE_AVAILABILITY`.

## Las cinco pantallas

Existe un prototipo visual en HTML con datos falsos. Esto es lo que hay en cada
una.

**2.1 Elegir horario** — ruta `(cliente)/propiedades/[listingId]/agendar`.
Ficha de la propiedad arriba: precio, dirección, barrio y ciudad, metros,
habitaciones, baños, agente. Debajo, una grilla semanal de lunes a viernes con
las casillas de 30 minutos. Las ocupadas se ven en gris y deshabilitadas. Al
elegir una se habilita "Continuar". Navegación de semana anterior y siguiente.
Las horas se muestran en hora de Bogotá aunque el API las mande en UTC.

**2.2 Confirmar la cita** — `.../agendar/confirmar`.
Resumen grande del horario elegido, insignia "Pendiente de confirmación",
dirección, duración, agente y datos de contacto. Aviso de que el agente recibe
la solicitud por correo. Botones: "Pedir la visita" y "Cambiar el horario". Si
el API responde 409 el horario se tomó mientras tanto: mensaje claro y vuelta a
la grilla recargada, no una pantalla de error genérica.

**2.3 Mover o cancelar** — `(cliente)/citas/[appointmentId]`.
La misma tarjeta de la cita, ahora con su estado real. Acciones "Mover" y
"Cancelar la visita". Cancelar es definitivo y hay que decirlo antes, no
después. Si la cita ya es terminal, las acciones quedan deshabilitadas con el
motivo a la vista.

**2.4 Historial del lead** — `(agente)/leads/[leadId]`.
Encabezado con el nombre, la propiedad de interés, la fecha del primer contacto
y la etapa actual marcada sobre el embudo completo. Línea de tiempo vertical,
del más viejo al más nuevo, mezclando interacciones, citas y tareas. Cada
entrada muestra la fecha, el contenido y de dónde vino. Al pie, un campo para
escribir una nota que se guarda como interacción y aparece de inmediato.

**2.5 Encuesta post-visita** — `(cliente)/citas/[appointmentId]/encuesta`.
Escala de 1 a 5 para el interés, botones de objeción (precio, tamaño, ubicación,
estado, administración, otro), campo de texto libre y un botón de enviar. Solo
se abre si la visita quedó marcada como realizada.

## Bloqueos

Tres cosas dependen de L1. Mientras no se resuelvan, la pantalla afectada se
construye contra `lib/mock/`.

1. **No hay forma de registrar un cliente nuevo.** `POST /leads` exige un
   `client_id` existente, y no hay endpoint de clientes. Sin eso, el flujo de
   cliente solo funciona sobre alguien que ya está en la base. Opciones: que L1
   agregue un endpoint mínimo, o arrancar siempre desde un lead existente.
2. **La encuesta exige `COMPLETED`.** El AC de HU-14 dice "después de la fecha y
   hora de la visita", que no es lo mismo. Salida provisional, acordada con el
   equipo e implementada en la tarea 2.5: la propia pantalla de la encuesta
   (no hay pantalla de agente para citas en este repo, ver bloqueo de tiempo
   real en la nota de la tarea 2.3) hace `PATCH {"status":"COMPLETED"}` y
   enseguida abre el formulario, una vez ya pasó la hora de la visita. Vive
   aislada en `completarVisitaProvisional()`
   (`components/EncuestaFlujo.tsx`), la única función que hace ese `PATCH`
   con ese propósito — se borra entera, sin tocar el resto de la pantalla, si
   la línea 1 agrega una forma real de cerrar visitas o cambia la regla del
   409.
3. **`ENFORCE_AVAILABILITY` sin confirmar.** Si está en `false`, el API acepta
   horarios fuera de la agenda publicada y la única defensa es la interfaz.
4. **No hay forma de resolver un `agent_id` a un nombre — parcialmente
   resuelto el 2026-09-14.** El API sigue sin `GET /agents/{id}` ni
   `full_name` en `ListingOut`/`LeadOut`, así que la ficha de 2.1 (que lee
   `GET /listings/{id}`) sigue sin el nombre real: dice "un asesor de
   Homelitics". Pero `GET /appointments/{id}` sí trae `agent_name` ya resuelto
   (confirmado contra el API real, ver `docs/API_CONTRACT.md`) — no estaba
   documentado antes de esa fecha. La pantalla 2.3
   (`(cliente)/citas/[appointmentId]`, que usa `api.cita()` justo sobre esa
   ruta) podría mostrar el nombre real del agente hoy mismo con este dato; no
   se cambió `components/TarjetaCita.tsx`/`CitaAcciones.tsx` para usarlo
   todavía porque es una decisión de pantalla, no una corrección de esquema —
   queda pendiente de decidir con el equipo.
5. **La cita nace `CONFIRMED`, no `PENDING_CONFIRMATION`, en el flujo real de
   la pantalla 2.2 — encontrado el 2026-09-14 probando contra el API real,
   no algo que se pueda resolver desde este repo.** El API decide el estado
   inicial según quién hace el `POST` (`services/appointment.py` del CRM):
   si el que reserva es el agente dueño del lead, la cita nace `CONFIRMED`
   ("el dueño reservándola es su propio consentimiento"); solo nace
   `PENDING_CONFIRMATION` cuando reserva alguien más en nombre del cliente
   (un bot, un colega). Como el proxy de este repo autentica siempre como el
   mismo agente demo (`lib/session.ts`, etapa 1) y no existe identidad de
   cliente separada (bloqueo de arriba, §6 de `docs/API_CONTRACT.md`), **toda
   cita que la pantalla 2.2 crea para un lead de ese agente nace `CONFIRMED`
   de entrada.** No es un bug del front ni de los mocks (el mock sí modela
   `PENDING_CONFIRMATION` fijo, que era el diseño original documentado antes
   de esta fecha).

   **Resuelto el 2026-09-14, decidido con el equipo: la pantalla muestra el
   estado real tal cual llega, en vez de asumir "pendiente".** Es la única
   parte accionable desde este repo — pedirle a L1 una forma de reservar "en
   nombre del cliente" sin heredar el consentimiento del agente sigue siendo
   una opción a futuro, pero no bloquea la tarea. Cambios en
   `components/TarjetaCita.tsx` (`status` ahora opcional: antes de que la
   cita exista no hay estado real que anunciar, así que no se pinta
   insignia) y `components/ConfirmarCitaAcciones.tsx` (guarda la cita que
   devuelve el `POST` y, en éxito, muestra su `status` real con copy acorde:
   "quedó confirmada" si es `CONFIRMED`, el mensaje de "pedimos la visita" de
   antes si es `PENDING_CONFIRMATION`). El aviso de la pantalla, antes de
   enviar, ya no promete "el agente confirma la visita" — ver
   `docs/PROGRESO.md`.

6. **No hay forma de resolver un `client_id` a un nombre.** `LeadOut` solo
   trae `client_id` (uuid); no existe ningún endpoint de clientes
   (docs/API_CONTRACT.md §6, ya anotado en el bloqueo 1 para crear clientes,
   pero tampoco hay uno de lectura). El encabezado de 2.4
   (`(agente)/leads/[leadId]`) pide "el nombre" del cliente; en su lugar
   muestra `client_id` recortado a los últimos 8 caracteres — un dato real,
   no un nombre inventado. "Laura Restrepo" solo existe en el README del
   mock (`lib/mock/README.md`), como narrativa para quien lee los datos de
   prueba: el objeto `Lead` que devuelve el API (real o mock) no tiene ningún
   campo de nombre. Si se necesita el nombre real en la interfaz, hay que
   pedirle a L1 un endpoint de clientes o exponer un campo `full_name` (o
   similar) en `LeadOut`.

### Nota sobre 2.1: qué tan fiel es la grilla al prototipo

El prototipo visual muestra una grilla con las casillas ocupadas en gris y
deshabilitadas. `GET /agents/{id}/slots` no lo permite tal cual: devuelve
**solo** los horarios libres, no el horario laboral completo del agente (eso
vive en `/agents/{id}/availability` y `/time-off`, que no usa la línea 2). Sin
un rango de referencia contra el cual hacer el diff, no hay manera honesta de
pintar "ocupado" — pintar todo lo que no llegó en la respuesta sería inventar.
La pantalla implementada muestra solo lo libre, agrupado por día, que es
exactamente el criterio de "done" de la tarea ("el cliente ve solo horarios
realmente libres"). No es un bloqueo: es más simple que el prototipo y cumple
el HU-02 igual.

También: la ruta `(cliente)/propiedades/[listingId]/agendar` no tiene
`leadId` en el path, y esta pantalla no tiene sesión de cliente. Se resolvió
con `?leadId=` por query string — en el flujo real ese enlace lo entrega el
agente o el bot de Telegram después de crear el lead. Si falta el parámetro,
la pantalla lo dice en vez de inventar un lead.

## Orden sugerido

Día 1, tarea 2.0 y mandar las preguntas de 2.6 al canal sin esperar respuesta.
Día 2, 2.1. Día 3, 2.2 con su camino de error. Día 4, 2.3. Día 5, 2.4.
Día 6, 2.5. Día 7, prueba de humo conjunta con L1 y L3.
