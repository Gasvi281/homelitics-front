# homelitics-web

Front web del sistema Homelitics. Repo aparte del API. Next.js 15 (App Router) +
TypeScript. Es la **línea 2** del Sprint 4 de un proyecto universitario de tres
personas: L1 trabaja el backend/calendario, L2 (este repo) las interfaces, L3 el
bot de Telegram y el agente conversacional.

Antes de escribir código lee, en este orden:

1. `docs/API_CONTRACT.md` — lo único que se puede asumir del API. Si algo no está
   ahí, **no existe**: no inventes endpoints ni campos.
2. `docs/SPRINT_LINEA2.md` — las tareas 2.0 a 2.6, sus criterios de "done" y las
   cinco pantallas con su contenido.
3. `docs/SPRINT_E3_LINEA2.md` — **obligatorio para las tareas 2.13 en
   adelante** (épica E3: HU-10 a HU-13). Sus tareas, criterios de "done" y
   los bloqueos 8 a 14, que continúan los de `docs/SPRINT_LINEA2.md`.

## La regla que más importa

El API **ya existe y no lo controlamos**. Vive en otro repositorio
(`Luisrrodriguezg/homelitics-crm`) y lo mantiene otra persona. Cualquier campo,
endpoint o código de error que no esté en `docs/API_CONTRACT.md` hay que
verificarlo contra `https://homelitics-api.onrender.com/openapi.json` antes de
usarlo, y si se confirma, **agregarlo a ese documento en el mismo cambio**.

Si un requisito de una pantalla no se puede cumplir con el API que hay, no lo
resuelvas inventando: escríbelo en la sección "Bloqueos" de
`docs/SPRINT_LINEA2.md` y deja la pantalla funcionando con datos de `lib/mock/`.

## Arquitectura

Dos grupos de rutas, una sola app:

```
app/
  (cliente)/   quien busca vivienda. Sin sesión.
  (agente)/    quien gestiona leads. Su layout exige sesión.
  entrar/      login del agente (Supabase, Server Action) y entrar/salir
  api/homelitics/[...path]/route.ts   el proxy del agente (token de la cookie)
  api/publico/[...path]/route.ts      el proxy de cliente (cuenta de servicio,
                                      lista blanca)
middleware.ts  exige sesión salvo en las rutas públicas y la renueva
lib/
  session.ts             la credencial del agente: la cookie de la petición
  credencial-servicio.ts la credencial de la cuenta de servicio
  supabase/servidor.ts   cliente de Supabase atado a las cookies de la petición
  redireccion.ts         rutaSegura() para el ?siguiente= del login
  homelitics.ts           cliente HTTP para Server Components: pega al API
                          directo; `api` con lib/session.ts, `apiPublico`
                          con lib/credencial-servicio.ts
  homelitics-navegador.ts cliente HTTP para Client Components ("use client"):
                          pega a los proxies, sin credencial
  homelitics-nucleo.ts    lo que comparten los dos: fetch+zod+traducción de
                          errores y la lista completa de operaciones del API
  errores.ts              HomeliticsError y su `kind`, sin dependencias
  schemas.ts     zod, la forma de las respuestas
  format.ts      pesos colombianos y horas de Bogotá
  mock/          datos falsos con la MISMA forma que los reales
components/
```

**El navegador nunca le habla al API de Homelitics.** Le habla a uno de los dos
proxies, y el proxy agrega la credencial. Consecuencias que hay que respetar
siempre:

- El token jamás se envía al cliente ni se guarda en `localStorage`; la sesión
  vive en una cookie `httpOnly`. Un token de agente ve **toda la agencia**.
- No hay problema de CORS porque la llamada real sale de servidor a servidor.
- Un Server Component importa `api` de `lib/homelitics.ts`; un Client Component
  lo importa de `lib/homelitics-navegador.ts`. Se ven exactamente igual (mismas
  funciones, mismos tipos) porque las dos comparten `lib/homelitics-nucleo.ts`;
  la única diferencia es el archivo del import. **No importes
  `lib/homelitics.ts` desde un archivo `"use client"`**: arrastra el import
  dinámico de `lib/session.ts` (marcado `"server-only"`) y Next niega el build
  en cuanto lo alcanza un Client Component, así la rama nunca se ejecute en el
  navegador — costó una sesión completa de depuración descubrirlo (ver
  `docs/PROGRESO.md`).

### `api` frente a `apiPublico`, y los dos proxies

Hay dos identidades y cada una tiene su cliente y su proxy. Se elige por la
pantalla, no por la operación:

| Quién | Server Component | Client Component | Proxy | Credencial |
|---|---|---|---|---|
| Pantallas de `(agente)` | `api` de `lib/homelitics.ts` | `api` de `lib/homelitics-navegador.ts` | `/api/homelitics/*` | la cookie del agente (`lib/session.ts`) |
| Pantallas de `(cliente)` (2.1, 2.2, 2.3, 2.5) | `apiPublico` de `lib/homelitics.ts` | `apiPublico` de `lib/homelitics-navegador.ts` | `/api/publico/*` | la cuenta de servicio (`lib/credencial-servicio.ts`) |

- `/api/homelitics/*` reenvía cualquier ruta, con el token del agente que hace
  la petición. Sin cookie responde `401 {"detail":"Sesión vencida"}` (no
  redirige: lo llama un `fetch`), y un 401 del API se devuelve tal cual, sin
  reintento.
- `/api/publico/*` solo deja pasar una **lista blanca** de método + ruta,
  anclada y con `{id}` UUID; todo lo demás responde 404 sin tocar la red. Ahí
  entra solo lo que llama un Client Component de cliente: los Server Components
  usan `apiPublico` directo contra el API y no lo atraviesan. Nunca abras
  `/leads` (lista), `/leads/{id}`, `/listings/{id}`, `/me`, `/analytics/*`,
  `/interactions` ni `/transitions`. Si la cuenta de servicio falla, responde
  502 y no 401, para no mandar a `/entrar` a quien nunca tuvo sesión.
- Una pantalla de cliente nunca importa `api`, y una de agente nunca importa
  `apiPublico`. Al agregar una llamada nueva desde un Client Component de
  cliente, agrégala también a la lista blanca, con el mismo cuidado.

### La credencial del agente sale de la cookie

`lib/session.ts` expone `getAuthHeader()`, y `lib/credencial-servicio.ts`
expone `getServiceAuthHeader()`. Nada más en el repo puede leer un token.

| Etapa | Cómo | Estado |
|---|---|---|
| 1 | Un agente demo: el servidor pide un token a Supabase con email y contraseña de `.env` y lo cachea | retirada; su código vive en `lib/credencial-servicio.ts`, solo para la cuenta de servicio |
| 2 | El agente inicia sesión en `/entrar`, `@supabase/ssr` guarda la sesión en cookie `httpOnly` y `getAuthHeader()` la lee | **es la actual** (HU-23) |

El API valida el JWT contra el **mismo proyecto de Supabase** que usa el resto
del sistema, así que la etapa 2 no requirió ningún cambio del lado del backend.

- `middleware.ts` verifica la sesión con `getClaims()` (valida la firma y
  renueva el token). Nunca uses `getSession()` para decidir si alguien entra:
  una cookie fabricada a mano pasaría. En `lib/session.ts` sí se usa
  `getSession()`, porque ahí el token solo se reenvía y el API verifica la
  firma por su cuenta.
- La política es **cerrada por defecto**: toda ruta exige sesión salvo
  `/entrar`, `/propiedades/*`, `/citas/*`, `/api/publico/*` y
  `/api/homelitics/*`. Una ruta nueva de agente queda protegida sin hacer
  nada; una de cliente hay que agregarla a `RUTAS_PUBLICAS`.
- El `?siguiente=` del login pasa siempre por `rutaSegura()`
  (`lib/redireccion.ts`): nada que no empiece por `/`, ni `//` ni `/\`.
- `GET /me` con 403 (usuario de Auth sin agente) → `/entrar/salir`, que cierra
  la sesión y muestra "Tu cuenta no está habilitada para ninguna agencia".

### Nada que dependa del usuario en una variable de módulo

Un módulo lo comparten **todas** las peticiones del servidor. Un `let` de
módulo con un token, un agente o un rol le daría a un agente el token de otro
y le mostraría otra agencia. Para no repetir trabajo dentro de una misma
petición, usa `cache()` de React (`lib/session.ts`, `lib/agente-actual.ts`):
memoriza solo durante un render.

La única excepción es `lib/credencial-servicio.ts`: una sola identidad
compartida a propósito, que no depende de quién pide. `lib/mock/` también
tiene estado de módulo, pero es estado de desarrollo. Para comprobarlo:

```bash
grep -rn "^let \|^var " lib/ app/
```

Cualquier resultado fuera de esos dos lugares es un error.

Nunca uses el header `X-Dev-Agent-Id`: solo funciona cuando el API corre contra
una base de datos local, y la app se niega a arrancar con ese modo si no es así.

## Convenciones de este repo

- **Todo dato del API pasa por zod** (`lib/schemas.ts`) antes de llegar a una
  pantalla. Si el API cambia un campo, queremos que falle en un punto.
- **Las pantallas nunca ven códigos HTTP.** `lib/homelitics.ts` los convierte en
  un `HomeliticsError` con un `kind` legible. Los tres casos que importan están
  documentados en `docs/API_CONTRACT.md`, sección "Errores que sí cambian la UI".
- **Server Components por defecto.** `"use client"` solo donde hay estado real:
  selector de horarios, formularios, la vista del agente que relee cada 5 s.
- **Los mocks se validan contra los mismos esquemas de zod.** Un mock con forma
  libre convierte el día de la integración en dos días.
- **Nada de fechas sin zona.** Los timestamps del API son UTC; la grilla se
  calcula en `America/Bogota`. Formatea siempre con `lib/format.ts`, nunca con
  `toLocaleString()` a secas.
- **Los precios son strings.** No los pases por `Number` para mostrarlos.
- Copys en español de Colombia, en tono llano, sin mayúsculas sostenidas.
  Un botón dice qué hace: "Pedir la visita", no "Enviar".

## Estilo visual

Los colores y piezas compartidas viven en `app/globals.css`. Usa los tokens
(`bg-plano`, `text-tinta`, `bg-neblina`, `text-alerta-hondo`…) y las clases
`btn btn-primario`, `campo`, `etiqueta`, `panel`, `insignia`, `dialogo`; no
los grises, rojos o verdes de fábrica de Tailwind. Estados con `Aviso`
(`info`, `error`, `exito`, `espera`) y cargas con `Cargando`. Por ahora el
diseño es solo para escritorio.

## Estado actual

Tareas 2.0 a 2.12 hechas y probadas contra el API real (`docs/PROGRESO.md`).
Cliente: ficha y selector de horarios (2.1), confirmar la cita (2.2), mover o
cancelar (2.3) y encuesta post-visita (2.5). Agente: historial del lead con
etapa y lead perdido (2.4, HU-09), tablero con filtros y drag & drop (HU-06),
reasignar (HU-08) y embudo con CSV/PDF (HU-17, solo `TEAM_ADMIN`). Mocks
completos en `lib/mock/`. HU-23 (login del agente, etapa 2 de
`lib/session.ts`) hecha en las fases 1 a 8 de `PLAN.md`; las pruebas manuales
de la fase 9 están en `docs/PRUEBAS_HU23.md`.

## Cómo trabajar aquí

- Una tarea del sprint por cambio. No mezcles 2.1 con 2.2.
- Antes de dar una pantalla por terminada, revisa su criterio de "done" en
  `docs/SPRINT_LINEA2.md`.
- Estados vacíos y de error desde el principio, no al final: el API duerme y la
  primera petición puede tardar entre 30 y 60 segundos.
- No agregues dependencias sin necesidad. Las aprobadas están abajo.

## Dependencias aprobadas

`next`, `react`, `typescript`, `tailwindcss`, `shadcn/ui`, `zod`,
`@tanstack/react-query`, `date-fns` y `date-fns-tz`, `@supabase/supabase-js`,
`@supabase/ssr`, `@dnd-kit/core` (el arrastre del tablero, tarea 2.10),
`jspdf` y `jspdf-autotable` (el PDF del embudo, HU-17: el API solo exporta
CSV y deja el PDF al front; se cargan con `import()` al hacer clic en
`features/embudo/components/ExportarEmbudo.tsx` y
`features/riesgo/components/ExportarRiesgo.tsx`, nunca con la página).

## Variables de entorno

```
HOMELITICS_API_URL=https://homelitics-api.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key, es público por diseño>
SERVICE_AGENT_EMAIL=<cuenta de servicio, un AGENT>
SERVICE_AGENT_PASSWORD=<contraseña de la cuenta de servicio>
USE_MOCKS=true
NEXT_PUBLIC_USE_MOCKS=true
MOCK_AGENT_ROLE=TEAM_ADMIN
USE_MOCK_TAREAS_AGENCIA=true
USE_MOCK_RIESGO_POR_AGENTE=true
```

`SERVICE_AGENT_*` reemplazan a las antiguas `DEMO_AGENT_*`. Son la cuenta de
servicio de las pantallas de cliente, que no tienen sesión: **solo** las leen
`lib/credencial-servicio.ts`, y a través de él `apiPublico` y
`/api/publico/*`. Tiene que ser un `AGENT`, no un `TEAM_ADMIN`. Los agentes no
usan ninguna variable de entorno: entran con su cuenta en `/entrar`.

`USE_MOCKS=true` hace que `lib/homelitics.ts` devuelva datos de `lib/mock/` sin
tocar la red. Es lo que permite maquetar sin credenciales: el middleware no
pide sesión y `/entrar` salta al tablero. `MOCK_AGENT_ROLE` (`AGENT` |
`TEAM_ADMIN`, por defecto `TEAM_ADMIN`) fija el rol del agente del mock; solo
cuenta con mocks.

`NEXT_PUBLIC_USE_MOCKS` es el mismo valor, repetido: Next solo mete al bundle
del navegador las variables con prefijo `NEXT_PUBLIC_`, y
`lib/homelitics-navegador.ts` (la mitad de `lib/homelitics.ts` que usan los
Client Components, ver esa sección) necesita saber si hay que usar mocks
también del lado del cliente. Mantén los dos en el mismo valor.

`USE_MOCK_TAREAS_AGENCIA` y `USE_MOCK_RIESGO_POR_AGENTE` son interruptores
por endpoint (tarea 2.25) para los endpoints **propuestos** de
`docs/API_CONTRACT.md` §8 que todavía no existen: `GET /tasks` y
`GET /analytics/at-risk-by-agent`. Con `USE_MOCKS=false`, esos dos siguen
respondiendo desde `lib/mock/` mientras su variable no diga `false` (sin la
variable cuenta como `true`: pegarle al API daría 404). Los lee
`lib/interruptores.ts`, solo en el servidor: `lib/homelitics.ts` y el proxy
los consultan, así que no llevan espejo `NEXT_PUBLIC_`. Cuando L1 publique
uno: verificarlo en `/openapi.json`, ponerlo en `false`, probar en vivo y
después borrar el interruptor, como se hizo con `GET /agents` (bloqueo 7).

## Bitácora

Al terminar una tarea, agrega una línea a docs/PROGRESO.md con la fecha, la
tarea, qué quedó hecho, qué decidiste y qué quedó pendiente. La siguiente
sesión empieza leyendo ese archivo.