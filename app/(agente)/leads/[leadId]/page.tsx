import { api, HomeliticsError } from "@/lib/homelitics";
import { fechaHoraLarga } from "@/lib/format";
import { construirLineaTiempo } from "@/lib/lineaTiempo";
import { Aviso } from "@/components/Aviso";
import { EmbudoLead } from "@/components/EmbudoLead";
import { ETIQUETA_CANAL } from "@/components/TarjetaCita";
import { HistorialLead } from "@/components/HistorialLead";

/**
 * Tarea 2.4 — HU-07. Historial del lead: primera pantalla de (agente).
 *
 * Server Component: trae el lead, el listing de interés, las interacciones,
 * las citas y las tareas antes de mostrar nada — mismo patrón de
 * `.../agendar` y `.../citas/[appointmentId]`. La línea de tiempo (mezcla de
 * las tres últimas fuentes) y el campo de nota viven en HistorialLead, el
 * único Client Component: la nota nueva tiene que aparecer de inmediato.
 *
 * El nombre del cliente NO se muestra: `LeadSchema` solo trae `client_id`
 * (uuid) y el API no tiene forma de resolver un cliente a un nombre
 * (docs/API_CONTRACT.md §6: no hay identidad de cliente final). Se muestra el
 * id recortado en su lugar — dato real, no inventado. Nuevo bloqueo #5 en
 * docs/SPRINT_LINEA2.md.
 */
export default async function LeadPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;

  let lead, listing, interacciones, citas, tareas;
  try {
    lead = await api.lead(leadId);
    [listing, interacciones, citas, tareas] = await Promise.all([
      api.listing(lead.listing_id),
      api.interacciones(leadId),
      api.citasDelLead(leadId),
      api.tareas(leadId),
    ]);
  } catch (e) {
    return (
      <Contenedor>
        <Aviso variante="error">{mensajeError(e)}</Aviso>
      </Contenedor>
    );
  }

  const eventos = construirLineaTiempo({ interacciones, citas, tareas });
  const ubicacion = [listing.neighborhood, listing.city].filter(Boolean).join(", ");

  return (
    <Contenedor>
      <h1 className="text-lg font-semibold text-neutral-900">
        Cliente {lead.client_id.slice(-8)}
      </h1>
      <p className="mt-1 text-sm text-neutral-600">
        Interesado en {listing.address ?? ubicacion ?? "una propiedad de la agencia"}
      </p>
      <p className="text-sm text-neutral-500">
        Primer contacto: {fechaHoraLarga(lead.created_at)} por {ETIQUETA_CANAL[lead.source_channel]}
      </p>

      <div className="mt-6">
        <EmbudoLead etapaActual={lead.current_stage} />
      </div>

      <h2 className="mt-8 text-base font-semibold text-neutral-900">Historial</h2>
      <HistorialLead leadId={lead.id} eventosIniciales={eventos} />
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
      return "No encontramos el lead o alguno de sus datos relacionados (propiedad, citas, tareas).";
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto); recarga en unos segundos.";
    default:
      return e.detail;
  }
}
