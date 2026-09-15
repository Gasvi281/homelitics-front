"use client";

import { useState } from "react";
import { api, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Objection } from "@/lib/schemas";

const ETIQUETA_OBJECION: Record<Objection, string> = {
  PRICE: "Precio",
  SIZE: "Tamaño",
  LOCATION: "Ubicación",
  CONDITION: "Estado",
  HOA_FEE: "Administración",
  OTHER: "Otro",
};

const OBJECIONES = Object.keys(ETIQUETA_OBJECION) as Objection[];

type Estado =
  | { tipo: "listo" }
  | { tipo: "enviando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "enviada" };

/**
 * Tarea 2.5 — HU-14. Único Client Component de la encuesta: junta la
 * escala de interés (1 a 5), la objeción (un solo código a la vez, los seis
 * de docs/API_CONTRACT.md) y el texto libre, y manda
 * `POST /appointments/{id}/feedback` con `submitted_by: "CLIENT"` — la
 * llena el cliente, no el agente.
 *
 * El interés se exige antes de habilitar "Enviar" (mejor encuesta, no una en
 * blanco); la objeción y el texto libre quedan opcionales, igual que en el
 * API (`docs/API_CONTRACT.md`: todo opcional salvo `submitted_by`).
 *
 * No hay que cuidar un doble envío a mano: el API deja como mucho una fila
 * por lado y un segundo POST devuelve la primera en vez de fallar (ver
 * docs/API_CONTRACT.md). El caso de "ya se había enviado" igual se resuelve
 * antes, en el Server Component de la ruta, con `GET .../feedback`.
 */
export function EncuestaAcciones({ appointmentId }: { appointmentId: string }) {
  const [interesScore, setInteresScore] = useState<number | null>(null);
  const [objecion, setObjecion] = useState<Objection | null>(null);
  const [textoLibre, setTextoLibre] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "listo" });

  async function enviar() {
    if (interesScore === null) return;
    setEstado({ tipo: "enviando" });
    try {
      await api.enviarEncuesta(appointmentId, {
        submitted_by: "CLIENT",
        interest_score: interesScore,
        objection: objecion ?? undefined,
        free_text: textoLibre.trim() ? textoLibre.trim() : undefined,
      });
      setEstado({ tipo: "enviada" });
    } catch (e) {
      const mensaje =
        e instanceof HomeliticsError
          ? e.kind === "red"
            ? "No pudimos conectarnos con el servicio. Intenta de nuevo."
            : e.detail
          : "Algo salió mal. Intenta de nuevo.";
      setEstado({ tipo: "error", mensaje });
    }
  }

  if (estado.tipo === "enviada") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-sm text-green-700">
        Gracias por contarnos cómo te fue. Tu respuesta ya quedó registrada.
      </div>
    );
  }

  const enviando = estado.tipo === "enviando";

  return (
    <div className="rounded-lg border border-neutral-200 p-4 sm:p-6">
      <fieldset disabled={enviando}>
        <legend className="text-sm font-medium text-neutral-900">
          ¿Qué tan interesado quedaste en la propiedad?
        </legend>
        <div className="mt-3 flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setInteresScore(n)}
              aria-pressed={interesScore === n}
              className={`h-11 w-11 rounded-full border text-sm font-medium ${
                interesScore === n
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-700"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-neutral-400">1 nada interesado, 5 muy interesado</p>

        <div className="mt-6">
          <p className="text-sm font-medium text-neutral-900">¿Algo que no te convenció?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {OBJECIONES.map((codigo) => (
              <button
                key={codigo}
                type="button"
                onClick={() => setObjecion((actual) => (actual === codigo ? null : codigo))}
                aria-pressed={objecion === codigo}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  objecion === codigo
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-700"
                }`}
              >
                {ETIQUETA_OBJECION[codigo]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <label htmlFor="encuesta-texto-libre" className="text-sm font-medium text-neutral-900">
            ¿Algo más que quieras contarnos?
          </label>
          <textarea
            id="encuesta-texto-libre"
            value={textoLibre}
            onChange={(e) => setTextoLibre(e.target.value.slice(0, 2000))}
            rows={4}
            maxLength={2000}
            className="mt-2 w-full rounded border border-neutral-300 p-3 text-sm"
          />
        </div>
      </fieldset>

      {estado.tipo === "error" && <p className="mt-4 text-sm text-red-700">{estado.mensaje}</p>}

      <button
        type="button"
        onClick={enviar}
        disabled={interesScore === null || enviando}
        className="mt-6 w-full rounded bg-neutral-900 px-4 py-3 text-center font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
      >
        {enviando ? "Enviando…" : "Enviar"}
      </button>
    </div>
  );
}
