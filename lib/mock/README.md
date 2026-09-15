# Datos de ejemplo

`resolverMock(path)` devuelve, para cada ruta del API, un objeto con **la misma
forma** que la respuesta real. Todo lo que salga de aquí se valida contra
`lib/schemas.ts`, igual que los datos reales: un mock con forma libre convierte
el día de la integración en dos días.

Datos base del prototipo, para que las capturas y la demo coincidan:

- Propiedad: Manila 206, Medellín. Transversal 80A # 81-57 apto 206.
  83,80 m², 1 habitación, 1 baño, `asking_price: "650137717.29"`.
- Agente: Hernando Carrillo, rol `TEAM_ADMIN`.
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

`LEAD_ID` es el lead de Laura Restrepo con toda la historia (citas, tareas e
interacciones descritas arriba); `APPOINTMENT_ID` es su cita del jueves 17.
