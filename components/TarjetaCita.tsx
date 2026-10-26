import type { AppointmentStatus, Channel } from "@/lib/schemas";
import { fechaLarga, horaFin, horaLocal } from "@/lib/format";

/** Exportado: components/HistorialLead.tsx (tarea 2.4) la reusa para las citas en la línea de tiempo. */
export const ETIQUETA_ESTADO: Record<AppointmentStatus, string> = {
  PENDING_CONFIRMATION: "Pendiente de confirmación",
  CONFIRMED: "Confirmada",
  RESCHEDULED: "Reagendada",
  CANCELLED: "Cancelada",
  COMPLETED: "Realizada",
  NO_SHOW: "No se presentó",
};

/**
 * Un color fijo por estado, el mismo en todas las pantallas: Sol para lo que
 * espera a alguien, Montaña para lo confirmado, Plano para lo que cambió,
 * Tinta para lo que ya pasó, gris para lo cancelado y Atención para la
 * ausencia.
 */
const ESTILO_ESTADO: Record<AppointmentStatus, string> = {
  PENDING_CONFIRMATION: "bg-sol-claro text-sol-texto",
  CONFIRMED: "bg-montana-claro text-montana-hondo",
  RESCHEDULED: "bg-plano-claro text-plano-texto",
  CANCELLED: "bg-hoja text-tinta-suave",
  COMPLETED: "bg-tinta text-white",
  NO_SHOW: "bg-alerta-claro text-alerta-hondo",
};

/** Exportado: components/HistorialLead.tsx y app/(agente)/leads/[leadId]/page.tsx (tarea 2.4) lo reusan. */
export const ETIQUETA_CANAL: Record<Channel, string> = {
  TELEGRAM: "Telegram",
  IN_APP: "la app",
  CALL: "una llamada",
};

/** Insignia del estado de una cita. La reusan el historial del lead y la pantalla de la visita. */
export function InsigniaEstadoCita({ status }: { status: AppointmentStatus }) {
  return <span className={`insignia ${ESTILO_ESTADO[status]}`}>{ETIQUETA_ESTADO[status]}</span>;
}

/**
 * Resumen grande de una cita: horario, insignia de estado, dirección,
 * duración y por dónde se puso en contacto el cliente. La usan la
 * confirmación (tarea 2.2, antes de crear la cita) y la vista de mover o
 * cancelar (tarea 2.3, con la cita ya creada) — por eso no asume que la cita
 * tenga `id` todavía ni ningún dato que no esté disponible en ambos momentos.
 *
 * La hora va en grande sobre el bloque azul: es lo que el cliente necesita
 * recordar. Todo en hora de Bogotá (lib/format.ts).
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
    <article className="panel flex flex-wrap overflow-hidden">
      <div className="flex min-w-0 flex-[1_1_240px] flex-col justify-between gap-6 bg-plano p-8 text-white">
        <span className="text-base text-[#d6dffa] first-letter:uppercase">{fechaLarga(scheduledAt)}</span>
        <span className="font-display text-[88px] leading-[0.9] font-extrabold tracking-[-0.04em]">
          {horaLocal(scheduledAt)}
        </span>
        <span className="text-base text-[#d6dffa]">Hasta las {horaFin(scheduledAt, durationMin)}</span>
      </div>

      <div className="flex min-w-0 flex-[2_1_360px] flex-col justify-center gap-6 p-8">
        {status && (
          <div>
            <InsigniaEstadoCita status={status} />
          </div>
        )}
        <dl className="grid grid-cols-2 gap-x-8 gap-y-5">
          {direccion && (
            <div className="col-span-2">
              <dt className="text-sm text-tinta-tenue">Dirección</dt>
              <dd className="mt-1 font-display text-[26px] leading-tight font-bold">{direccion}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-tinta-tenue">Duración</dt>
            <dd className="mt-1 text-lg font-bold">{durationMin} minutos</dd>
          </div>
          <div>
            <dt className="text-sm text-tinta-tenue">Te atiende</dt>
            <dd className="mt-1 text-lg font-bold">Un asesor de Homelitics</dd>
          </div>
          {canalContacto && (
            <div>
              <dt className="text-sm text-tinta-tenue">Te contactamos por</dt>
              <dd className="mt-1 text-lg font-bold first-letter:uppercase">{ETIQUETA_CANAL[canalContacto]}</dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}
