import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { salir } from "@/app/entrar/acciones";
import { AgenteActualProvider } from "@/features/agentes/AgenteActual";
import { AlertaRiesgo } from "@/features/riesgo/components/AlertaRiesgo";
import { CampanaRecordatorios } from "@/features/seguimiento/components/CampanaRecordatorios";
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
 * El header lleva `AlertaRiesgo` (2.16 — HU-10 AC2) con el umbral de la
 * cookie, el mismo que lee el tablero, a su lado `CampanaRecordatorios`
 * (2.26 — HU-11 AC2), y el nombre del agente con el botón "Salir" (AC3).
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

  // Solo para no mostrar un enlace inútil: el API responde 403 igual.
  const esAdmin = agente?.role === "TEAM_ADMIN";
  const umbral = await leerUmbral();
  const nombre = agente?.full_name ?? agente?.email ?? null;

  return (
    <AgenteActualProvider agente={agente}>
      <div className="min-h-screen bg-white">
        <header className="border-b border-neutral-200">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 text-sm">
            <span className="font-semibold text-neutral-900">Homelitics</span>
            <Link href="/tablero" className="text-neutral-600 hover:text-neutral-900">
              Tablero de leads
            </Link>
            {esAdmin && (
              <Link href="/embudo" className="text-neutral-600 hover:text-neutral-900">
                Embudo
              </Link>
            )}
            {esAdmin && (
              <Link href="/riesgo" className="text-neutral-600 hover:text-neutral-900">
                Leads en riesgo
              </Link>
            )}
            <div className="ml-auto flex items-center gap-3">
              <AlertaRiesgo umbral={umbral} />
              <CampanaRecordatorios />
              {nombre && <span className="text-neutral-900">{nombre}</span>}
              <form action={salir}>
                <button type="submit" className="text-neutral-600 hover:text-neutral-900">
                  Salir
                </button>
              </form>
            </div>
          </nav>
        </header>
        {children}
      </div>
    </AgenteActualProvider>
  );
}
