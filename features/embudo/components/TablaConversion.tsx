import { ETIQUETA_ETAPA } from "@/lib/etapas";
import { formatPorcentaje } from "@/lib/format";
import type { Funnel } from "@/lib/schemas";
import { etapaConMayorCaida } from "../claves";

/**
 * Lo mismo que GraficaEmbudo, en una tabla: es lo que lee un lector de
 * pantalla y lo que se copia a una hoja de cálculo. La mayor caída se marca
 * con texto, no solo con color.
 */
export function TablaConversion({ embudo }: { embudo: Funnel }) {
  const peor = etapaConMayorCaida(embudo.stages);
  const celda = "px-4 py-3 text-right tabular-nums";

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[15px]">
        <caption className="px-6 pt-6 pb-2 text-left font-display text-[22px] font-bold">
          Conversión por etapa
        </caption>
        <thead className="border-b border-borde text-[13px] text-tinta-tenue">
          <tr>
            <th scope="col" className="px-4 py-2.5 pl-6 text-left font-semibold">Etapa</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Leads</th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">Desde la anterior</th>
            <th scope="col" className="px-4 py-2.5 pr-6 text-right font-semibold">Del total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hoja">
          {embudo.stages.map(s => {
            const esPeor = s.stage === peor?.stage;
            return (
              <tr key={s.stage} className={esPeor ? "bg-alerta-claro/60" : undefined}>
                <th scope="row" className="px-4 py-3 pl-6 text-left font-bold">
                  {ETIQUETA_ETAPA[s.stage]}
                  {esPeor && (
                    <span className="ml-2 text-[13px] font-normal text-alerta-hondo">(aquí se pierden más clientes)</span>
                  )}
                </th>
                <td className={celda}>{s.leads_reached}</td>
                <td className={celda}>{formatPorcentaje(s.pct_from_prev)}</td>
                <td className={celda}>{formatPorcentaje(s.pct_of_first)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-borde text-alerta-hondo">
          <tr>
            <th scope="row" className="px-4 py-3 pl-6 text-left font-bold">{ETIQUETA_ETAPA.LOST}</th>
            <td className={celda}>{embudo.lost}</td>
            <td className={celda}>—</td>
            <td className={celda}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
