"use client";

import Link from "next/link";
import { useEsAdmin } from "@/features/agentes/AgenteActual";
import { NombreAgente } from "@/features/agentes/components/NombreAgente";
import { fechaHoraLarga, formatPrecio, tiempoRelativo } from "@/lib/format";
import { textoInteraccion } from "@/lib/lineaTiempo";
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
 *
 * Al admin le dice quién atiende el lead (HU-08). Mientras la lista de
 * agentes carga (o si falla) `NombreAgente` no pinta nada y no ocupa espacio.
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
  const esAdmin = useEsAdmin();
  const ultima = lead.last_interaction;
  // El "Lost: PRICE" que deja el API se lee "Perdido: Precio" (vista de perdidos).
  const texto = ultima ? textoInteraccion(ultima) : null;
  return (
    <Link
      href={`/leads/${lead.id}`}
      draggable={false}
      aria-describedby={descripcion}
      aria-busy={pendiente || undefined}
      className={`flex select-none flex-col gap-2 rounded-2xl border bg-white p-3.5 text-tinta transition-colors ${
        pendiente ? "animate-pulso border-dashed border-plano-borde" : "border-borde hover:border-tinta"
      }`}
    >
      <p className="flex items-start justify-between gap-2">
        <span className="text-base font-bold">{lead.client_name ?? "Cliente sin nombre registrado"}</span>
        {pendiente && <span className="shrink-0 text-xs font-semibold text-plano-texto">Moviendo…</span>}
      </p>
      <p className="text-sm text-tinta-suave">
        {lead.listing_address ?? "Dirección no registrada"}, {lead.neighborhood ?? "barrio no registrado"}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-display text-lg font-bold">{formatPrecio(lead.asking_price)}</span>
        <span className="insignia bg-neblina text-tinta-suave">{ETIQUETA_OPERACION[lead.operation_type]}</span>
      </p>
      {esAdmin && (
        <NombreAgente agentId={lead.agent_id} prefijo="A cargo de " className="block text-[13px] text-tinta-tenue" />
      )}

      {ultima ? (
        <div className="mt-1 flex flex-col gap-1.5 border-t border-hoja pt-2.5">
          {texto && <Burbuja tipo={ultima.type} direccion={ultima.direction}>{texto}</Burbuja>}
          <p className={`flex items-center gap-1.5 text-[13px] text-tinta-tenue ${ultima.direction === "OUTBOUND" && texto ? "self-end" : ""}`}>
            <IconoInteraccion tipo={ultima.type} />
            <span className="sr-only">{ETIQUETA_TIPO[ultima.type]},</span>
            {/* Servidor y navegador pueden calcular "hace N" en minutos distintos. */}
            <time dateTime={ultima.occurred_at} title={fechaHoraLarga(ultima.occurred_at)} suppressHydrationWarning>
              {tiempoRelativo(ultima.occurred_at)}
            </time>
          </p>
        </div>
      ) : (
        <p className="mt-1 border-t border-hoja pt-2.5 text-[13px] text-tinta-tenue">Sin interacciones todavía</p>
      )}
    </Link>
  );
}

/**
 * La última interacción con la forma del chat: lo que escribió el cliente a
 * la izquierda en gris, lo que se le respondió a la derecha en azul, las
 * notas internas en amarillo y los cambios de etapa sin burbuja.
 */
function Burbuja({
  tipo, direccion, children,
}: {
  tipo: LastInteraction["type"];
  direccion: LastInteraction["direction"];
  children: string;
}) {
  if (tipo === "STATUS_CHANGE") {
    return <p className="line-clamp-2 text-sm text-tinta-suave">{children}</p>;
  }
  // El recorte va en un span interno: con el padding en el mismo elemento,
  // la tercera línea se asomaría por debajo.
  const estilo =
    tipo === "NOTE"
      ? "self-end rounded-[14px] bg-sol-claro text-[#4a3300]"
      : direccion === "OUTBOUND"
        ? "self-end rounded-[14px] rounded-br-[4px] bg-plano text-white"
        : "self-start rounded-[14px] rounded-bl-[4px] bg-neblina text-tinta";
  return (
    <p className={`max-w-full px-3 py-2 text-sm ${estilo}`}>
      <span className="line-clamp-2">{children}</span>
    </p>
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
      className="h-3.5 w-3.5 shrink-0"
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
