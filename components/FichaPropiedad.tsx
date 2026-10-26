import type { Listing } from "@/lib/schemas";
import { formatPrecio } from "@/lib/format";

const ETIQUETA_TIPO: Record<string, string> = {
  APARTMENT: "Apartamento",
  HOUSE: "Casa",
};

/**
 * Ficha de la propiedad, en la columna lateral de la pantalla de agendar
 * (tarea 2.1). Todos los campos salvo los obligatorios del listing son
 * nullable en el API (ver docs/API_CONTRACT.md), así que cada uno se muestra
 * solo si llegó.
 *
 * El API no trae fotos de la propiedad: el bloque de arriba es un fondo de
 * marca con el tipo de inmueble, no una imagen inventada.
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
    <article className="panel overflow-hidden">
      <div className="flex h-28 items-end bg-hoja p-3">
        {tipo && (
          <span className="insignia bg-white text-tinta-suave">{tipo}</span>
        )}
      </div>
      <div className="flex flex-col gap-2.5 px-5 py-[18px]">
        <div>
          <h2 className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em]">
            {listing.address ?? "Dirección por confirmar"}
          </h2>
          {ubicacion && <p className="mt-0.5 text-[15px] text-tinta-suave">{ubicacion}</p>}
        </div>
        <p className="font-display text-[28px] font-extrabold tracking-[-0.02em]">
          {formatPrecio(listing.asking_price)}
        </p>
        <dl className="grid grid-cols-3 gap-2 border-t border-hoja pt-3">
          {listing.area_m2 && (
            <div>
              <dt className="text-[13px] text-tinta-tenue">Área</dt>
              <dd className="mt-0.5 font-bold">{listing.area_m2} m²</dd>
            </div>
          )}
          {listing.bedrooms != null && (
            <div>
              <dt className="text-[13px] text-tinta-tenue">Habitaciones</dt>
              <dd className="mt-0.5 font-bold">{listing.bedrooms}</dd>
            </div>
          )}
          {listing.bathrooms != null && (
            <div>
              <dt className="text-[13px] text-tinta-tenue">Baños</dt>
              <dd className="mt-0.5 font-bold">{listing.bathrooms}</dd>
            </div>
          )}
        </dl>
      </div>
    </article>
  );
}
