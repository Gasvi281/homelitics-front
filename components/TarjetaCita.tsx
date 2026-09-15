import type { AppointmentStatus, Channel } from "@/lib/schemas";
import { fechaHoraLarga } from "@/lib/format";

/** Exportado: components/HistorialLead.tsx (tarea 2.4) la reusa para las citas en la línea de tiempo. */
export const ETIQUETA_ESTADO: Record<AppointmentStatus, string> = {
  PENDING_CONFIRMATION: "Pendiente de confirmación",
  CONFIRMED: "Confirmada",
  RESCHEDULED: "Reagendada",
  CANCELLED: "Cancelada",
  COMPLETED: "Realizada",
  NO_SHOW: "No se presentó",
};

const ESTILO_ESTADO: Record<AppointmentStatus, string> = {
  PENDING_CONFIRMATION: "border-amber-200 bg-amber-50 text-amber-700",
  CONFIRMED: "border-green-200 bg-green-50 text-green-700",
  RESCHEDULED: "border-blue-200 bg-blue-50 text-blue-700",
  CANCELLED: "border-red-200 bg-red-50 text-red-700",
  COMPLETED: "border-neutral-300 bg-neutral-100 text-neutral-700",
  NO_SHOW: "border-red-200 bg-red-50 text-red-700",
};

/** Exportado: components/HistorialLead.tsx y app/(agente)/leads/[leadId]/page.tsx (tarea 2.4) lo reusan. */
export const ETIQUETA_CANAL: Record<Channel, string> = {
  TELEGRAM: "Telegram",
  IN_APP: "la app",
  CALL: "una llamada",
};

/**
 * Resumen grande de una cita: horario, insignia de estado, dirección,
 * duración y por dónde se puso en contacto el cliente. La usan la
 * confirmación (tarea 2.2, antes de crear la cita) y la vista de mover o
 * cancelar (tarea 2.3, con la cita ya creada) — por eso no asume que la cita
 * tenga `id` todavía ni ningún dato que no esté disponible en ambos momentos.
 *
 * El nombre del agente no se muestra: el API no tiene forma de resolver un
 * `agent_id` a un nombre (ver "Bloqueos" en docs/SPRINT_LINEA2.md).
 *
 * `status` es opcional: en 2.2, antes de mandar el `POST`, la cita todavía no
 * existe y no hay forma honesta de anunciar un estado (bloqueo 5,
 * docs/SPRINT_LINEA2.md — el API decide `PENDING_CONFIRMATION` o `CONFIRMED`
 * según quién reserva, no algo que el front pueda saber de antemano). Sin
 * `status` no se pinta la insignia.
 */
export function TarjetaCita({
  scheduledAt,
  durationMin,
  status,
  direccion,
  canalContacto,
}: {
  scheduledAt: string;
  durationMin: number;
  status?: AppointmentStatus;
  direccion?: string | null;
  canalContacto?: Channel;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 p-4 sm:p-6">
      {status && (
        <span
          className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${ESTILO_ESTADO[status]}`}
        >
          {ETIQUETA_ESTADO[status]}
        </span>
      )}

      <p className="mt-3 text-xl font-semibold capitalize text-neutral-900">
        {fechaHoraLarga(scheduledAt)}
      </p>

      <dl className="mt-4 flex flex-col gap-1.5 text-sm text-neutral-600">
        <div className="flex gap-1">
          <dt className="text-neutral-400">Duración</dt>
          <dd>{durationMin} minutos</dd>
        </div>
        {direccion && (
          <div className="flex gap-1">
            <dt className="text-neutral-400">Dirección</dt>
            <dd>{direccion}</dd>
          </div>
        )}
        <div className="flex gap-1">
          <dt className="text-neutral-400">Agente</dt>
          <dd>Un asesor de Homelitics</dd>
        </div>
        {canalContacto && (
          <div className="flex gap-1">
            <dt className="text-neutral-400">Contacto</dt>
            <dd>Por {ETIQUETA_CANAL[canalContacto]}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
