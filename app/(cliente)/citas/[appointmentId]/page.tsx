import { api, HomeliticsError } from "@/lib/homelitics";
import { Aviso } from "@/components/Aviso";
import { CitaAcciones } from "@/components/CitaAcciones";

/**
 * Tarea 2.3 — HU-02. Mover o cancelar una cita ya creada (tarea 2.2).
 *
 * Server Component: trae la cita, el lead (para el canal de contacto) y el
 * listing (para la dirección) antes de mostrar nada — mismo patrón que
 * `.../agendar/confirmar` (tarea 2.2). El resto —mover, cancelar y la
 * relectura periódica del criterio de "tiempo real"— vive en CitaAcciones,
 * el único Client Component de esta pantalla; por eso no se repite acá
 * `<TarjetaCita>`, para no mostrar un estado que se puede quedar desactualizado
 * frente al que trae la relectura.
 *
 * Esta pantalla tampoco tiene sesión de cliente (docs/SPRINT_LINEA2.md), así
 * que no valida que quien la abre sea el cliente dueño de la cita — el link
 * es el único control de acceso, igual que en `.../agendar` y
 * `.../agendar/confirmar`.
 */
export default async function CitaPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;

  let cita, lead, listing;
  try {
    cita = await api.cita(appointmentId);
    lead = await api.lead(cita.lead_id);
    listing = await api.listing(lead.listing_id);
  } catch (e) {
    return (
      <Contenedor>
        <Aviso variante="error">{mensajeError(e)}</Aviso>
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <h1 className="text-lg font-semibold text-neutral-900">Tu visita</h1>

      <CitaAcciones
        appointmentId={cita.id}
        citaInicial={cita}
        direccion={listing.address}
        canalContacto={lead.source_channel}
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
      return "No encontramos esa cita.";
    case "red":
      return "No pudimos conectarnos con el servicio. Puede estar despertando (tarda hasta un minuto); recarga en unos segundos.";
    default:
      return e.detail;
  }
}
