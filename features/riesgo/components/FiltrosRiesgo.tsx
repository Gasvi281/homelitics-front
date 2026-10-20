"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { rangoAlReves } from "@/lib/filtros-url";
import { usePropiedades } from "@/features/tablero-leads/hooks";
import type { FiltrosRiesgo as Filtros } from "../claves";

/** Nombre del parámetro en la URL por cada filtro. */
const PARAMS = ["desde", "hasta", "propiedad"] as const satisfies readonly (keyof Filtros)[];

/**
 * Filtros del reporte de riesgo (2.18 — HU-13 AC2), con la mecánica de
 * FiltrosEmbudo: la fuente de verdad es la URL, enviar hace `router.replace`
 * y la página vuelve a leer `searchParams`. Un rango al revés se frena aquí.
 *
 * A diferencia del embudo, cambiar de filtro no pide nada al API: GET
 * /leads/at-risk no filtra, y el reporte filtra en el cliente la lista que
 * ya tiene (bloqueo 10).
 */
export function FiltrosRiesgo({ filtros }: { filtros: Filtros }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [valores, setValores] = useState<Filtros>(filtros);
  const [error, setError] = useState<string | null>(null);
  const propiedades = usePropiedades();

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
    if (rangoAlReves(valores)) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    navegar(valores);
  }

  function quitar() {
    setValores({});
    setError(null);
    navegar({});
  }

  const hayFiltros = PARAMS.some(p => filtros[p]);
  const campo = "mt-1 w-full rounded border border-neutral-300 bg-white p-2 text-sm text-neutral-900 disabled:opacity-60";

  return (
    // noValidate: `min`/`max` de las fechas solo guían el selector; si el
    // navegador validara, frenaría el envío con su globo y no con este mensaje.
    <form onSubmit={aplicar} noValidate className="mb-6 rounded-lg border border-neutral-200 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
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
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pendiente ? "Filtrando…" : "Filtrar el reporte"}
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
      </div>
    </form>
  );
}
