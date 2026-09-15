import type { Listing } from "@/lib/schemas";
import { formatPrecio } from "@/lib/format";

const ETIQUETA_TIPO: Record<string, string> = {
  APARTMENT: "Apartamento",
  HOUSE: "Casa",
};

/**
 * Ficha de la propiedad que encabeza la pantalla de agendar (tarea 2.1).
 * Todos los campos salvo los obligatorios del listing son nullable en el API
 * (ver docs/API_CONTRACT.md), así que cada uno se muestra solo si llegó.
 *
 * El nombre del agente NO se muestra: el API no tiene un endpoint para
 * resolver un agent_id a su nombre (solo GET /me, que es el agente
 * autenticado, no cualquier agente). Ver "Bloqueos" en
 * docs/SPRINT_LINEA2.md.
 */
export function FichaPropiedad({ listing }: { listing: Listing }) {
  const ubicacion = [listing.neighborhood, listing.city].filter(Boolean).join(", ");
  const tipo = listing.property_type ? ETIQUETA_TIPO[listing.property_type] ?? listing.property_type : null;

  return (
    <div className="rounded-lg border border-neutral-200 p-4 sm:p-6">
      <p className="text-2xl font-semibold text-neutral-900">
        {formatPrecio(listing.asking_price)}
      </p>
      {listing.address && <p className="mt-1 text-neutral-700">{listing.address}</p>}
      {ubicacion && <p className="text-sm text-neutral-500">{ubicacion}</p>}

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-600">
        {tipo && (
          <div className="flex gap-1">
            <dt className="text-neutral-400">Tipo</dt>
            <dd>{tipo}</dd>
          </div>
        )}
        {listing.area_m2 && (
          <div className="flex gap-1">
            <dt className="text-neutral-400">Área</dt>
            <dd>{listing.area_m2} m²</dd>
          </div>
        )}
        {listing.bedrooms != null && (
          <div className="flex gap-1">
            <dt className="text-neutral-400">Habitaciones</dt>
            <dd>{listing.bedrooms}</dd>
          </div>
        )}
        {listing.bathrooms != null && (
          <div className="flex gap-1">
            <dt className="text-neutral-400">Baños</dt>
            <dd>{listing.bathrooms}</dd>
          </div>
        )}
      </dl>

      <p className="mt-4 text-sm text-neutral-500">
        Un asesor de Homelitics confirmará tu visita apenas elijas un horario.
      </p>
    </div>
  );
}
