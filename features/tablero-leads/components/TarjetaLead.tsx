import Link from "next/link";
import { fechaHoraLarga, formatPrecio, tiempoRelativo } from "@/lib/format";
import type { LastInteraction, LeadCard } from "@/lib/schemas";

const ETIQUETA_OPERACION: Record<LeadCard["operation_type"], string> = {
  SALE: "Venta",
  RENT: "Arriendo",
};

const ETIQUETA_TIPO: Record<LastInteraction["type"], string> = {
  MESSAGE: "Mensaje",
  CALL: "Llamada",
  NOTE: "Nota",
  STATUS_CHANGE: "Cambio de etapa",
};

/**
 * Una tarjeta del tablero (HU-06 AC1). Todo lo nullable de `LeadCard` se
 * dice como falta, no se inventa. Sin estado propio: la dibuja TableroLeads,
 * que es quien la hace arrastrable.
 *
 * `draggable={false}`: el arrastre nativo de un enlace dispara
 * `pointercancel` y corta el de @dnd-kit a mitad de camino.
 */
export function TarjetaLead({
  lead,
  pendiente = false,
  descripcion,
}: {
  lead: LeadCard;
  /** Hay un cambio de etapa en vuelo para este lead. */
  pendiente?: boolean;
  /** `aria-describedby` con las instrucciones de arrastre por teclado. */
  descripcion?: string;
}) {
  const ultima = lead.last_interaction;
  return (
    <Link
      href={`/leads/${lead.id}`}
      draggable={false}
      aria-describedby={descripcion}
      aria-busy={pendiente || undefined}
      className={`block select-none rounded-lg border bg-white p-3 focus-visible:outline-2 focus-visible:outline-neutral-900 ${
        pendiente ? "animate-pulse border-dashed border-neutral-400" : "border-neutral-200 hover:border-neutral-400"
      }`}
    >
      <p className="flex items-start justify-between gap-2 text-sm font-medium text-neutral-900">
        {lead.client_name ?? "Cliente sin nombre registrado"}
        {pendiente && <span className="shrink-0 text-xs font-normal text-neutral-500">Moviendo…</span>}
      </p>
      <p className="mt-0.5 text-xs text-neutral-600">
        {lead.listing_address ?? "Dirección no registrada"}
        {" · "}
        {lead.neighborhood ?? "barrio no registrado"}
      </p>
      <p className="mt-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-700">
          {ETIQUETA_OPERACION[lead.operation_type]}
        </span>
        <span className="text-neutral-900">{formatPrecio(lead.asking_price)}</span>
      </p>

      <div className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-500">
        {ultima ? (
          <>
            <p className="flex items-center gap-1.5">
              <IconoInteraccion tipo={ultima.type} />
              <span className="sr-only">{ETIQUETA_TIPO[ultima.type]},</span>
              {/* Servidor y navegador pueden calcular "hace N" en minutos distintos. */}
              <time dateTime={ultima.occurred_at} title={fechaHoraLarga(ultima.occurred_at)} suppressHydrationWarning>
                {tiempoRelativo(ultima.occurred_at)}
              </time>
            </p>
            {ultima.body && <p className="mt-1 line-clamp-2 text-neutral-600">{ultima.body}</p>}
          </>
        ) : (
          <p>Sin interacciones todavía</p>
        )}
      </div>
    </Link>
  );
}

/** Íconos inline: no hay librería de íconos en la lista aprobada. */
function IconoInteraccion({ tipo }: { tipo: LastInteraction["type"] }) {
  const trazo = {
    MESSAGE: "M4 5h16v11H8l-4 4V5z",
    CALL: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z",
    NOTE: "M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4",
    STATUS_CHANGE: "M4 8h13l-3-3M20 16H7l3 3",
  }[tipo];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5 shrink-0 text-neutral-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={trazo} />
    </svg>
  );
}
