"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as EventoTecla } from "react";
import { Aviso } from "@/components/Aviso";
import { Cargando } from "@/components/Cargando";
import { useAgenteActual } from "@/features/agentes/AgenteActual";
import { ListaRecordatorios } from "@/features/seguimiento/components/ListaRecordatorios";
import { LIMITE_RECORDATORIOS, useRecordatoriosVencidos } from "@/features/seguimiento/hooks";
import { tiempoRelativo } from "@/lib/format";
import { useHidratado } from "@/lib/hidratado";
import type { NotificationOut } from "@/lib/schemas";
import {
  mensajeErrorAviso, useAvisosAnteriores, useDescartarAnteriores, useMarcarLeido, useMarcarTodosLeidos,
  useResumenAvisos,
} from "../hooks";
import { destinoAviso, fraseAviso } from "../texto";

type Pestana = "mensajes" | "recordatorios";
const PESTANAS: Pestana[] = ["mensajes", "recordatorios"];

/**
 * Campana del header (2.33): reemplaza a la campanita de recordatorios de
 * 2.26 y les suma los avisos del agente (GET /me/notifications). Dos
 * pestañas: "Mensajes" y "Recordatorios" (`ListaRecordatorios`).
 *
 * - Badge: `unread_count` del resumen. Sin datos (cargando, API dormido,
 *   error) no hay badge ni spinner: la campana queda quieta.
 * - Punto aparte si hay recordatorios vencidos.
 * - Clic en un mensaje: lo marca leído sin esperar al POST (es optimista,
 *   ver `useMarcarLeido`), cierra y navega a `destinoAviso`.
 *
 * Como la campana vieja, no se dibuja antes de hidratar ni si GET /me
 * falló: las queries viven en `Centro`, que se monta después. A diferencia
 * de ella, se ve también con 0: es la entrada a la bandeja.
 */
export function CentroAvisos() {
  const agente = useAgenteActual();
  const hidratado = useHidratado();
  if (!hidratado || !agente) return null;
  return <Centro agenteId={agente.id} />;
}

/** "3 avisos sin leer y 2 recordatorios vencidos"; sin nada, "Avisos". */
function describir(sinLeer: number, vencidos: number): string {
  const partes: string[] = [];
  if (sinLeer > 0) partes.push(sinLeer === 1 ? "1 aviso sin leer" : `${sinLeer} avisos sin leer`);
  if (vencidos > 0) {
    const n = vencidos >= LIMITE_RECORDATORIOS ? `${LIMITE_RECORDATORIOS}+` : String(vencidos);
    partes.push(vencidos === 1 ? "1 recordatorio vencido" : `${n} recordatorios vencidos`);
  }
  return partes.length === 0 ? "Avisos" : partes.join(" y ");
}

function Centro({ agenteId }: { agenteId: string }) {
  const resumen = useResumenAvisos(agenteId);
  const recordatorios = useRecordatoriosVencidos(agenteId);
  const [abierta, setAbierta] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("mensajes");
  // Sobrevive a la navegación (el layout no se desmonta): si marcar uno falla
  // después de navegar, se ve al volver a abrir. Se limpia al cerrar.
  const [errorMarcar, setErrorMarcar] = useState<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const idPanel = useId();
  const marcarUno = useMarcarLeido(agenteId, { alFallar: e => setErrorMarcar(mensajeErrorAviso(e, "uno")) });
  const marcarTodos = useMarcarTodosLeidos(agenteId, { alFallar: e => setErrorMarcar(mensajeErrorAviso(e, "todos")) });

  // Punto de partida de "Ver más": el `next_before` del resumen cuando se
  // pulsó. Queda fijo mientras el panel está abierto (ver `useAvisosAnteriores`).
  const [desde, setDesde] = useState<number | null>(null);
  const anteriores = useAvisosAnteriores(agenteId, desde);
  const descartarAnteriores = useDescartarAnteriores(agenteId);

  const cerrar = useCallback(() => {
    setAbierta(false);
    setPestana("mensajes");
    setErrorMarcar(null);
    // Sin las páginas de "Ver más" en caché, el polling vuelve a pedir una sola.
    setDesde(null);
    descartarAnteriores();
  }, [descartarAnteriores]);

  // Se cierra con Escape o con un clic fuera.
  useEffect(() => {
    if (!abierta) return;
    const alClic = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) cerrar();
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("mousedown", alClic);
    document.addEventListener("keydown", alTecla);
    return () => {
      document.removeEventListener("mousedown", alClic);
      document.removeEventListener("keydown", alTecla);
    };
  }, [abierta, cerrar]);

  const lista = resumen.data
    ? [...resumen.data.items, ...(anteriores.data?.pages.flatMap(p => p.items) ?? [])]
    : undefined;
  const hayMas = desde === null ? resumen.data?.next_before != null : anteriores.hasNextPage;
  const verMas = () => {
    if (desde === null) setDesde(resumen.data?.next_before ?? null);
    else void anteriores.fetchNextPage();
  };
  // 2.36: el id más alto ya visto. La primera carga solo lo guarda; una
  // relectura con uno mayor y sin leer saca el aviso flotante. En un ref y no
  // en el módulo: es de este agente y de esta pestaña.
  const mayorVisto = useRef<number | null>(null);
  const [nuevo, setNuevo] = useState<NotificationOut | null>(null);
  useEffect(() => {
    const items = resumen.data?.items;
    if (!items) return;
    const antes = mayorVisto.current;
    mayorVisto.current = items.reduce((mayor, a) => Math.max(mayor, a.id), antes ?? 0);
    if (antes === null) return;
    const masNuevo = items.filter(a => a.id > antes && !a.read).sort((a, b) => b.id - a.id)[0];
    if (masNuevo) setNuevo(masNuevo);
  }, [resumen.data]);
  // Estable: si cambiara en cada render, el polling reiniciaría los 6 s.
  const cerrarFlotante = useCallback(() => setNuevo(null), []);

  const sinLeer = resumen.data?.unread_count ?? 0;
  const vencidos = recordatorios.data?.length ?? 0;
  const etiqueta = describir(sinLeer, vencidos);
  const conteoVencidos = vencidos >= LIMITE_RECORDATORIOS ? `${LIMITE_RECORDATORIOS}+` : String(vencidos);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => (abierta ? cerrar() : setAbierta(true))}
        aria-expanded={abierta}
        aria-controls={idPanel}
        aria-label={etiqueta}
        title={etiqueta}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-borde bg-white text-tinta hover:border-tinta"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {sinLeer > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-sol px-1 text-center text-xs font-extrabold leading-5 text-tinta">
            {sinLeer > 99 ? "99+" : sinLeer}
          </span>
        )}
        {vencidos > 0 && (
          <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-alerta" />
        )}
      </button>

      {abierta && (
        <div
          id={idPanel}
          className="panel absolute right-0 z-20 mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden shadow-[0_16px_40px_rgba(19,48,58,0.2)]"
        >
          <Pestanas
            idBase={idPanel}
            activa={pestana}
            elegir={setPestana}
            conteoRecordatorios={vencidos > 0 ? conteoVencidos : null}
          />
          <div role="tabpanel" id={`${idPanel}-panel-${pestana}`} aria-labelledby={`${idPanel}-tab-${pestana}`}>
            {pestana === "mensajes" ? (
              <Mensajes
                avisos={lista}
                hayMas={hayMas}
                cargandoMas={anteriores.isFetching}
                errorMas={anteriores.isError}
                verMas={verMas}
                sinLeer={sinLeer}
                cargando={resumen.isPending}
                error={errorMarcar}
                marcarTodos={() => marcarTodos.mutate()}
                abrir={n => {
                  if (!n.read) marcarUno.mutate(n.id);
                  cerrar();
                }}
              />
            ) : (
              <ListaRecordatorios agenteId={agenteId} alAbrir={cerrar} />
            )}
          </div>
        </div>
      )}

      {/* La región vive siempre montada: un lector de pantalla anuncia lo que entra en ella. */}
      <div role="status" className="fixed bottom-4 right-4 z-30 w-96 max-w-[calc(100vw-2rem)]">
        {nuevo && <AvisoFlotante key={nuevo.id} aviso={nuevo} cerrar={cerrarFlotante} />}
      </div>
    </div>
  );
}

const DURACION_FLOTANTE_MS = 6_000;

/** "Nuevo aviso: …" abajo a la derecha; se va solo a los 6 s o con la equis. */
function AvisoFlotante({ aviso, cerrar }: { aviso: NotificationOut; cerrar: () => void }) {
  useEffect(() => {
    const t = setTimeout(cerrar, DURACION_FLOTANTE_MS);
    return () => clearTimeout(t);
  }, [cerrar]);

  return (
    <div className="rounded-2xl shadow-[0_16px_40px_rgba(19,48,58,0.2)]">
      <Aviso variante="info">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1">Nuevo aviso: {fraseAviso(aviso).frase}</p>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar el aviso"
            title="Cerrar el aviso"
            className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/60"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </Aviso>
    </div>
  );
}

/** Tablist con foco itinerante: Tab entra a la activa, las flechas cambian. */
function Pestanas({
  idBase, activa, elegir, conteoRecordatorios,
}: {
  idBase: string; activa: Pestana; elegir: (p: Pestana) => void; conteoRecordatorios: string | null;
}) {
  const botones = useRef<Partial<Record<Pestana, HTMLButtonElement | null>>>({});

  const alTecla = (e: EventoTecla) => {
    const i = PESTANAS.indexOf(activa);
    const siguiente = {
      ArrowRight: PESTANAS[(i + 1) % PESTANAS.length],
      ArrowLeft: PESTANAS[(i - 1 + PESTANAS.length) % PESTANAS.length],
      Home: PESTANAS[0],
      End: PESTANAS[PESTANAS.length - 1],
    }[e.key];
    if (!siguiente) return;
    e.preventDefault();
    elegir(siguiente);
    botones.current[siguiente]?.focus();
  };

  return (
    <div role="tablist" aria-label="Avisos" onKeyDown={alTecla} className="flex border-b border-hoja px-2">
      {PESTANAS.map(p => (
        <button
          key={p}
          ref={b => { botones.current[p] = b; }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${p}`}
          aria-selected={activa === p}
          aria-controls={`${idBase}-panel-${p}`}
          tabIndex={activa === p ? 0 : -1}
          onClick={() => elegir(p)}
          className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold ${
            activa === p ? "border-plano text-tinta" : "border-transparent text-tinta-tenue hover:text-tinta"
          }`}
        >
          {p === "mensajes" ? "Mensajes" : "Recordatorios"}
          {p === "recordatorios" && conteoRecordatorios && (
            <span className="rounded-full bg-alerta-claro px-2 text-xs leading-5 text-alerta-hondo">
              {conteoRecordatorios}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Mensajes({
  avisos, hayMas, cargandoMas, errorMas, verMas, sinLeer, cargando, error, marcarTodos, abrir,
}: {
  avisos: NotificationOut[] | undefined;
  hayMas: boolean;
  cargandoMas: boolean;
  errorMas: boolean;
  verMas: () => void;
  sinLeer: number;
  cargando: boolean;
  error: string | null;
  marcarTodos: () => void;
  abrir: (n: NotificationOut) => void;
}) {
  return (
    <>
      {sinLeer > 0 && (
        <div className="flex justify-end border-b border-hoja px-4 py-2">
          <button type="button" onClick={marcarTodos} className="text-xs font-semibold text-plano-texto hover:underline">
            Marcar todo como leído
          </button>
        </div>
      )}
      {error && (
        <div className="p-3">
          <Aviso variante="error">{error}</Aviso>
        </div>
      )}
      {!avisos ? (
        <div className="p-3">
          {cargando ? (
            <Cargando compacto mensaje="Cargando tus avisos." />
          ) : (
            <Aviso variante="error">No pudimos cargar tus avisos. Puede estar despertando; intenta en un momento.</Aviso>
          )}
        </div>
      ) : avisos.length === 0 ? (
        <p className="px-4 py-6 text-sm text-tinta-tenue">No tienes avisos todavía.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <ul className="divide-y divide-hoja">
            {avisos.map(n => (
              <Mensaje key={n.id} aviso={n} abrir={() => abrir(n)} />
            ))}
          </ul>
          {errorMas && (
            <div className="p-3">
              <Aviso variante="error">No pudimos cargar los avisos anteriores. Intenta de nuevo.</Aviso>
            </div>
          )}
          {hayMas && (
            <div className="flex justify-center border-t border-hoja p-3">
              <button
                type="button"
                onClick={verMas}
                disabled={cargandoMas}
                className="text-sm font-semibold text-plano-texto hover:underline disabled:cursor-wait disabled:no-underline disabled:opacity-70"
              >
                {cargandoMas ? "Cargando…" : "Ver más"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Mensaje({ aviso, abrir }: { aviso: NotificationOut; abrir: () => void }) {
  const { frase, etiqueta } = fraseAviso(aviso);
  return (
    <li>
      <Link href={destinoAviso(aviso)} onClick={abrir} className="flex gap-3 px-4 py-3 text-sm hover:bg-neblina">
        <span
          aria-hidden="true"
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${aviso.read ? "bg-transparent" : "bg-plano"}`}
        />
        <span className="min-w-0 flex-1">
          {!aviso.read && <span className="sr-only">Sin leer: </span>}
          <span className={aviso.read ? "text-tinta-suave" : "font-bold text-tinta"}>{frase}</span>
          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tinta-tenue">
            {tiempoRelativo(aviso.created_at)}
            {aviso.actor_role === "AI_AGENT" && <span className="insignia bg-plano-claro px-2 py-0 text-plano-texto">bot</span>}
            {etiqueta && (
              <span
                className={`insignia px-2 py-0 ${
                  etiqueta === "cancelada" ? "bg-alerta-claro text-alerta-hondo" : "bg-neblina text-tinta-suave"
                }`}
              >
                {etiqueta}
              </span>
            )}
          </span>
        </span>
      </Link>
    </li>
  );
}
