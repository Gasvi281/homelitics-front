"use client";

import { useState, type RefObject } from "react";
import { Channel } from "@/lib/schemas";
import { MAX_MENSAJE, mensajeErrorRegistro, useRegistrarMensaje } from "../hooks";

const ETIQUETA_CANAL_ENVIO: Record<Channel, string> = {
  TELEGRAM: "Telegram",
  IN_APP: "En la app",
  CALL: "Llamada",
};

/**
 * Copiar y "Ya lo envié" (tarea 2.23 — HU-12 AC3, parcial). La app no manda
 * el mensaje: el agente lo copia, lo envía desde su canal y vuelve a
 * confirmar. Solo entonces se registra la interacción; registrar un mensaje
 * que no salió sacaría al lead del riesgo sin motivo.
 *
 * "Ya lo envié" aparece cuando lo copiado es el mensaje que se ve: si cambia
 * después de copiar (el agente lo edita, o llega `{agent_name}` cuando
 * `GET /agents` termina de cargar), hay que copiarlo otra vez, para que lo
 * registrado sea lo que mandó. Si quedan faltantes, pide confirmación.
 */
export function EnviarMensaje({
  leadId, mensaje, canalLead, hayFaltantes, textarea,
}: {
  leadId: string;
  mensaje: string;
  canalLead: Channel;
  hayFaltantes: boolean;
  textarea: RefObject<HTMLTextAreaElement | null>;
}) {
  const registrar = useRegistrarMensaje(leadId);
  // El texto que el agente copió (o seleccionamos para que copiara a mano).
  const [copiado, setCopiado] = useState<string | null>(null);
  const [copiaManual, setCopiaManual] = useState(false);
  // `null` = el canal por el que llegó el lead.
  const [canalElegido, setCanalElegido] = useState<Channel | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [registrado, setRegistrado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canal = canalElegido ?? canalLead;
  const texto = mensaje.trim();
  const largo = mensaje.length > MAX_MENSAJE;
  const listoParaConfirmar = copiado !== null && copiado === mensaje;

  async function copiar() {
    setError(null);
    setRegistrado(false);
    setConfirmando(false);
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiaManual(false);
    } catch {
      // Sin permiso, sin HTTPS o sin la API: que lo copie a mano.
      textarea.current?.focus();
      textarea.current?.select();
      setCopiaManual(true);
    }
    setCopiado(mensaje);
  }

  function yaLoEnvie() {
    if (hayFaltantes && !confirmando) return setConfirmando(true);
    setError(null);
    registrar.mutate(
      { canal, texto },
      {
        onSuccess: () => {
          setCopiado(null);
          setConfirmando(false);
          setRegistrado(true);
        },
        onError: e => setError(mensajeErrorRegistro(e)),
      },
    );
  }

  const enviando = registrar.isPending;

  return (
    <div className="mt-3 rounded-2xl border border-borde p-3.5">
      <p className="text-xs text-tinta-tenue">
        El mensaje lo envías tú desde tu canal; la app solo lo registra en la línea de tiempo.
      </p>

      {largo && (
        <p role="alert" className="mt-2 text-sm text-alerta-hondo">
          El mensaje pasa de {MAX_MENSAJE} caracteres; acórtalo para poder registrarlo.
        </p>
      )}

      <button
        type="button"
        onClick={copiar}
        disabled={!texto || largo || enviando}
        className="btn btn-sm mt-2 bg-tinta text-white hover:bg-tinta-hondo"
      >
        {listoParaConfirmar ? "Copiar de nuevo" : "Copiar mensaje"}
      </button>

      {copiado !== null && !listoParaConfirmar && (
        <p className="mt-1 text-xs text-sol-texto">
          El mensaje cambió después de copiarlo (lo editaste o llegó un dato que faltaba). Cópialo otra vez
          para registrar lo que vas a enviar.
        </p>
      )}

      {listoParaConfirmar && (
        <div className="mt-3">
          <p role="status" className="text-xs text-tinta">
            {copiaManual
              ? "Tu navegador no dejó copiar. El texto quedó seleccionado: cópialo con Ctrl+C (o Cmd+C)."
              : "Mensaje copiado. Pégalo y envíalo desde tu canal."}
          </p>

          <label htmlFor="canal-envio" className="mt-2 block text-xs font-bold text-tinta">
            ¿Por dónde lo enviaste?
          </label>
          <select
            id="canal-envio"
            value={canal}
            onChange={e => setCanalElegido(e.target.value as Channel)}
            disabled={enviando}
            className="mt-1 block rounded border border-borde-fuerte px-2 py-1.5 text-sm text-tinta"
          >
            {Channel.options.map(c => (
              <option key={c} value={c}>
                {ETIQUETA_CANAL_ENVIO[c]}
                {c === canalLead ? " · por donde llegó" : ""}
              </option>
            ))}
          </select>

          {confirmando ? (
            <div role="alertdialog" aria-labelledby="confirmar-faltantes" className="mt-2 rounded-2xl bg-sol-claro p-3">
              <p id="confirmar-faltantes" className="text-sm text-sol-texto">
                El mensaje todavía tiene datos marcados como <span className="font-mono">[falta: …]</span>.
                ¿Lo enviaste así?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={yaLoEnvie}
                  disabled={enviando}
                  className="btn btn-sm bg-tinta text-white hover:bg-tinta-hondo"
                >
                  {enviando ? "Registrando…" : "Sí, lo envié así"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={enviando}
                  className="btn btn-sm btn-suave"
                >
                  Volver a revisarlo
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={yaLoEnvie}
              disabled={enviando}
              className="btn btn-sm mt-2 bg-tinta text-white hover:bg-tinta-hondo"
            >
              {enviando ? "Registrando…" : "Ya lo envié"}
            </button>
          )}
        </div>
      )}

      {registrado && (
        <p role="status" className="mt-2 text-sm text-montana-hondo">
          Listo: el mensaje quedó registrado en la línea de tiempo.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-alerta-hondo">{error}</p>}
    </div>
  );
}
