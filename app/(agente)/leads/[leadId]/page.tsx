import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics";
import { fechaHoraLarga } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { EtapaLead } from "@/components/EtapaLead";
import { ETIQUETA_CANAL } from "@/components/TarjetaCita";
import { HistorialLead } from "@/components/HistorialLead";
import {
  claveCitasLead, claveInteracciones, claveLead, claveTareasLead, claveTransiciones,
} from "@/features/tablero-leads/claves";

/**
 * Tarea 2.4 — HU-07. Historial del lead: primera pantalla de (agente).
 *
 * Server Component: trae el lead, el listing de interés, las interacciones,
 * las citas y las tareas antes de mostrar nada — mismo patrón de
 * `.../agendar` y `.../citas/[appointmentId]`. Lo que puede cambiar en la
 * pantalla se siembra en un QueryClient con las keys de
 * features/tablero-leads/claves.ts y se entrega con `HydrationBoundary`, como
 * en el tablero: EtapaLead (embudo y "Marcar como perdido", 2.11) y
 * HistorialLead (línea de tiempo y nota) lo leen con TanStack Query, y
 * marcar el lead como perdido lo invalida y relee todo desde el navegador.
 * El log de transiciones (para saber hasta dónde llegó un lead perdido) no
 * es imprescindible: si falla, el embudo lo dice sin él y la página sigue.
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

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } });
  qc.setQueryData(claveLead(leadId), lead);
  qc.setQueryData(claveInteracciones(leadId), interacciones);
  qc.setQueryData(claveCitasLead(leadId), citas);
  qc.setQueryData(claveTareasLead(leadId), tareas);
  await qc.prefetchQuery({
    queryKey: claveTransiciones(leadId),
    queryFn: () => api.transiciones(leadId),
  });

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

      <HydrationBoundary state={dehydrate(qc)}>
        <div className="mt-6">
          <EtapaLead leadInicial={lead} />
        </div>

        <h2 className="mt-8 text-base font-semibold text-neutral-900">Historial</h2>
        <HistorialLead leadId={lead.id} />
      </HydrationBoundary>
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
