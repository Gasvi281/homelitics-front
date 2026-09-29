/**
 * PDF del embudo (HU-17 AC3). El API no lo genera ("PDF is the frontend's
 * job", /openapi.json): se arma en el navegador con el MISMO JSON que ya
 * está en caché y pinta la pantalla, así el PDF no puede decir otra cosa.
 *
 * Este módulo importa jspdf de forma estática; quien lo usa lo carga con
 * `import("../pdf")` al hacer clic (ExportarEmbudo), para que jspdf no entre
 * en el bundle de /embudo.
 */
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { ETIQUETA_ETAPA } from "@/lib/etapas";
import { diaLargo, fechaHoraConAnio, formatPorcentaje } from "@/lib/format";
import type { Agent, Funnel } from "@/lib/schemas";
import { etapaConMayorCaida } from "./claves";

/** Cómo se llama en español cada clave de `filters` y cómo se muestra su valor. */
export function filtrosEnEspanol(
  filters: Funnel["filters"],
  nombres: { agentes: ReadonlyMap<string, string>; propiedades: ReadonlyMap<string, string> },
): string[] {
  const lineas: string[] = [];
  for (const [clave, valor] of Object.entries(filters)) {
    switch (clave) {
      case "created_from":
        lineas.push(`Creados desde: ${diaLargo(valor)}`);
        break;
      case "created_to":
        lineas.push(`Creados hasta: ${diaLargo(valor)}`);
        break;
      case "agent_id":
        lineas.push(`Agente: ${nombres.agentes.get(valor) ?? valor}`);
        break;
      case "property_id":
        lineas.push(`Propiedad: ${nombres.propiedades.get(valor) ?? valor}`);
        break;
      case "listing_id":
        lineas.push(`Publicación: ${valor}`);
        break;
      case "operation_type":
        lineas.push(`Operación: ${valor === "SALE" ? "Venta" : valor === "RENT" ? "Arriendo" : valor}`);
        break;
      default:
        lineas.push(`${clave}: ${valor}`);
    }
  }
  return lineas;
}

export function generarPdfEmbudo({
  embudo, agente, nombres, nombreArchivo, ahora = new Date(),
}: {
  embudo: Funnel;
  /** Quien lo genera (GET /me). El API no expone el nombre de la agencia, solo su id. */
  agente: Agent | null;
  nombres: { agentes: ReadonlyMap<string, string>; propiedades: ReadonlyMap<string, string> };
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

  parrafo("Embudo de conversión", 18, [20, 20, 20], true);
  y += 4;
  const quien = agente ? ` por ${agente.full_name ?? agente.email ?? "un agente sin nombre"}` : "";
  parrafo(`Generado el ${fechaHoraConAnio(ahora.toISOString())} (hora de Bogotá)${quien}.`, 10);
  if (agente) parrafo(`Agencia: ${agente.agency_id}`, 8, [120, 120, 120]);
  y += 10;

  parrafo("Filtros aplicados", 11, [20, 20, 20], true);
  const filtros = filtrosEnEspanol(embudo.filters, nombres);
  for (const linea of filtros.length ? filtros : ["Sin filtros: todos los leads de la agencia."]) {
    parrafo(`•  ${linea}`, 10);
  }
  y += 10;

  const peor = etapaConMayorCaida(embudo.stages);
  if (peor) {
    parrafo(
      `Aquí se pierden más clientes: ${ETIQUETA_ETAPA[peor.stage]}. Solo ${formatPorcentaje(peor.pct_from_prev)} ` +
        "de los que venían de la etapa anterior llegan ahí.",
      11, [146, 64, 14], true,
    );
    y += 6;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [["Etapa", "Leads", "Desde la anterior", "Del total"]],
    body: embudo.stages.map(s => [
      ETIQUETA_ETAPA[s.stage] + (s.stage === peor?.stage ? " (mayor caída)" : ""),
      String(s.leads_reached),
      formatPorcentaje(s.pct_from_prev),
      formatPorcentaje(s.pct_of_first),
    ]),
    foot: [[ETIQUETA_ETAPA.LOST, String(embudo.lost), "—", "—"]],
    headStyles: { fillColor: [38, 38, 38] },
    footStyles: { fillColor: [254, 242, 242], textColor: [153, 27, 27] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    didParseCell: data => {
      if (data.section === "body" && embudo.stages[data.row.index]?.stage === peor?.stage) {
        data.cell.styles.fillColor = [255, 251, 235];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y;
  y = finalY + 20;
  parrafo(
    `Perdidos: ${embudo.lost} ${embudo.lost === 1 ? "lead de este rango se marcó" : "leads de este rango se marcaron"} ` +
      "como perdidos, desde cualquier etapa.",
    10,
  );

  doc.save(nombreArchivo);
}
