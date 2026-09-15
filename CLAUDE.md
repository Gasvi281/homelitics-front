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
  entrar/      login del agente (Supabase)
  api/homelitics/[...path]/route.ts   el proxy
lib/
  session.ts             de dónde sale la credencial
  homelitics.ts           cliente HTTP para Server Components: pega al API
                          directo, con credencial de lib/session.ts
  homelitics-navegador.ts cliente HTTP para Client Components ("use client"):
                          pega al proxy, sin credencial
  homelitics-nucleo.ts    lo que comparten los dos: fetch+zod+traducción de
                          errores y la lista completa de operaciones del API
  errores.ts              HomeliticsError y su `kind`, sin dependencias
  schemas.ts     zod, la forma de las respuestas
  format.ts      pesos colombianos y horas de Bogotá
  mock/          datos falsos con la MISMA forma que los reales
components/
```

**El navegador nunca le habla al API de Homelitics.** Le habla al proxy en
`/api/homelitics/*`, y el proxy agrega la credencial. Consecuencias que hay que
respetar siempre:

- El token jamás se envía al cliente ni se guarda en `localStorage`. Un token de
  agente ve **toda la agencia**.
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

### La credencial se resuelve en un solo archivo

`lib/session.ts` expone `getAuthHeader()`. Nada más en el repo puede leer un
token. Tiene dos etapas y la segunda no debe obligar a tocar ninguna pantalla:

| Etapa | Cómo | Estado |
|---|---|---|
| 1 | Un agente demo: el servidor pide un token a Supabase con email y contraseña de `.env` y lo cachea | es la actual |
| 2 | El agente inicia sesión en `/entrar`, `@supabase/ssr` guarda la sesión en cookie y `getAuthHeader()` la lee | pendiente |

El API valida el JWT contra el **mismo proyecto de Supabase** que usa el resto
del sistema, así que la etapa 2 no requiere ningún cambio del lado del backend.

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

## Estado actual

Esqueleto. Existen `lib/session.ts`, `lib/homelitics.ts`, `lib/schemas.ts`,
`lib/format.ts` y el proxy. Faltan las pantallas y los mocks. El prototipo visual
de referencia (datos falsos, HTML suelto) muestra cómo se ven las cinco
pantallas; `docs/SPRINT_LINEA2.md` lo describe en texto.

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
`@supabase/ssr`.

## Variables de entorno

```
HOMELITICS_API_URL=https://homelitics-api.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key, es público por diseño>
DEMO_AGENT_EMAIL=<agente demo, etapa 1>
DEMO_AGENT_PASSWORD=<contraseña compartida, etapa 1>
USE_MOCKS=true
NEXT_PUBLIC_USE_MOCKS=true
```

`USE_MOCKS=true` hace que `lib/homelitics.ts` devuelva datos de `lib/mock/` sin
tocar la red. Es lo que permite maquetar sin credenciales.

`NEXT_PUBLIC_USE_MOCKS` es el mismo valor, repetido: Next solo mete al bundle
del navegador las variables con prefijo `NEXT_PUBLIC_`, y
`lib/homelitics-navegador.ts` (la mitad de `lib/homelitics.ts` que usan los
Client Components, ver esa sección) necesita saber si hay que usar mocks
también del lado del cliente. Mantén los dos en el mismo valor.

## Bitácora

Al terminar una tarea, agrega una línea a docs/PROGRESO.md con la fecha, la
tarea, qué quedó hecho, qué decidiste y qué quedó pendiente. La siguiente
sesión empieza leyendo ese archivo.