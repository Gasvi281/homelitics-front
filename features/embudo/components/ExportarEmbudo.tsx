"use client";

import { useState } from "react";
import { api } from "@/lib/homelitics-navegador";
import { descargar } from "@/lib/descargar";
import { useAgenteActual } from "@/features/agentes/AgenteActual";
import { nombreAgente, useAgentes } from "@/features/agentes/hooks";
import { usePropiedades } from "@/features/tablero-leads/hooks";
import { aFiltrosApiEmbudo, nombreArchivoEmbudo, rangoInvalido, type FiltrosEmbudo } from "../claves";
import { mensajeErrorAnalitica, useEmbudo } from "../hooks";

/**
 * Exportar el embudo (HU-17 AC3) con los filtros de la URL:
 * - CSV: lo arma el back (`GET /analytics/funnel?format=csv`, vía el proxy).
 * - PDF: lo arma el navegador con el mismo JSON en caché de `useEmbudo`;
 *   jspdf se carga con `import()` al hacer clic, no con la página.
 *
 * Los dos se deshabilitan mientras el embudo carga (también al cambiar de
 * filtro: los datos a la vista son los del filtro anterior) o cuando no hay
 * nada que exportar: sin leads, con error o con el rango al revés.
 */
export function ExportarEmbudo({ filtros }: { filtros: FiltrosEmbudo }) {
  const invalido = rangoInvalido(filtros);
  const q = useEmbudo(filtros, { enabled: !invalido });
  const agente = useAgenteActual();
  const agentes = useAgentes();
  const propiedades = usePropiedades();
  const [enCurso, setEnCurso] = useState<"csv" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargando = q.isPending || q.isPlaceholderData;
  const sinDatos = invalido || !q.data || (q.data.stages[0]?.leads_reached ?? 0) === 0;
  const deshabilitado = cargando || sinDatos || enCurso !== null;

  async function exportarCsv() {
    setEnCurso("csv");
    setError(null);
    try {
      const csv = await api.embudoCsv(aFiltrosApiEmbudo(filtros));
      descargar(new Blob([csv], { type: "text/csv;charset=utf-8" }), nombreArchivoEmbudo(filtros, "csv"));
    } catch (e) {
      setError(`No se pudo descargar el CSV. ${mensajeErrorAnalitica(e)}`);
    } finally {
      setEnCurso(null);
    }
  }

  async function exportarPdf() {
    if (!q.data) return;
    setEnCurso("pdf");
    setError(null);
    try {
      const { generarPdfEmbudo } = await import("../pdf");
      generarPdfEmbudo({
        embudo: q.data,
        agente,
        nombres: {
          agentes: new Map(
            agentes.estado === "disponible" ? agentes.agentes.map(a => [a.id, nombreAgente(a)]) : [],
          ),
          propiedades: new Map((propiedades.data ?? []).map(p => [p.propertyId, p.etiqueta])),
        },
        nombreArchivo: nombreArchivoEmbudo(filtros, "pdf"),
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
      <div className="flex items-center gap-2" role="group" aria-label="Exportar el embudo">
        <span className="text-sm font-semibold text-tinta-suave">Exportar</span>
        <button type="button" onClick={exportarCsv} disabled={deshabilitado} className={boton}>
          {enCurso === "csv" ? "Descargando…" : "CSV"}
        </button>
        <button type="button" onClick={exportarPdf} disabled={deshabilitado} className={boton}>
          {enCurso === "pdf" ? "Generando…" : "PDF"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-alerta-hondo">{error}</p>}
    </div>
  );
}
