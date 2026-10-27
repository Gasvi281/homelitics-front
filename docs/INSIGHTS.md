# Asistente de insights del administrador

Servicio aparte del API de Homelitics: un agente que responde preguntas sobre
la agencia, los leads, el embudo y la demanda de inmuebles. Este documento es
lo único que el front asume de él, como `docs/API_CONTRACT.md` para el API.

Base: `NEXT_PUBLIC_INSIGHTS_URL` (pública: el navegador le habla directo).

## Endpoints

### `POST /insights/chat`

- Headers: `Authorization: Bearer <access_token de Supabase>`,
  `Content-Type: application/json`.
- Body: `{ "message": string, "conversation_id": string | null }`.
- 200: `{ "reply": string, "conversation_id": string (UUID), "sources": { "tool": string, "endpoint": string, "params": object }[] }`.
  `reply` es markdown en español y puede traer tablas.
- Puede tardar hasta ~60 s. Solo `TEAM_ADMIN`.
- Si el servicio se reinició, devuelve otro `conversation_id`: se adopta.

### `GET /health`

`{ "status": "ok" }`, sin auth. Render (plan gratis) duerme a los ~15 min y la
primera petición tarda ~50 s más; el front lo llama la primera vez que se abre
el panel en la pestaña, para despertarlo.

## Errores (solo por status; el `detail` nunca se muestra)

| Status | Qué hace el front |
|---|---|
| 401 | Pide otro token (la Server Action renueva la cookie) y reintenta una vez; si vuelve, `/entrar?siguiente=…` |
| 403 | Esconde el formulario: "Solo administradores pueden usar el asistente" |
| 422 | Bug del front: `console.error` |
| 502, timeout (65 s), red | "El asistente no está disponible, intenta de nuevo" y el texto vuelve al input |

## Por qué no hay proxy y de dónde sale el token

Las funciones SSR de Amplify cortan antes de los ~60 s que puede tardar el
agente, así que el navegador llama directo (el servicio tiene CORS para el
dominio de Amplify y `localhost:3000`).

La sesión vive en cookies `httpOnly`, así que el navegador no puede leer el
token. Lo entrega la Server Action `tokenInsights()`
(`features/insights/acciones.ts`): solo a un `TEAM_ADMIN` confirmado con
GET /me, justo antes de cada mensaje, y el front lo deja en memoria (nunca en
storage). Es la única excepción a "el token jamás llega al navegador".

## Dónde vive en el front

- `lib/insights/client.ts`: `askInsights`, `pingHealth`, `InsightsError`, zod.
- `features/insights/hooks.ts`: `useInsightsChat` (reintento del 401,
  clasificación de errores, un mensaje en vuelo).
- `features/insights/InsightsProvider.tsx`: estado y `sessionStorage`
  (`homelitics.insights`).
- `features/insights/components/`: botón flotante, panel y burbujas.
- `app/(agente)/layout.tsx` monta todo solo si el agente es `TEAM_ADMIN`.
