import { api, HomeliticsError } from "@/lib/homelitics";
import { Aviso } from "@/components/Aviso";
import { FichaPropiedad } from "@/components/FichaPropiedad";
import { GrillaHorarios } from "@/components/GrillaHorarios";

/**
 * Tarea 2.1 — HU-02. Elegir horario para la visita.
 *
 * `leadId` llega por query string, no por la ruta: esta pantalla no tiene
 * sesión de cliente (ver CLAUDE.md), así que no hay de dónde más sacar qué
 * conversación es. En el flujo real el enlace lo entrega el agente o el bot
 * de Telegram (línea 3) después de crear el lead con `POST /leads`; acá solo
 * se valida que exista y que sea sobre este listing.
 *
 * Para probar con los mocks:
 *   /propiedades/a10a1000-0000-4000-8000-000000000003/agendar
 *     ?leadId=a10a1000-0000-4000-8000-000000000006
 * (son LISTING_ID y LEAD_ID de lib/mock/index.ts).
 */
export default async function AgendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ leadId?: string; aviso?: string }>;
}) {
  const { listingId } = await params;
  const { leadId, aviso } = await searchParams;

  if (!leadId) {
    return (
      <Contenedor>
        <Aviso>
          No encontramos tu conversación con el agente. Pídele el enlace para agendar
          directamente desde ahí.
        </Aviso>
      </Contenedor>
    );
  }

  let listing, lead;
  try {
    [listing, lead] = await Promise.all([api.listing(listingId), api.lead(leadId)]);
  } catch (e) {
    return (
      <Contenedor>
        <Aviso variante="error">{mensajeError(e)}</Aviso>
      </Contenedor>
    );
  }

  if (lead.listing_id !== listingId) {
    return (
      <Contenedor>
        <Aviso>Esa conversación no es sobre esta propiedad.</Aviso>
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <h1 className="text-lg font-semibold text-neutral-900">Elige un horario para tu visita</h1>
      {aviso === "conflicto" && (
        <div className="mt-4">
          <Aviso variante="error">
            Alguien más tomó ese horario mientras lo confirmabas. Aquí tienes los horarios
            actualizados.
          </Aviso>
        </div>
      )}
      <FichaPropiedad listing={listing} />
      {/*
        El calendario es el del agente DUEÑO DEL LEAD (lead.agent_id), no el
        del listing (listing.agent_id) — normalmente coinciden, pero si el
        lead se reasignó (POST /leads/{id}/reassign) ya no. La cita se valida
        contra el agente del lead (docs/API_CONTRACT.md, POST .../appointments).
      */}
      <GrillaHorarios
        agentId={lead.agent_id}
        leadId={lead.id}
        listingId={listingId}
        ahoraISO={new Date().toISOString()}
      />
    </Contenedor>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>;
}

function mensajeError(e: unknown): string {
  if (!(e instanceof HomeliticsError)) return "Algo salió mal. Intenta de nuevo.";
  switch (e.kind) {
    case "no_encontrado":
      return "No encontramos esa propiedad o esa conversación.";
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto); recarga en unos segundos.";
    default:
      return e.detail;
  }
}
