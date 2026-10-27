import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { salir } from "@/app/entrar/acciones";
import { AgenteActualProvider } from "@/features/agentes/AgenteActual";
import { CentroAvisos } from "@/features/avisos/components/CentroAvisos";
import { AsistenteInsights } from "@/features/insights/components/AsistenteInsights";
import { InsightsProvider } from "@/features/insights/InsightsProvider";
import { NavAgente } from "@/features/agentes/components/NavAgente";
import { AlertaRiesgo } from "@/features/riesgo/components/AlertaRiesgo";
import { obtenerAgenteActual } from "@/lib/agente-actual";
import { HomeliticsError } from "@/lib/errores";
import type { Agent } from "@/lib/schemas";
import { leerUmbral } from "@/lib/umbral";
import Cargando from "./loading";

/**
 * Layout del grupo (agente): pantallas que requieren identidad de agente, a
 * diferencia de (cliente). La sesión ya la exige `middleware.ts`; aquí se
 * resuelve quién es (HU-23, fase 4).
 *
 * Resuelve el agente actual (GET /me) y lo reparte con `AgenteActualProvider`
 * para que los Client Components sepan su rol (`useEsAdmin()`). Según /me:
 * - 403 (`sin_permiso`): usuario de Auth sin agente vinculado (AC4). Va a
 *   `/entrar/salir`, que cierra la sesión — aquí no se pueden escribir cookies.
 * - 401 (`no_autenticado`): la sesión no sirve, vuelve a `/entrar`.
 * - Cualquier otro error (API dormido, 5xx): se sigue con `agente = null`. Solo
 *   se esconde lo que es de admin, y cada pantalla muestra su propio error si
 *   el API de verdad no responde.
 *
 * El `await` de /me va dentro de un `Suspense` con el mismo `Cargando` de
 * `loading.tsx` (AC5): ese archivo solo envuelve a `children`, no al layout.
 *
 * La navegación va en la barra lateral (`NavAgente`), con el nombre del
 * agente y el botón "Salir" (AC3) al pie. Arriba del contenido, a la
 * derecha, `AlertaRiesgo` (2.16 — HU-10 AC2) con el umbral de la cookie, el
 * mismo que lee el tablero, y `CentroAvisos` (2.33): los avisos del agente
 * y sus recordatorios vencidos (2.26 — HU-11 AC2), en dos pestañas.
 *
 * Solo a `TEAM_ADMIN` se le monta el asistente de insights (botón flotante y
 * panel lateral, docs/INSIGHTS.md): un `AGENT` no recibe ni su estado. Si
 * GET /me falló (`agente = null`) tampoco, como con lo demás de admin.
 */
export default function AgenteLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Cargando />}>
      <ConAgente>{children}</ConAgente>
    </Suspense>
  );
}

async function ConAgente({ children }: { children: ReactNode }) {
  let agente: Agent | null = null;
  let destino: string | null = null;
  try {
    agente = await obtenerAgenteActual();
  } catch (error) {
    if (error instanceof HomeliticsError && error.kind === "sin_permiso") destino = "/entrar/salir";
    else if (error instanceof HomeliticsError && error.kind === "no_autenticado") destino = "/entrar";
  }
  // Fuera del try: redirect() lanza a propósito y el catch se lo comería.
  if (destino) redirect(destino);

  const umbral = await leerUmbral();

  const contenido = (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <NavAgente
        agente={agente}
        salir={
          <form action={salir}>
            <button type="submit" className="mt-2 text-sm font-semibold text-white underline focus-visible:outline-sol">
              Salir
            </button>
          </form>
        }
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-h-14 items-center justify-end gap-3 px-9 pt-5 empty:hidden">
          <AlertaRiesgo umbral={umbral} />
          <CentroAvisos />
        </div>
        {children}
      </div>
    </div>
  );

  return (
    <AgenteActualProvider agente={agente}>
      {agente?.role === "TEAM_ADMIN" ? (
        <InsightsProvider>
          {contenido}
          <AsistenteInsights />
        </InsightsProvider>
      ) : (
        contenido
      )}
    </AgenteActualProvider>
  );
}
