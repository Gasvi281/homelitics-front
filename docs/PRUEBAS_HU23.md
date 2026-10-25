# HU-23 — Pruebas manuales (fase 9)

Los 13 casos de la fase 9 de `PLAN.md`. Se corren con `USE_MOCKS=false` y
`NEXT_PUBLIC_USE_MOCKS=false` (por ejemplo con la configuración
`homelitics-web-sin-mocks` de `.claude/launch.json`, puerto 3001).

**Todo lo que se escribe es real** (README, "Probar contra el API real",
punto 7): no hay ambiente aislado.

Hace falta, de la fase 0:

- una cuenta `TEAM_ADMIN` y una `AGENT`, idealmente de agencias distintas
  (caso 9);
- un usuario de Supabase Auth **sin** agente vinculado (caso 7);
- `SERVICE_AGENT_EMAIL`/`SERVICE_AGENT_PASSWORD` en `.env.local` (caso 11).

Resultado: ✅ pasa · ❌ falla (anotar qué se vio) · ⏸ no se pudo probar (anotar por qué).

| # | Caso | Pasos | Esperado | AC | Resultado | Fecha | Notas |
|---|---|---|---|---|---|---|---|
| 1 | Credenciales correctas | En `/entrar`, correo y contraseña de una cuenta real; "Entrar al panel" | Entra a `/tablero`, con el nombre del agente en el encabezado | 1 | | | |
| 2 | Contraseña mala / correo inexistente | En `/entrar`: (a) correo real con contraseña mala; (b) correo que no existe | El mismo mensaje en los dos casos: "El correo o la contraseña no coinciden." | 1 | | | |
| 3 | URL de lead sin sesión | Sin sesión (incógnito), abrir `/leads/<uuid real>`; entrar | Manda a `/entrar?siguiente=/leads/<uuid>`, y al entrar vuelve a ese lead | 2 | | | |
| 4 | Redirección a otro sitio | Sin sesión, abrir `/entrar?siguiente=https://otro.sitio` y entrar; repetir con `?siguiente=//otro.sitio` | En los dos casos va a `/tablero`, nunca a `otro.sitio` | 2 | | | |
| 5 | La sesión sobrevive | (a) Con sesión, recargar; (b) dejar la pestaña abierta más de 1 h y hacer una acción (abrir un lead, filtrar) | Sigue con sesión en los dos, sin pasar por `/entrar` | 3 | | | |
| 6 | Salir | "Salir" en el encabezado; luego "atrás" en el navegador | Vuelve a `/entrar`, no muestra datos de la agencia | 3 | | | |
| 7 | Usuario sin agente vinculado | Entrar con un usuario de Auth que no está en `core.agent.auth_user_id` | `/entrar` con el aviso "Tu cuenta no está habilitada para ninguna agencia" y la sesión cerrada (recargar `/tablero` vuelve a pedir entrar) | 4 | | | |
| 8 | `AGENT` frente a `TEAM_ADMIN` | Entrar con cada una; revisar un lead abierto, el tablero, el menú, `/embudo` y `/riesgo` | Con `TEAM_ADMIN`: "Reasignar", "A cargo de", filtro por agente, enlaces "Embudo" y "Leads en riesgo". Con `AGENT`: nada de eso, y `/embudo` y `/riesgo` dan 404 | 4 | | | |
| 9 | **Aislamiento** | Agente de la agencia A en un navegador y de la agencia B en otro (o incógnito); recargar `/tablero` en uno y otro de forma intercalada varias veces | Cada uno ve siempre solo su agencia y su nombre en el encabezado | — | | | |
| 10 | API dormido | Con el API sin tráfico 15 min o más, entrar y abrir `/tablero` | Mensaje de espera ("Despertando el servicio…"), no de error | 5 | | | |
| 11 | Pantallas de cliente sin sesión | Sin ninguna sesión (incógnito): 2.1 `/propiedades/<id>/agendar?leadId=<id>`, 2.2 confirmar, 2.3 `/citas/<id>`, 2.5 `/citas/<id>/encuesta` | Funcionan igual que antes, sin pedir entrar | — | | | |
| 12 | Proxy público cerrado | `curl` a `/api/publico/leads`, `/api/publico/leads/<uuid real>`, `/api/publico/listings/<uuid real>`, `/api/publico/me`, `/api/publico/analytics/north-star` | 404 en los cinco | — | ✅ | 2026-10-25 | Ver abajo |
| 13 | Proxy del agente sin cookie | `curl` a `/api/homelitics/me` | 401 | — | ✅ | 2026-10-25 | Ver abajo |

El caso 9 es el que detecta un caché compartido por error. Si alguna vez
aparecen datos cruzados, todavía hay estado de usuario en una variable de
módulo (`CLAUDE.md`, "Nada que dependa del usuario en una variable de
módulo").

## Casos 12 y 13: salida

Servidor con `USE_MOCKS=false` y `NEXT_PUBLIC_USE_MOCKS=false` en
`http://localhost:3001`, `curl` sin cookie. Los UUID son reales (lead
`8d14666e-…` y listing `c34b9fbb-…`, de `docs/PROGRESO.md`).

```
GET /api/publico/leads                                         404  {"detail":"No encontrado"}
GET /api/publico/leads/8d14666e-0ebe-40b5-a8fc-99752135c9eb    404  {"detail":"No encontrado"}
GET /api/publico/listings/c34b9fbb-8d4a-45b8-951a-c8ea585a0afa 404  {"detail":"No encontrado"}
GET /api/publico/me                                            404  {"detail":"No encontrado"}
GET /api/publico/analytics/north-star                          404  {"detail":"No encontrado"}
GET /api/homelitics/me                                         401  {"detail":"Sesión vencida"}
```

Controles, para descartar que el 404 viniera de un proxy caído:

```
GET    /api/publico/health                       200  {"status":"ok","database":"ok","schema":"ok"}
DELETE /api/publico/appointments/<uuid>          404  {"detail":"No encontrado"}
```

El `200` de `/health` confirma además que la cuenta de servicio sirve: el
proxy público pide su token antes de reenviar, y si fallara respondería 502.
