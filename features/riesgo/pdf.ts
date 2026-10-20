/**
 * PDF del reporte de riesgo (2.18 — HU-13 AC3), con el patrón de
 * features/embudo/pdf.ts: se arma en el navegador con los mismos
 * `DatosRiesgo` que pinta la pantalla.
 *
 * Este módulo importa jspdf de forma estática; quien lo usa lo carga con
 * `import("../pdf")` al hacer clic (ExportarRiesgo), para que jspdf no entre
 * en el bundle de /riesgo.
 */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { fechaHoraConAnio } from "@/lib/format";
import type { Agent } from "@/lib/schemas";
import type { DatosRiesgo } from "./agrupar";
import type { FiltrosRiesgo } from "./claves";
import {
  avisosRiesgo, COLUMNAS_DETALLE, filasDetalle, filtrosEnEspanol, nombreAgenteO, type NombresRiesgo,
} from "./exportar";

export function generarPdfRiesgo({
  datos, horas, filtros, agente, nombres, nombreArchivo, ahora = new Date(),
}: {
  datos: DatosRiesgo;
  horas: number;
  filtros: FiltrosRiesgo;
  /** Quien lo genera (GET /me). El API no expone el nombre de la agencia, solo su id. */
  agente: Agent | null;
  nombres: NombresRiesgo;
  nombreArchivo: string;
  ahora?: Date;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margen = 48;
  const ancho = doc.internal.pageSize.getWidth() - margen * 2;
  let y = margen;

  function parrafo(texto: string, tam: number, color: [number, number, number] = [60, 60, 60], negrita = false) {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(tam);
    doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(texto, ancho) as string[];
    doc.text(lineas, margen, y);
    y += lineas.length * tam * 1.35;
  }

  const finTabla = () =>
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;

  parrafo("Leads en riesgo por agente", 18, [20, 20, 20], true);
  y += 4;
  const quien = agente ? ` por ${agente.full_name ?? agente.email ?? "un agente sin nombre"}` : "";
  parrafo(`Generado el ${fechaHoraConAnio(ahora.toISOString())} (hora de Bogotá)${quien}.`, 10);
  if (agente) parrafo(`Agencia: ${agente.agency_id}`, 8, [120, 120, 120]);
  y += 10;

  parrafo("Filtros aplicados", 11, [20, 20, 20], true);
  for (const linea of filtrosEnEspanol(filtros, horas, nombres)) parrafo(`•  ${linea}`, 10);
  y += 10;

  // El de los 500, si está, va primero y en rojo: cambia cómo se lee todo lo demás.
  avisosRiesgo(datos, horas).forEach((aviso, i) => {
    if (datos.incompleto && i === 0) {
      parrafo(aviso, 11, [153, 27, 27], true);
      y += 6;
    } else {
      parrafo(aviso, 9, [100, 100, 100]);
    }
  });
  y += 10;

  parrafo(
    `${datos.total === 1 ? "1 lead" : `${datos.total} leads`} sin respuesta, de ` +
      `${datos.grupos.length === 1 ? "1 agente" : `${datos.grupos.length} agentes`}.`,
    11, [20, 20, 20], true,
  );

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [["Agente", "Leads en riesgo", "Lead más antiguo"]],
    body: datos.grupos.map(g => [
      nombreAgenteO(nombres, g.agentId),
      String(g.leads.length),
      fechaHoraConAnio(g.masAntiguo.created_at),
    ]),
    headStyles: { fillColor: [38, 38, 38] },
    columnStyles: { 1: { halign: "right" } },
  });

  y = finTabla() + 24;
  parrafo("Detalle por lead", 11, [20, 20, 20], true);

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [[...COLUMNAS_DETALLE]],
    body: filasDetalle(datos, nombres, ahora),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [38, 38, 38] },
    columnStyles: { 4: { halign: "right" } },
  });

  doc.save(nombreArchivo);
}
