# HU-23 — Login del agente (etapa 2 de `lib/session.ts`)

## Contexto

Hoy todo el front usa **un agente demo**: `lib/session.ts` pide un token a
Supabase con `DEMO_AGENT_EMAIL`/`DEMO_AGENT_PASSWORD` y lo cachea en una
variable de módulo. Cualquiera que abra una URL de `(agente)` ve los datos de
ese agente, y la regla "solo `TEAM_ADMIN` reasigna" (HU-08) no se puede probar.

Las cuentas de agente **las crea un servicio del administrador** (no hay
registro público, ni recuperación de contraseña desde el front). El API valida
el JWT contra el mismo proyecto de Supabase y resuelve el agente con
`core.agent.auth_user_id`, así que **no hay que tocar el backend**.

### Decisiones tomadas

| Tema | Decisión |
|---|---|
| Estructura del login | **Opción A**: sesión 100 % del lado del servidor con `@supabase/ssr`, cookies `httpOnly`, login por Server Action, `middleware.ts` que renueva y protege. El token nunca llega al JavaScript del navegador. |
| Pantallas de `(cliente)` (no tienen sesión) | **Opción 6.1**: cuenta de servicio limitada. La credencial compartida sobrevive, renombrada, y solo la usa un proxy público aparte (`/api/publico/*`) con lista blanca de endpoints. |
| Endpoints públicos en el API | Deuda técnica documentada, no este sprint. |

### Criterios de aceptación (HU-23)

- **AC1** Login en `/entrar` con correo y contraseña → tablero. Error genérico si falla.
- **AC2** Ruta de agente sin sesión → `/entrar`, y después de entrar vuelve a la ruta pedida.
- **AC3** La sesión sobrevive recargas y se renueva sola; si no se puede, vuelve a `/entrar`. Botón "Salir".
- **AC4** `GET /me` tras entrar: 403 → "Tu cuenta no está habilitada para ninguna agencia" y cierre de sesión. El `role` controla lo que solo ve un `TEAM_ADMIN`.
- **AC5** Mientras el API despierta (30–60 s), estado de espera, no error.

## Reglas para quien implemente

- Lee primero `CLAUDE.md`, `docs/API_CONTRACT.md` y este archivo.
- **Una fase por cambio.** Al terminar cada una: `npm run type-check`,
  `npm run lint` y una línea en `docs/PROGRESO.md`.
- No se agregan dependencias: `@supabase/ssr` y `@supabase/supabase-js` ya
  están instaladas y aprobadas.
- **Ninguna variable de módulo puede guardar algo que dependa del usuario**
  (token, agente, rol). El módulo lo comparten todas las peticiones del
  servidor: un caché así le daría a un agente el token de otro y le mostraría
  otra agencia. Para no repetir trabajo dentro de una misma petición, usa
  `cache()` de React.
- La única excepción es la credencial de servicio (fase 6), porque es una sola
  identidad compartida a propósito, y vive en su propio archivo.

---

## Fase 0 — Verificaciones previas (sin código)

- [ ] Confirmar con quien administra Supabase que **"Allow new users to sign
      up" está apagado** (Authentication → Sign In / Providers). La anon key es
      pública; con el registro abierto cualquiera puede crearse un usuario.
- [ ] Confirmar que el servicio del administrador, al crear un usuario,
      también llena `core.agent.auth_user_id`. Si no, ese agente recibe 403.
- [ ] Conseguir dos cuentas de prueba: un `TEAM_ADMIN` y un `AGENT`, idealmente
      de **agencias distintas** (para la prueba de aislamiento de la fase 9).
- [ ] Decidir qué cuenta será la de servicio de la fase 6. Debe ser un `AGENT`
      (no `TEAM_ADMIN`): es la credencial con menos privilegios que sirve.
- [ ] Listar las URLs reales de `app/(agente)/` y `app/(cliente)/` (los grupos
      entre paréntesis no aparecen en la URL). La fase 1 las necesita.

**Done:** las cinco casillas resueltas y anotadas en `docs/PROGRESO.md`.

---

## Fase 1 — Infraestructura de sesión

### `lib/supabase/servidor.ts` (nuevo)

Fábrica de un cliente de Supabase atado a las cookies **de la petición
actual**. Se crea uno nuevo en cada llamada; no es un singleton.

```ts
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function crearClienteServidor() {
  const almacen = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => almacen.getAll(),
        setAll: (lista) => {
          try {
            lista.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Un Server Component no puede escribir cookies; el middleware renueva.
          }
        },
      },
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      },
    },
  );
}
```

### `middleware.ts` (nuevo, en la raíz)

1. Crea un `createServerClient` que lee de `request.cookies` y escribe en la
   respuesta (patrón `updateSession` de la documentación de `@supabase/ssr`).
2. Llama `supabase.auth.getClaims()`. Esto **verifica** el JWT y renueva la
   sesión si está por vencer. No uses `getSession()` aquí: no verifica la firma
   y una cookie fabricada a mano pasaría la protección.
3. Política **cerrada por defecto**: toda ruta exige sesión salvo la lista
   pública:
   - `/entrar`
   - los prefijos de `(cliente)` (p. ej. `/propiedades`, `/citas`; confirmar en la fase 0)
   - `/api/publico/*`
   - `/api/homelitics/*` (responde su propio 401, no redirige)
4. Sin sesión en una ruta protegida → `302 /entrar?siguiente=<ruta+query>`.
5. Con sesión en `/entrar` → `302` al tablero.
6. Con `USE_MOCKS=true` → deja pasar todo (fase 7).

`matcher`: todo menos `_next/static`, `_next/image`, `favicon.ico` y archivos
con extensión.

### `lib/redireccion.ts` (nuevo)

`rutaSegura(siguiente: string | null): string` — acepta solo rutas que empiezan
con `/` y **no** con `//` ni `/\`. Cualquier otra cosa devuelve la ruta del
tablero. Lo usan el middleware y la Server Action de login (evita redirecciones
a sitios externos).

**Done:** sin sesión, abrir una URL de agente lleva a `/entrar?siguiente=...`;
las URLs de cliente abren normal.

---

## Fase 2 — `lib/session.ts` a la etapa 2

Reescribir el archivo completo:

```ts
import "server-only";
import { cache } from "react";
import { crearClienteServidor } from "./supabase/servidor";
import { HomeliticsError } from "./errores";

/**
 * Etapa 2: la credencial sale de la cookie de la petición actual.
 * NO la guardes en una variable de módulo (ver PLAN.md, "Reglas").
 * `cache()` memoriza solo durante un render; cada petición empieza vacía.
 */
const obtenerToken = cache(async (): Promise<string> => {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    throw new HomeliticsError("no_autenticado", "No hay una sesión activa.");
  }
  return data.session.access_token;
});

export async function getAuthHeader(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await obtenerToken()}` };
}
```

Aquí `getSession()` sí es correcto: el token solo se **reenvía** al API, que
verifica la firma por su cuenta. El middleware ya hizo la verificación para las
decisiones del front.

Se eliminan: `cached`, `SKEW_MS`, `invalidateToken()` y el `fetch` a
`/auth/v1/token`.

### Proxy `app/api/homelitics/[...path]/route.ts`

- Quitar el reintento tras 401 y el import de `invalidateToken`.
- Atrapar el error de `getAuthHeader()` y responder
  `401 {"detail":"Sesión vencida"}` en lugar de dejar caer un 500.
- Un 401 del API se devuelve tal cual.

### Lado cliente

- En el `QueryClient` (donde se configure React Query), un `onError` global:
  si el error es `HomeliticsError` con `kind === "no_autenticado"`,
  `window.location.assign("/entrar?siguiente=" + ruta actual)`.

**Done:** con sesión, las pantallas de agente cargan con datos del agente que
entró; al borrar las cookies a mano, la siguiente acción manda a `/entrar`.

---

## Fase 3 — Pantalla `/entrar`

Archivos: `app/entrar/page.tsx`, `app/entrar/acciones.ts`,
`components/FormularioEntrar.tsx`.

- **Server Action `entrar(formData)`**: valida con zod (correo y contraseña no
  vacíos), llama `signInWithPassword`, y si sale bien
  `redirect(rutaSegura(siguiente))`.
- Si falla, devuelve **un solo mensaje**: "El correo o la contraseña no
  coinciden." Nunca distinguir cuál de los dos estaba mal (AC1).
- **Formulario** (Client Component) con `useActionState`: botón "Entrar al
  panel", deshabilitado mientras envía.
- Sin "Crear cuenta" ni "Olvidé mi contraseña". En su lugar: "Si no tienes
  acceso o olvidaste tu contraseña, pídelo al administrador de tu agencia."
- Si llega `?error=sin-agencia`, mostrar el aviso del AC4 (usar `components/Aviso.tsx`).
- **Despertar el API**: al montar la página, un `fetch("/api/publico/health")`
  sin esperar respuesta. Mientras el agente escribe, Render arranca.
- **Server Action `salir()`**: `signOut()` y `redirect("/entrar")`. Puede vivir
  en el mismo `acciones.ts`.

Copys en español de Colombia, tono llano, como pide `CLAUDE.md`.

**Done:** AC1 cumplido con las dos cuentas de prueba.

---

## Fase 4 — Layout de `(agente)`: identidad y rol

### `lib/agente-actual.ts` (nuevo, `server-only`)

```ts
export const obtenerAgente = cache(async () => api.yo());
```

### `app/(agente)/layout.tsx`

Reemplaza el `TODO`:

1. `const agente = await obtenerAgente()`.
2. Si lanza `HomeliticsError` con `kind === "sin_permiso"` (403: usuario de Auth
   sin agente vinculado) → cerrar sesión y `redirect("/entrar?error=sin-agencia")`.
3. Si lanza `no_autenticado` → `redirect("/entrar")`.
4. Renderiza un encabezado con `agente.full_name` y el botón "Salir", y envuelve
   `children` en `<AgenteProvider agente={{ id, nombre, rol, agenciaId }}>`.

Ojo: cerrar sesión necesita escribir cookies, y un Server Component no puede.
Redirigir a un route handler `app/entrar/salir/route.ts` que haga `signOut()`
y luego mande a `/entrar?error=sin-agencia`.

### `components/AgenteProvider.tsx` (nuevo, `"use client"`)

Contexto con `{ id, nombre, rol, agenciaId }` y el hook `useAgente()`. **Solo
datos de `/me`, nunca el token.**

### `app/(agente)/loading.tsx`

"Despertando el servicio… puede tardar hasta un minuto la primera vez." (AC5)

**Done:** AC3 y AC4 cumplidos; el encabezado muestra el nombre correcto con cada cuenta.

---

## Fase 5 — Permisos por rol en la UI

- **HU-08**: el control de reasignar solo se renderiza si `useAgente().rol === "TEAM_ADMIN"`.
- **HU-13 y HU-17**: sus rutas verifican `obtenerAgente()` en el servidor; si el
  rol no es `TEAM_ADMIN` → `notFound()` (misma convención 404 del API).
- Es solo experiencia de usuario: el API ya aplica los permisos. No duplicar
  lógica de autorización.

**Done:** con el `AGENT` no aparece reasignar ni las vistas de administrador;
con el `TEAM_ADMIN` sí.

---

## Fase 6 — Cuenta de servicio para `(cliente)`

Las pantallas de cliente (2.1, 2.2, 2.3, 2.5) usan el API **desde dos lados**:
Server Components (vía `lib/homelitics.ts`) y Client Components (vía el proxy).
Los dos lados necesitan la credencial de servicio.

### `lib/credencial-servicio.ts` (nuevo, `server-only`)

Es el código de la etapa 1, movido aquí casi tal cual: password grant con
`SERVICE_AGENT_EMAIL`/`SERVICE_AGENT_PASSWORD` y caché en variable de módulo.
Aquí el caché **sí es correcto**: una sola identidad compartida a propósito.
Dejarlo dicho en el comentario del archivo. Exporta `getServiceAuthHeader()` e
`invalidarTokenServicio()` (el reintento tras 401 sí aplica aquí).

### Clientes del API: separar agente y público

En `lib/homelitics-nucleo.ts` no cambia nada: `crearPedir` ya recibe
`urlPara` y `credenciales`. Se crean dos instancias:

| Archivo | Exporta | URL | Credencial |
|---|---|---|---|
| `lib/homelitics.ts` | `api` | API directo | `getAuthHeader()` (cookie del agente) |
| `lib/homelitics.ts` | `apiPublico` | API directo | `getServiceAuthHeader()` |
| `lib/homelitics-navegador.ts` | `api` | `/api/homelitics` | ninguna (la pone el proxy) |
| `lib/homelitics-navegador.ts` | `apiPublico` | `/api/publico` | ninguna (la pone el proxy) |

Cambiar **todas** las importaciones dentro de `app/(cliente)/` y de los
componentes que solo usa el cliente (`GrillaHorarios`, `EncuestaFlujo`,
`EncuestaAcciones`, etc.) de `api` a `apiPublico`. Buscar con
`grep -rn "api\." app/\(cliente\) components/`.

### `app/api/publico/[...path]/route.ts` (nuevo)

Igual al proxy actual, con dos diferencias:

1. Usa `getServiceAuthHeader()`.
2. **Lista blanca** de método + ruta. Todo lo demás → `404`.

Lista confirmada con el reconocimiento de la fase 0 (ver "Reconocimiento
(fase 0)", punto 2). Solo entra lo que llama un **Client Component**: los
Server Components usan `apiPublico` directo contra el API y no pasan por
este proxy.

| Método | Ruta | Pantalla |
|---|---|---|
| GET | `/health` | `/entrar` (despertar) |
| GET | `/agents/{id}/slots` | 2.1, 2.3 |
| POST | `/leads/{id}/appointments` | 2.2 |
| GET | `/appointments/{id}` | 2.3, 2.5 |
| PATCH | `/appointments/{id}` | 2.3, parche de 2.5 |
| GET, POST | `/appointments/{id}/feedback` | 2.5 |

Las rutas se validan con expresiones regulares ancladas (`^...$`) y los `{id}`
deben ser UUID. Nunca abrir `/leads` (lista), `/leads/{id}`,
`/listings/{id}`, `/me`, `/analytics/*`, `/interactions` ni `/transitions`.

GET `/listings/{id}` y GET `/leads/{id}` estaban en la lista inicial y se
quitaron (2026-10-25): las pantallas 2.1, 2.2 y 2.3 los piden solo desde Server
Components. Si una fase posterior los necesita desde el navegador, se agregan
entonces y vuelve el riesgo de abajo.

### Riesgo que se acepta y se documenta

- La cuenta de servicio pertenece a **una** agencia: un cliente de otra agencia
  verá 404. También pasa hoy.
- Quien tenga el UUID de un lead, una propiedad o una cita sigue viendo **lo que
  la página renderiza** con él (dirección, horario, nombre del agente): el
  enlace es el control de acceso, igual que hoy. Lo que ya no puede es leer el
  `LeadOut` crudo de `GET /leads/{id}` desde el navegador. Con un UUID de cita
  sí puede leer, cancelar o mover esa cita por el proxy, como hoy.
- Ambos puntos van a "Bloqueos" en `docs/SPRINT_LINEA2.md`, con la solución de
  fondo: endpoints públicos en el API con un token firmado en el enlace (L1).

**Done:** con las cookies borradas (sin agente), las pantallas 2.1–2.5 funcionan
igual que antes; `curl /api/publico/leads`, `curl /api/publico/me` y
`curl /api/publico/leads/<uuid real>` dan 404.

---

## Fase 7 — Modo mocks

- Con `USE_MOCKS=true` el middleware no exige sesión.
- `api.yo()` ya responde el agente del mock. Agregar `MOCK_AGENT_ROLE`
  (`AGENT` | `TEAM_ADMIN`, por defecto `TEAM_ADMIN`) para probar las dos
  variantes de la UI sin credenciales.
- `/entrar` en modo mocks redirige directo al tablero.

**Done:** `USE_MOCKS=true` sin ninguna credencial sigue levantando toda la app.

---

## Fase 8 — Limpieza y documentación

- [x] `.env.example`, README y `CLAUDE.md`: `DEMO_AGENT_*` → `SERVICE_AGENT_*`,
      con la explicación de que solo la usa `/api/publico`.
- [x] `CLAUDE.md`: la tabla de etapas marca la 2 como actual; agregar la regla
      "nada que dependa del usuario en variables de módulo"; documentar
      `api` frente a `apiPublico` y los dos proxies.
- [x] `docs/API_CONTRACT.md` §4: cambiar la fila "Token vencido | 401 | Renovar
      y reintentar una vez" por "401 → la sesión no es válida: volver a
      `/entrar`". Agregar el 403 de `/me` como "cuenta sin agencia".
- [x] `docs/SPRINT_LINEA2.md`: los dos riesgos de la fase 6 en "Bloqueos".
- [x] `docs/PROGRESO.md`: entrada final.
- [x] Comprobación: `grep -rn "^let \|^var " lib/ app/` en archivos
      `server-only`; el único resultado permitido es `lib/credencial-servicio.ts`
      (y `lib/mock/`, que es estado de desarrollo).

---

## Fase 9 — Pruebas manuales

Con `USE_MOCKS=false`. Recordar que todo lo que se escribe es real (README,
punto 7).

| # | Caso | Esperado | AC |
|---|---|---|---|
| 1 | Credenciales correctas | Entra al tablero | 1 |
| 2 | Contraseña mala / correo inexistente | El mismo mensaje en los dos casos | 1 |
| 3 | Abrir una URL de lead sin sesión | `/entrar`, y al entrar vuelve a esa URL | 2 |
| 4 | `/entrar?siguiente=https://otro.sitio` y `?siguiente=//otro.sitio` | Va al tablero | 2 |
| 5 | Recargar; dejar la pestaña abierta más de 1 h y usarla | Sigue con sesión | 3 |
| 6 | "Salir" y luego "atrás" en el navegador | Vuelve a `/entrar` | 3 |
| 7 | Usuario de Auth sin agente vinculado | Aviso de cuenta no habilitada, sesión cerrada | 4 |
| 8 | `AGENT` frente a `TEAM_ADMIN` | Reasignar y vistas de admin solo para el admin | 4 |
| 9 | **Aislamiento**: agente de agencia A en un navegador y de agencia B en otro (o incógnito), recargando de forma intercalada | Cada uno ve siempre solo su agencia | — |
| 10 | Primera petición con el API dormido | Mensaje de espera, no de error | 5 |
| 11 | Pantallas 2.1–2.5 sin ninguna sesión de agente | Funcionan igual que antes | — |
| 12 | `curl` a `/api/publico/leads`, `/api/publico/leads/<uuid real>`, `/api/publico/listings/<uuid real>`, `/api/publico/me`, `/api/publico/analytics/north-star` | 404 | — |
| 13 | `curl` a `/api/homelitics/me` sin cookie | 401 | — |

El caso 9 es el que detecta un caché compartido por error. Si alguna vez
aparecen datos cruzados, todavía hay estado de usuario en una variable de módulo.

---

## Mapa de archivos

| Archivo | Fase | Cambio |
|---|---|---|
| `lib/supabase/servidor.ts` | 1 | nuevo |
| `middleware.ts` | 1 | nuevo |
| `lib/redireccion.ts` | 1 | nuevo |
| `lib/session.ts` | 2 | reescrito |
| `app/api/homelitics/[...path]/route.ts` | 2 | sin reintento, 401 limpio |
| Proveedor de React Query | 2 | `onError` → `/entrar` |
| `app/entrar/page.tsx`, `acciones.ts`, `salir/route.ts` | 3, 4 | nuevos |
| `components/FormularioEntrar.tsx` | 3 | nuevo |
| `lib/agente-actual.ts` | 4 | nuevo |
| `components/AgenteProvider.tsx` | 4 | nuevo |
| `app/(agente)/layout.tsx`, `loading.tsx` | 4 | `TODO` resuelto |
| Control de reasignar (HU-08), rutas HU-13/HU-17 | 5 | condicionados al rol |
| `lib/credencial-servicio.ts` | 6 | nuevo (código de la etapa 1) |
| `lib/homelitics.ts`, `lib/homelitics-navegador.ts` | 6 | + `apiPublico` |
| `app/api/publico/[...path]/route.ts` | 6 | nuevo, lista blanca |
| Pantallas y componentes de `(cliente)` | 6 | `api` → `apiPublico` |
| `lib/mock/` | 7 | `MOCK_AGENT_ROLE` |
| `.env.example`, README, `CLAUDE.md`, `docs/*` | 8 | actualizados |

## Orden sugerido y dependencias

```
0 → 1 → 2 → 3 → 4 → 5
          ↘ 6 (antes de borrar DEMO_AGENT_*; puede ir en paralelo con 3–5)
               → 7 → 8 → 9
```

La fase 6 tiene que estar lista **antes** de que la fase 2 llegue a `main`: en
cuanto `lib/session.ts` deja de usar el agente demo, las pantallas de cliente
se rompen si todavía no existe `apiPublico`. Lo más seguro es hacer 2 y 6 en la
misma rama.

---

## Reconocimiento (fase 0)

Hecho el 2026-10-25 leyendo el código de `feat/Sprint7` (commit `aa8a541`),
sin cambiar ningún archivo de código. Cubre solo la última casilla de la
fase 0 y lo que necesitan las fases 1, 2, 5 y 6; las cuatro casillas de
Supabase y cuentas siguen abiertas.

### 1. URLs reales (para la lista pública del middleware)

| Grupo | Archivo | URL |
|---|---|---|
| `(cliente)` | `propiedades/[listingId]/agendar/page.tsx` | `/propiedades/{listingId}/agendar?leadId=…` (2.1) |
| `(cliente)` | `propiedades/[listingId]/agendar/confirmar/page.tsx` | `/propiedades/{listingId}/agendar/confirmar?…` (2.2) |
| `(cliente)` | `citas/[appointmentId]/page.tsx` | `/citas/{appointmentId}` (2.3) |
| `(cliente)` | `citas/[appointmentId]/encuesta/page.tsx` | `/citas/{appointmentId}/encuesta` (2.5) |
| `(agente)` | `tablero/page.tsx` | `/tablero` (HU-06) |
| `(agente)` | `leads/[leadId]/page.tsx` | `/leads/{leadId}` (2.4, HU-08, HU-11, HU-12) |
| `(agente)` | `embudo/page.tsx` | `/embudo` (HU-17) |
| `(agente)` | `riesgo/page.tsx` | `/riesgo` (HU-13) |

Fuera de los dos grupos:

| URL | Qué es | Propuesta para el middleware |
|---|---|---|
| `/` | `app/page.tsx`, "en construcción" | protegida por defecto (o redirigir a `/tablero`); no hace falta abrirla |
| `/dev/explorar` | herramienta de desarrollo, llama `api.yo()` y `api.leads()` | **protegida**: hoy no tiene ninguna guarda y lista leads de la agencia |
| `/api/mocktest` | casos de prueba de los mocks, usa `api` | **protegida** (mismo motivo) |
| `/api/homelitics/*` | proxy del agente | pasa sin redirigir; responde su propio 401 |
| `/entrar`, `/api/publico/*` | todavía no existen (fases 3 y 6) | públicas |

**Lista pública resultante:** `/entrar`, prefijo `/propiedades/`, prefijo
`/citas/`, `/api/publico/` y `/api/homelitics/` (este último sin
redirección). Ninguna ruta de `(agente)` empieza por `/propiedades` ni por
`/citas`, así que basta con comparar el prefijo.

### 2. Usos de `api.` en `(cliente)` y en sus componentes

Componentes que **solo** usa `(cliente)` (comprobado con grep de sus
imports): `CitaAcciones`, `ConfirmarCitaAcciones`, `EncuestaFlujo`,
`EncuestaAcciones`, `FichaPropiedad`, `GrillaHorarios`, `SelectorNuevoHorario`.
`Aviso` y `TarjetaCita` se comparten con `(agente)` pero no llaman al API.

**Server Components** (importan `api` de `lib/homelitics.ts`, van directo al
API, **no pasan por ningún proxy**):

| Archivo | Llamada | Método y ruta |
|---|---|---|
| `propiedades/[listingId]/agendar/page.tsx:43` | `api.listing`, `api.lead` | GET `/listings/{id}`, GET `/leads/{id}` |
| `propiedades/[listingId]/agendar/confirmar/page.tsx:59` | `api.listing`, `api.lead` | GET `/listings/{id}`, GET `/leads/{id}` |
| `citas/[appointmentId]/page.tsx:30-32` | `api.cita`, `api.lead`, `api.listing` | GET `/appointments/{id}`, GET `/leads/{id}`, GET `/listings/{id}` |
| `citas/[appointmentId]/encuesta/page.tsx:27` | `api.cita` | GET `/appointments/{id}` |

**Client Components** (importan `api` de `lib/homelitics-navegador.ts`,
pasan por el proxy):

| Archivo | Llamada | Método y ruta |
|---|---|---|
| `GrillaHorarios.tsx:48` | `api.slots` | GET `/agents/{id}/slots?from&to` |
| `SelectorNuevoHorario.tsx:47` | `api.slots` | GET `/agents/{id}/slots?from&to` |
| `ConfirmarCitaAcciones.tsx:77` | `api.crearCita` | POST `/leads/{id}/appointments` |
| `CitaAcciones.tsx:52` | `api.cita` (relee cada 5 s) | GET `/appointments/{id}` |
| `CitaAcciones.tsx:84, 97` | `api.actualizarCita` | PATCH `/appointments/{id}` |
| `EncuestaFlujo.tsx:40` | `api.actualizarCita` (parche `COMPLETED`) | PATCH `/appointments/{id}` |
| `EncuestaFlujo.tsx:89` | `api.feedbackDeCita` | GET `/appointments/{id}/feedback` |
| `EncuestaAcciones.tsx:50` | `api.enviarEncuesta` | POST `/appointments/{id}/feedback` |

Ojo: `api.slots` **no aparece** con `grep "api\."` porque está partido en dos
líneas (`api` / `.slots(...)`). En la fase 6, cambiar los imports y buscar
por el import (`from "@/lib/homelitics`), no por `api.`.

**Comparación con la lista blanca de la fase 6.** La lista blanca solo
filtra lo que pasa por `/api/publico/*`, es decir, las llamadas de Client
Components. Las de Server Components van directo al API con `apiPublico` y
no la atraviesan.

| Fila de la lista | ¿Quién la usa por el proxy? | Veredicto |
|---|---|---|
| GET `/health` | nadie hoy; la usará `/entrar` (fase 3) | se queda |
| GET `/listings/{id}` | **nadie**: solo Server Components | **sobra** en el proxy |
| GET `/leads/{id}` | **nadie**: solo Server Components | **sobra** en el proxy |
| GET `/agents/{id}/slots` | `GrillaHorarios`, `SelectorNuevoHorario` | se queda |
| POST `/leads/{id}/appointments` | `ConfirmarCitaAcciones` | se queda |
| GET `/appointments/{id}` | `CitaAcciones` | se queda |
| PATCH `/appointments/{id}` | `CitaAcciones`, `EncuestaFlujo` | se queda |
| GET, POST `/appointments/{id}/feedback` | `EncuestaFlujo`, `EncuestaAcciones` | se queda |

**Falta:** nada. Ninguna llamada del cliente queda fuera de la lista.

**Aplicado el 2026-10-25:** GET `/listings/{id}` y GET `/leads/{id}` salieron
de la lista blanca de la fase 6 (los Server Components las siguen haciendo
con `apiPublico`), y la sección de riesgos aceptados se ajustó: ya no se
puede leer el `LeadOut` crudo desde el navegador con solo el UUID.

### 3. Dónde se crea el `QueryClient`

- **El del navegador**: `app/providers.tsx:24-26`, dentro de `Providers`,
  con `useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }))`.
  Ahí va el `onError` de la fase 2.
- Además, cuatro páginas de `(agente)` crean un `QueryClient` **por
  petición, en el servidor**, solo para precargar y deshidratar:
  `tablero/page.tsx:43`, `leads/[leadId]/page.tsx:61`, `embudo/page.tsx:50`
  y `riesgo/page.tsx:56`. Esos no llevan `onError` (corren en el servidor;
  ahí el `no_autenticado` lo resuelve el layout de la fase 4).

Dos cosas para la fase 2:
- La versión instalada es `@tanstack/react-query` **5.102.8**. En la v5
  `defaultOptions.queries` ya no acepta `onError`: el manejador global va en
  `new QueryClient({ queryCache: new QueryCache({ onError }), mutationCache: new MutationCache({ onError }) })`.
- No todo pasa por React Query. Del lado agente hay llamadas directas que el
  `onError` global **no** ve: `components/HistorialLead.tsx:68`
  (`api.crearInteraccion` con `await`) y
  `features/embudo/components/ExportarEmbudo.tsx:39` (`api.embudoCsv`). Esas
  tienen que tratar `no_autenticado` en su propio `catch`, o la redirección
  se pone en `lib/homelitics-navegador.ts` (un solo punto). Del lado cliente
  las llamadas directas (`GrillaHorarios`, `SelectorNuevoHorario`,
  `ConfirmarCitaAcciones`, `EncuestaFlujo`, `EncuestaAcciones`) usarán
  `apiPublico`, que no depende de la sesión del agente.

### 4. Reasignar (HU-08) y rutas de HU-13 y HU-17

Ya existen, y **ya están condicionados al rol** con la identidad de `/me`:

| Qué | Dónde | Control actual |
|---|---|---|
| Reasignar, HU-08 | `features/reasignar/components/ReasignarLead.tsx` (+ `ModalReasignar.tsx`, `hooks.ts`), montado en `components/EtapaLead.tsx:64` | `{esAdmin && <ReasignarLead … />}` con `useEsAdmin()` |
| Tarjeta del tablero | `features/tablero-leads/components/TarjetaLead.tsx:53` | `useEsAdmin()` |
| Filtro por agente del tablero | `features/tablero-leads/components/FiltrosTablero.tsx:49` | `role === "TEAM_ADMIN"` |
| HU-17, embudo | `app/(agente)/embudo/page.tsx` (+ `features/embudo/`) | si `/me` dice que no es admin, pinta `Aviso` "solo para administradores" (`:38`) |
| HU-13, riesgo por agente | `app/(agente)/riesgo/page.tsx` (+ `features/riesgo/`) | mismo `Aviso` (`:44`) |
| Enlaces del header | `app/(agente)/layout.tsx:40-61` | `esAdmin` esconde "Embudo" y "Leads en riesgo" |

Piezas que el plan da por nuevas y **ya existen** con otro nombre:

| El plan dice (fase 4) | Ya existe |
|---|---|
| `lib/agente-actual.ts` con `obtenerAgente = cache(() => api.yo())` | `lib/agente-actual.ts` con `obtenerAgenteActual = cache(() => api.yo())`, `server-only` |
| `components/AgenteProvider.tsx` con `useAgente()` | `features/agentes/AgenteActual.tsx`: `AgenteActualProvider`, `useAgenteActual()` y `useEsAdmin()`; recibe el `Agent` de `/me`, sin token |

Consecuencias para las fases 4 y 5:
- **Fase 4**: reutilizar esos dos archivos en vez de crear otros. Lo que
  cambia es el manejo de errores del layout: hoy atrapa cualquier error de
  `/me` y sigue con `agente = null`; la fase 4 tiene que distinguir
  `sin_permiso` (→ `/entrar/salir`) y `no_autenticado` (→ `/entrar`) y solo
  dejar pasar con `null` el caso del API dormido. El `TODO` a reemplazar está
  en `app/(agente)/layout.tsx:13-21`.
- **Fase 5**: el control de reasignar ya cumple. Para HU-13 y HU-17 la única
  diferencia con el plan es que hoy muestran un `Aviso` en vez de
  `notFound()`, y que con `/me` caído **se intenta igual** (el API decide
  con 403). Falta decidir si se cambia a `notFound()` o se deja el aviso.
