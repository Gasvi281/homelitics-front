import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { api, HomeliticsError } from "@/lib/homelitics";
import Link from "next/link";
import { fechaHoraLarga, formatPrecio } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { EtapaLead } from "@/components/EtapaLead";
import { ETIQUETA_CANAL } from "@/components/TarjetaCita";
import { HistorialLead } from "@/components/HistorialLead";
import { PanelSeguimiento } from "@/features/seguimiento/components/PanelSeguimiento";
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
 * En la columna lateral, debajo de la etapa, va el panel de seguimiento
 * (2.19 — HU-11): lee las mismas tareas sembradas con `claveTareasLead`, así
 * que un recordatorio nuevo aparece en los dos.
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
    <main className="flex flex-wrap items-stretch gap-5 px-8 py-7">
      <HydrationBoundary state={dehydrate(qc)}>
        <div className="min-w-0 flex-[999_1_520px]">
          <HistorialLead leadId={lead.id} />
        </div>

        <aside aria-label="Resumen del lead" className="flex min-w-0 flex-[1_1_320px] flex-col gap-4 xl:max-w-[400px]">
          <section className="panel flex flex-col gap-5 p-6">
            <div>
              <Link href="/tablero" className="text-sm font-semibold">
                Volver al tablero
              </Link>
              <h1 className="mt-2.5 font-display text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
                Cliente {lead.client_id.slice(-8)}
              </h1>
              <p className="mt-1 text-[15px] text-tinta-suave">
                Primer contacto: {fechaHoraLarga(lead.created_at)} por {ETIQUETA_CANAL[lead.source_channel]}
              </p>
            </div>
            <EtapaLead leadInicial={lead} />
          </section>

          <PanelSeguimiento leadId={lead.id} listing={listing} ahoraInicial={new Date().toISOString()} />

          <section aria-labelledby="titulo-propiedad" className="panel overflow-hidden">
            <div className="h-20 bg-hoja" aria-hidden="true" />
            <div className="flex flex-col gap-1 px-5 py-4">
              <h2 id="titulo-propiedad" className="text-sm text-tinta-tenue">Le interesa</h2>
              <p className="font-display text-[19px] font-bold">
                {listing.address ?? (ubicacion || "Una propiedad de la agencia")}
              </p>
              {listing.address && ubicacion && <p className="text-[15px] text-tinta-suave">{ubicacion}</p>}
              <p className="text-[15px]">
                {formatPrecio(listing.asking_price)}
                {listing.area_m2 && `, ${listing.area_m2} m²`}
                {listing.bedrooms != null && `, ${listing.bedrooms} habitaciones`}
              </p>
            </div>
          </section>
        </aside>
      </HydrationBoundary>
    </main>
  );
}

function Contenedor({ children }: { children: React.ReactNode }) {
  return <main className="px-9 py-8">{children}</main>;
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
