"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { rangoInvalido, type FiltrosEmbudo as Filtros } from "../claves";
import { usePropiedades } from "@/features/tablero-leads/hooks";
import { SelectorAgente } from "@/features/agentes/components/SelectorAgente";

/** Nombre del parámetro en la URL por cada filtro. */
const PARAMS = ["desde", "hasta", "propiedad", "operacion", "agente"] as const satisfies readonly (keyof Filtros)[];

/**
 * Filtros del embudo (HU-17), con la misma mecánica que los del tablero: la
 * fuente de verdad es la URL, enviar hace `router.replace` y la página vuelve
 * a leer `searchParams`. Un rango al revés se frena aquí y nunca llega al API.
 *
 * La página solo se le muestra al admin, así que el filtro por agente va
 * siempre.
 */
export function FiltrosEmbudo({ filtros }: { filtros: Filtros }) {
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
    if (rangoInvalido(valores)) {
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr_1fr_1.5fr]">
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

        <label className="block text-sm font-medium text-neutral-700">
          Operación
          <select
            value={valores.operacion ?? ""}
            onChange={e => cambiar("operacion", e.target.value)}
            className={campo}
          >
            <option value="">Todas</option>
            <option value="SALE">Venta</option>
            <option value="RENT">Arriendo</option>
          </select>
        </label>

        <SelectorAgente
          valor={valores.agente ?? ""}
          alCambiar={id => cambiar("agente", id)}
          opcionVacia="Todos los agentes"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pendiente ? "Filtrando…" : "Ver el embudo"}
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
