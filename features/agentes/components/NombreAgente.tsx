"use client";

import { nombreAgente, useAgentes } from "../hooks";

/**
 * El nombre de un agente a partir de su `agent_id` (el API solo da el id en
 * `LeadOut` y `LeadCard`). Mientras la lista no esté disponible —cargando o
 * con error— no pinta nada: quien lo usa
 * no debe depender de que aparezca. `prefijo` ("A cargo de ") va dentro del
 * mismo `<span>`, para que desaparezca junto con el nombre.
 */
export function NombreAgente({
  agentId,
  className,
  prefijo,
}: {
  agentId: string;
  className?: string;
  prefijo?: string;
}) {
  const estado = useAgentes();
  if (estado.estado !== "disponible") return null;
  const agente = estado.porId.get(agentId);
  if (!agente) return null;
  return <span className={className}>{prefijo}{nombreAgente(agente)}</span>;
}
