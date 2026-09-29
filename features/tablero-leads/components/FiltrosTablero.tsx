"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { ETIQUETA_ETAPA } from "@/lib/etapas";
import {
  ETAPAS_ABIERTAS, ETAPAS_CERRADAS, esVistaCerrados, rangoInvalido,
  type FiltrosTablero as Filtros,
} from "../claves";
import { usePropiedades } from "../hooks";
import { useEsAdmin } from "@/features/agentes/AgenteActual";
import { SelectorAgente } from "@/features/agentes/components/SelectorAgente";

/** Nombre del parámetro en la URL por cada filtro. */
const PARAMS = ["etapa", "propiedad", "agente", "desde", "hasta"] as const satisfies readonly (keyof Filtros)[];

/**
 * Filtros del tablero (tarea 2.9 — HU-06 AC3). La fuente de verdad es la URL:
 * enviar el formulario hace `router.replace` (navegación suave, sin recargar)
 * y la página vuelve a leer `searchParams`, así un enlace o una recarga
 * conservan el filtro. Un rango al revés se frena aquí y nunca llega al API.
 *
 * "Ver perdidos" (2.12 — HU-09 AC2) cambia a `?etapa=LOST` conservando los
 * demás filtros; en esa vista el selector de etapa ofrece Ganado y Perdido
 * (sin "Todas": sin etapa se vuelve al tablero activo).
 *
 * "Agente" (HU-08) solo se le muestra al admin: `?agente=` → `agent_id`.
 * Ofrece también a los inactivos, que pueden conservar leads. Sin GET
 * /agents, SelectorAgente queda deshabilitado y lo explica.
 */
export function FiltrosTablero({ filtros }: { filtros: Filtros }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [valores, setValores] = useState<Filtros>(filtros);
  const [error, setError] = useState<string | null>(null);
  const propiedades = usePropiedades();
  const esAdmin = useEsAdmin();

  function cambiar(clave: keyof Filtros, valor: string) {
    setValores(v => ({ ...v, [clave]: valor || undefined }));
    setError(null);
  }

  function navegar(nuevos: Filtros) {
    const qs = new URLSearchParams(searchParams.toString());
    for (const p of PARAMS) {
      const v = nuevos[p];
      if (v) qs.set(p, v);
      else qs.delete(p);
    }
    const texto = qs.toString();
    startTransition(() => {
      router.replace(texto ? `${pathname}?${texto}` : pathname, { scroll: false });
    });
  }

  function aplicar(e: FormEvent) {
    e.preventDefault();
    if (rangoInvalido(valores)) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    navegar(valores);
  }

  function quitar() {
    const nuevos: Filtros = cerrados ? { etapa: filtros.etapa } : {};
    setValores(nuevos);
    setError(null);
    navegar(nuevos);
  }

  const cerrados = esVistaCerrados(filtros);

  function alternarVista() {
    setError(null);
    const nuevos: Filtros = { ...filtros, etapa: cerrados ? undefined : "LOST" };
    setValores(nuevos);
    navegar(nuevos);
  }

  // En cerrados la etapa es la vista, no un filtro que se pueda quitar.
  const hayFiltros = PARAMS.some(p => filtros[p] && !(cerrados && p === "etapa"));
  const campo = "mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm text-neutral-900 disabled:opacity-60";

  return (
    // noValidate: `min`/`max` de las fechas solo guían el selector; si el
    // navegador validara, frenaría el envío con su globo y no con este mensaje.
    <form onSubmit={aplicar} noValidate className="mb-6 rounded-lg border border-neutral-200 p-4">
      <div
        className={`grid gap-3 sm:grid-cols-2 ${
          esAdmin ? "lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr]" : "lg:grid-cols-[2fr_1fr_1fr_1fr]"
        }`}
      >
        <label className="block text-sm font-medium text-neutral-700">
          Propiedad
          <select
            value={valores.propiedad ?? ""}
            onChange={e => cambiar("propiedad", e.target.value)}
            disabled={propiedades.isPending}
            className={campo}
          >
            <option value="">
              {propiedades.isPending ? "Cargando propiedades…" : "Todas las propiedades"}
            </option>
            {propiedades.data?.map(p => (
              <option key={p.propertyId} value={p.propertyId}>{p.etiqueta}</option>
            ))}
          </select>
          {propiedades.isError && (
            <span className="mt-1 block text-xs font-normal text-red-700">
              No se pudieron cargar las propiedades.
            </span>
          )}
        </label>

        {esAdmin && (
          <SelectorAgente
            valor={valores.agente ?? ""}
            alCambiar={id => cambiar("agente", id)}
            opcionVacia="Todos los agentes"
          />
        )}

        <label className="block text-sm font-medium text-neutral-700">
          Etapa
          <select value={valores.etapa ?? ""} onChange={e => cambiar("etapa", e.target.value)} className={campo}>
            {!cerrados && <option value="">Todas las etapas</option>}
            {(cerrados ? ETAPAS_CERRADAS : ETAPAS_ABIERTAS).map(etapa => (
              <option key={etapa} value={etapa}>{ETIQUETA_ETAPA[etapa]}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Creado desde
          <input
            type="date"
            value={valores.desde ?? ""}
            max={valores.hasta}
            onChange={e => cambiar("desde", e.target.value)}
            className={campo}
          />
        </label>

        <label className="block text-sm font-medium text-neutral-700">
          Creado hasta
          <input
            type="date"
            value={valores.hasta ?? ""}
            min={valores.desde}
            onChange={e => cambiar("hasta", e.target.value)}
            className={campo}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pendiente ? "Filtrando…" : "Filtrar el tablero"}
        </button>
        {hayFiltros && (
          <button
            type="button"
            onClick={quitar}
            disabled={pendiente}
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-40"
          >
            Quitar los filtros
          </button>
        )}
        <button
          type="button"
          onClick={alternarVista}
          disabled={pendiente}
          className="ml-auto rounded border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-40"
        >
          {cerrados ? "Volver al tablero activo" : "Ver perdidos"}
        </button>
      </div>
    </form>
  );
}
