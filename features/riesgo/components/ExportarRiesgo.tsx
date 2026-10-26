"use client";

import { useState } from "react";
import { descargar } from "@/lib/descargar";
import { rangoAlReves } from "@/lib/filtros-url";
import { useHidratado } from "@/lib/hidratado";
import { useUmbral } from "@/lib/umbral-navegador";
import { useAgenteActual } from "@/features/agentes/AgenteActual";
import { nombreAgente, useAgentes } from "@/features/agentes/hooks";
import { usePropiedades } from "@/features/tablero-leads/hooks";
import { nombreArchivoRiesgo, type FiltrosRiesgo } from "../claves";
import { csvRiesgo, type NombresRiesgo } from "../exportar";
import { useRiesgoPorAgente } from "../hooks";

/**
 * Exportar el reporte de riesgo (2.18 — HU-13 AC3) con el umbral y los
 * filtros de la URL. Los dos archivos los arma el navegador con los mismos
 * datos que pinta `ReporteRiesgo` (misma key, mismo `select`): el API no
 * exporta at-risk.
 * - CSV: Blob con BOM UTF-8 (features/riesgo/exportar.ts).
 * - PDF: jspdf se carga con `import()` al hacer clic, no con la página.
 *
 * Deshabilitados mientras carga (también al cambiar de umbral: lo que se ve
 * es del umbral anterior), sin leads que exportar o con el rango al revés.
 */
export function ExportarRiesgo({ umbral, filtros }: { umbral: number; filtros: FiltrosRiesgo }) {
  const [horas] = useUmbral(umbral);
  const invalido = rangoAlReves(filtros);
  const { q, listings, necesitaListings } = useRiesgoPorAgente(horas, invalido ? {} : filtros);
  const hidratado = useHidratado();
  const agente = useAgenteActual();
  const agentes = useAgentes();
  const propiedades = usePropiedades();
  const [enCurso, setEnCurso] = useState<"csv" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargando = !hidratado || q.isPending || q.isPlaceholderData || (necesitaListings && !listings.data);
  const deshabilitado = cargando || invalido || !q.data || q.data.total === 0 || enCurso !== null;

  function nombres(): NombresRiesgo {
    return {
      agentes: new Map(agentes.estado === "disponible" ? agentes.agentes.map(a => [a.id, nombreAgente(a)]) : []),
      listings: listings.data ?? new Map(),
      propiedades: new Map((propiedades.data ?? []).map(p => [p.propertyId, p.etiqueta])),
    };
  }

  function exportarCsv() {
    if (!q.data) return;
    setError(null);
    try {
      const csv = csvRiesgo({ datos: q.data, horas, filtros, nombres: nombres() });
      descargar(new Blob([csv], { type: "text/csv;charset=utf-8" }), nombreArchivoRiesgo(horas, filtros, "csv"));
    } catch {
      setError("No se pudo generar el CSV. Intenta de nuevo.");
    }
  }

  async function exportarPdf() {
    if (!q.data) return;
    setEnCurso("pdf");
    setError(null);
    try {
      const { generarPdfRiesgo } = await import("../pdf");
      generarPdfRiesgo({
        datos: q.data,
        horas,
        filtros,
        agente,
        nombres: nombres(),
        nombreArchivo: nombreArchivoRiesgo(horas, filtros, "pdf"),
      });
    } catch {
      setError("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setEnCurso(null);
    }
  }

  const boton = "btn btn-sm btn-suave";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2" role="group" aria-label="Exportar el reporte de riesgo">
        <span className="text-sm font-semibold text-tinta-suave">Exportar</span>
        <button type="button" onClick={exportarCsv} disabled={deshabilitado} className={boton}>
          CSV
        </button>
        <button type="button" onClick={exportarPdf} disabled={deshabilitado} className={boton}>
          {enCurso === "pdf" ? "Generando…" : "PDF"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-alerta-hondo">{error}</p>}
    </div>
  );
}
