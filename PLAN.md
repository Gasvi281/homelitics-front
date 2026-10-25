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

Lista inicial (sacada de `lib/homelitics-nucleo.ts`; **confirmar con el grep de
arriba** qué usa realmente cada pantalla y recortar lo que sobre):

| Método | Ruta | Pantalla |
|---|---|---|
| GET | `/health` | `/entrar` (despertar) |
| GET | `/listings/{id}` | 2.1 |
| GET | `/leads/{id}` | 2.1 (el agente correcto es el del lead) |
| GET | `/agents/{id}/slots` | 2.1 |
| POST | `/leads/{id}/appointments` | 2.2 |
| GET | `/appointments/{id}` | 2.3, 2.5 |
| PATCH | `/appointments/{id}` | 2.3, parche de 2.5 |
| GET, POST | `/appointments/{id}/feedback` | 2.5 |

Las rutas se validan con expresiones regulares ancladas (`^...$`) y los `{id}`
deben ser UUID. Nunca abrir `/leads` (lista), `/me`, `/analytics/*`,
`/interactions` ni `/transitions`.

### Riesgo que se acepta y se documenta

- `GET /leads/{id}` por el proxy público devuelve datos del lead a quien tenga
  el UUID. Hoy pasa exactamente lo mismo (el enlace es el control de acceso),
  así que **no empeora**, pero queda escrito.
- La cuenta de servicio pertenece a **una** agencia: un cliente de otra agencia
  verá 404. También pasa hoy.
- Ambos puntos van a "Bloqueos" en `docs/SPRINT_LINEA2.md`, con la solución de
  fondo: endpoints públicos en el API con un token firmado en el enlace (L1).

**Done:** con las cookies borradas (sin agente), las pantallas 2.1–2.5 funcionan
igual que antes; `curl /api/publico/leads` y `curl /api/publico/me` dan 404.

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

- [ ] `.env.example`, README y `CLAUDE.md`: `DEMO_AGENT_*` → `SERVICE_AGENT_*`,
      con la explicación de que solo la usa `/api/publico`.
- [ ] `CLAUDE.md`: la tabla de etapas marca la 2 como actual; agregar la regla
      "nada que dependa del usuario en variables de módulo"; documentar
      `api` frente a `apiPublico` y los dos proxies.
- [ ] `docs/API_CONTRACT.md` §4: cambiar la fila "Token vencido | 401 | Renovar
      y reintentar una vez" por "401 → la sesión no es válida: volver a
      `/entrar`". Agregar el 403 de `/me` como "cuenta sin agencia".
- [ ] `docs/SPRINT_LINEA2.md`: los dos riesgos de la fase 6 en "Bloqueos".
- [ ] `docs/PROGRESO.md`: entrada final.
- [ ] Comprobación: `grep -rn "^let \|^var " lib/ app/` en archivos
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
| 12 | `curl` a `/api/publico/leads`, `/api/publico/me`, `/api/publico/analytics/north-star` | 404 | — |
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
