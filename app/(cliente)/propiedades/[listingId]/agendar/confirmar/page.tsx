import Link from "next/link";
import { api, HomeliticsError } from "@/lib/homelitics";
import { Aviso } from "@/components/Aviso";
import { TarjetaCita } from "@/components/TarjetaCita";
import { ConfirmarCitaAcciones } from "@/components/ConfirmarCitaAcciones";

/**
 * Tarea 2.2 — HU-02. Confirmar la cita elegida en la grilla (tarea 2.1).
 *
 * `leadId` y `horario` llegan por query string desde `GrillaHorarios`
 * (`.../agendar/confirmar?leadId=&horario=`); esta pantalla tampoco tiene
 * sesión de cliente, igual que `.../agendar` (ver docs/SPRINT_LINEA2.md).
 *
 * La cita todavía no existe en este punto: `horario` es solo el slot que el
 * cliente marcó en la grilla. El envío real (`POST /leads/{id}/appointments`)
 * pasa en `ConfirmarCitaAcciones`, el único Client Component de esta
 * pantalla — necesita estado para el envío y sus caminos de error.
 */
export default async function ConfirmarPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ leadId?: string; horario?: string }>;
}) {
  const { listingId } = await params;
  const { leadId, horario } = await searchParams;

  if (!leadId || !horario) {
    return (
      <Contenedor>
        <Aviso>
          No encontramos el horario que ibas a confirmar.{" "}
          <Link href={`/propiedades/${listingId}/agendar${leadId ? `?leadId=${leadId}` : ""}`} className="underline">
            Vuelve a elegir uno
          </Link>
          .
        </Aviso>
      </Contenedor>
    );
  }

  if (Number.isNaN(new Date(horario).getTime())) {
    return (
      <Contenedor>
        <Aviso variante="error">
          Ese horario no es válido.{" "}
          <Link href={`/propiedades/${listingId}/agendar?leadId=${leadId}`} className="underline">
            Vuelve a elegir uno
          </Link>
          .
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

  // Validado antes de mostrar el botón de envío, no solo antes de mandarlo:
  // si ya pasó no tiene caso ofrecer "Pedir la visita" (docs/API_CONTRACT.md,
  // 422 por scheduled_at en el pasado). ConfirmarCitaAcciones lo vuelve a
  // revisar antes de enviar, por si el cliente deja esta pantalla abierta.
  if (new Date(horario).getTime() <= Date.now()) {
    return (
      <Contenedor>
        <Aviso variante="error">
          Ese horario ya pasó.{" "}
          <Link href={`/propiedades/${listingId}/agendar?leadId=${leadId}`} className="underline">
            Elige otro
          </Link>
          .
        </Aviso>
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <h1 className="text-lg font-semibold text-neutral-900">Confirma tu visita</h1>

      <div className="mt-6">
        <TarjetaCita
          scheduledAt={horario}
          durationMin={30}
          direccion={listing.address}
          canalContacto={lead.source_channel}
        />
      </div>

      <div className="mt-4">
        <Aviso>
          Al pedir la visita, el agente queda al tanto. Si hace falta que la confirme, te
          avisamos por correo apenas lo haga.
        </Aviso>
      </div>

      <ConfirmarCitaAcciones leadId={lead.id} listingId={listingId} horario={horario} />
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
