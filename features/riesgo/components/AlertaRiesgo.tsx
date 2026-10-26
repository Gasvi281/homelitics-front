"use client";

import Link from "next/link";
import { useHidratado } from "@/lib/hidratado";
import { useUmbral } from "@/lib/umbral-navegador";
import { useAgenteActual } from "@/features/agentes/AgenteActual";
import type { Agent } from "@/lib/schemas";
import { useLeadsEnRiesgo } from "../hooks";

const CINCO_MINUTOS = 5 * 60_000;

/**
 * Aviso del header (2.16 — HU-10 AC2): "N leads sin respuesta". GET
 * /leads/at-risk devuelve la agencia entera (bloqueo 10), así que un `AGENT`
 * cuenta solo los suyos (`agent_id`) y un `TEAM_ADMIN` todos.
 *
 * El admin enlaza al reporte por agente, /riesgo (2.17). El del agente va
 * al tablero y lleva también `?agente=` con su id: el tablero le
 * muestra la agencia entera, y sin ese filtro las tarjetas rojas no serían
 * las mismas N del aviso.
 *
 * No se dibuja nada con 0, mientras carga, si la consulta falla (el tablero
 * ya avisa del error) ni si GET /me falló: sin saber quién es, no hay qué
 * contar.
 *
 * Tampoco antes de hidratar, y por eso el `useQuery` vive en `Contador`,
 * que solo se monta después. Si se llamara en el render del servidor, el
 * header (que va antes que la página) crearía la key de riesgo vacía en el
 * caché, y el `HydrationBoundary` del tablero, al encontrarla ya creada,
 * dejaría su siembra para un efecto que en el servidor no corre: el HTML
 * saldría sin tarjetas rojas y la hidratación fallaría.
 */
export function AlertaRiesgo({ umbral }: { umbral: number }) {
  const agente = useAgenteActual();
  const hidratado = useHidratado();
  if (!hidratado || !agente) return null;
  return <Contador agente={agente} umbral={umbral} />;
}

function Contador({ agente, umbral }: { agente: Agent; umbral: number }) {
  const [horas] = useUmbral(umbral);
  const { data } = useLeadsEnRiesgo(horas, {
    refetchInterval: CINCO_MINUTOS,
    refetchOnWindowFocus: true,
  });

  if (!data) return null;

  const esAdmin = agente.role === "TEAM_ADMIN";
  const n = esAdmin ? data.length : data.filter(l => l.agent_id === agente.id).length;
  if (n === 0) return null;

  const href = esAdmin ? "/riesgo" : `/tablero?riesgo=1&agente=${agente.id}`;

  return (
    <Link
      href={href}
      title={`Sin respuesta hace más de ${horas} h`}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-alerta-claro px-4 text-sm font-bold text-alerta-hondo ring-1 ring-alerta-borde hover:ring-alerta"
    >
      {n === 1 ? "1 lead sin respuesta" : `${n} leads sin respuesta`}
    </Link>
  );
}
