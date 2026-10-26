"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { rangoInvalidoMonitor, type FiltrosMonitor as Filtros } from "../filtros-monitor";
import { SelectorAgente } from "@/features/agentes/components/SelectorAgente";

/** Nombre del parámetro en la URL por cada filtro. */
const PARAMS = ["agente", "tipo", "por", "estado", "desde", "hasta"] as const satisfies readonly (keyof Filtros)[];

/**
 * Filtros del monitor de avisos (2.35), con la misma mecánica que los del
 * embudo: la fuente de verdad es la URL, enviar hace `router.replace` y la
 * página vuelve a leer `searchParams`. Un rango al revés se frena aquí y
 * nunca llega al API.
 */
export function FiltrosMonitor({ filtros }: { filtros: Filtros }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendiente, startTransition] = useTransition();
  const [valores, setValores] = useState<Filtros>(filtros);
  const [error, setError] = useState<string | null>(null);

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
    if (rangoInvalidoMonitor(valores)) {
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
  const campo = "campo";

  return (
    // noValidate: `min`/`max` de las fechas solo guían el selector; si el
    // navegador validara, frenaría el envío con su globo y no con este mensaje.
    <form onSubmit={aplicar} noValidate className="panel mb-6 px-6 py-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.5fr_1.2fr_1.2fr_1fr_1fr_1fr]">
        <SelectorAgente
          valor={valores.agente ?? ""}
          alCambiar={id => cambiar("agente", id)}
          etiqueta="Para"
          opcionVacia="Todos los agentes"
        />

        <label className="etiqueta">
          Tipo
          <select value={valores.tipo ?? ""} onChange={e => cambiar("tipo", e.target.value)} className={campo}>
            <option value="">Todos</option>
            <option value="LEAD_ASSIGNED">Lead asignado</option>
            <option value="VISIT_SCHEDULED">Visita agendada</option>
          </select>
        </label>

        <label className="etiqueta">
          Causado por
          <select value={valores.por ?? ""} onChange={e => cambiar("por", e.target.value)} className={campo}>
            <option value="">Todos</option>
            <option value="asistente">El asistente</option>
            <option value="administrador">Un administrador</option>
          </select>
        </label>

        <label className="etiqueta">
          Estado
          <select value={valores.estado ?? ""} onChange={e => cambiar("estado", e.target.value)} className={campo}>
            <option value="">Todos</option>
            <option value="sin-leer">Sin leer</option>
            <option value="leidos">Leídos</option>
          </select>
        </label>

        <label className="etiqueta">
          Desde
          <input
            type="date"
            value={valores.desde ?? ""}
            max={valores.hasta}
            onChange={e => cambiar("desde", e.target.value)}
            className={campo}
          />
        </label>

        <label className="etiqueta">
          Hasta
          <input
            type="date"
            value={valores.hasta ?? ""}
            min={valores.desde}
            onChange={e => cambiar("hasta", e.target.value)}
            className={campo}
          />
        </label>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-alerta-hondo">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendiente} className="btn btn-primario">
          {pendiente ? "Filtrando…" : "Ver los avisos"}
        </button>
        {hayFiltros && (
          <button type="button" onClick={quitar} disabled={pendiente} className="btn btn-suave">
            Quitar los filtros
          </button>
        )}
      </div>
    </form>
  );
}
