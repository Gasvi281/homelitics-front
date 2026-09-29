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
  const celda = "px-3 py-2 text-right tabular-nums";

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-sm">
        <caption className="px-3 pt-3 pb-1 text-left text-sm font-semibold text-neutral-900">
          Conversión por etapa
        </caption>
        <thead className="border-b border-neutral-200 text-xs text-neutral-600">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Etapa</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Leads</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Desde la anterior</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Del total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 text-neutral-900">
          {embudo.stages.map(s => {
            const esPeor = s.stage === peor?.stage;
            return (
              <tr key={s.stage} className={esPeor ? "bg-amber-50" : undefined}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {ETIQUETA_ETAPA[s.stage]}
                  {esPeor && (
                    <span className="ml-2 text-xs font-normal text-amber-900">(aquí se pierden más clientes)</span>
                  )}
                </th>
                <td className={celda}>{s.leads_reached}</td>
                <td className={celda}>{formatPorcentaje(s.pct_from_prev)}</td>
                <td className={celda}>{formatPorcentaje(s.pct_of_first)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-neutral-200 text-red-800">
          <tr>
            <th scope="row" className="px-3 py-2 text-left font-medium">{ETIQUETA_ETAPA.LOST}</th>
            <td className={celda}>{embudo.lost}</td>
            <td className={celda}>—</td>
            <td className={celda}>—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
