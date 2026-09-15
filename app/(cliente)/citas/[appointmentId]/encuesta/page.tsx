import { api, HomeliticsError } from "@/lib/homelitics";
import type { Appointment } from "@/lib/schemas";
import { fechaHoraLarga } from "@/lib/format";
import { Aviso } from "@/components/Aviso";
import { EncuestaFlujo } from "@/components/EncuestaFlujo";

/**
 * Tarea 2.5 — HU-14. `(cliente)/citas/[appointmentId]/encuesta`, sin sesión
 * de cliente, igual que el resto de las pantallas de `(cliente)` (el link es
 * el único control de acceso).
 *
 * Server Component: solo trae la cita y resuelve los dos casos de solo
 * lectura (cita inexistente, visita que todavía no ha pasado). Todo lo que
 * implica escribir — el parche provisional del bloqueo 2 y el envío mismo—
 * vive en `EncuestaFlujo` (Client Component); ver el comentario ahí sobre
 * por qué no puede quedarse acá.
 */
export default async function EncuestaPage({
  params,
}: {
  params: Promise<{ appointmentId: string }>;
}) {
  const { appointmentId } = await params;

  let cita: Appointment;
  try {
    cita = await api.cita(appointmentId);
  } catch (e) {
    return (
      <Contenedor>
        <Aviso variante="error">{mensajeError(e)}</Aviso>
      </Contenedor>
    );
  }

  // HU-14: la encuesta aparece como pendiente después de la fecha y hora de
  // la visita, no antes.
  const finDeVisita = new Date(cita.scheduled_at).getTime() + cita.duration_min * 60_000;
  if (Date.now() < finDeVisita) {
    return (
      <Contenedor>
        <Aviso>
          Todavía no llega la hora de tu visita ({fechaHoraLarga(cita.scheduled_at)}). La encuesta
          se habilita después.
        </Aviso>
      </Contenedor>
    );
  }

  return (
    <Contenedor>
      <h1 className="text-lg font-semibold text-neutral-900">¿Cómo te fue en la visita?</h1>
      <p className="mt-1 text-sm text-neutral-500">
        {fechaHoraLarga(cita.scheduled_at)}. Tu respuesta ayuda al agente a hacer mejor seguimiento.
      </p>
      <div className="mt-6">
        <EncuestaFlujo appointmentId={cita.id} citaInicial={cita} />
      </div>
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
