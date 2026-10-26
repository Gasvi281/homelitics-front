"use client";

import { useState } from "react";
import { apiPublico, HomeliticsError } from "@/lib/homelitics-navegador";
import type { Objection } from "@/lib/schemas";
import { Aviso } from "@/components/Aviso";

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
      await apiPublico.enviarEncuesta(appointmentId, {
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
      <Aviso variante="exito">
        <strong className="font-bold">Gracias por contarnos cómo te fue.</strong> Tu respuesta ya
        quedó registrada.
      </Aviso>
    );
  }

  const enviando = estado.tipo === "enviando";

  return (
    <section className="panel flex flex-col gap-7 px-10 py-9">
      <fieldset disabled={enviando} className="flex flex-col gap-7 disabled:opacity-70">
        <div role="group" aria-labelledby="encuesta-interes">
          <p id="encuesta-interes" className="mb-3 text-lg font-bold">¿Qué tan interesado quedaste en la propiedad?</p>
          <div className="grid grid-cols-5 overflow-hidden rounded-[18px] border-[1.5px] border-borde-fuerte">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setInteresScore(n)}
                aria-pressed={interesScore === n}
                className={`h-19 font-display text-[26px] font-extrabold transition-colors not-last:border-r-[1.5px] not-last:border-borde-fuerte ${
                  interesScore === n ? "bg-sol text-tinta" : "bg-white text-tinta hover:bg-neblina"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-sm text-tinta-tenue">
            <span>1, nada interesado</span>
            <span>5, muy interesado</span>
          </div>
        </div>

        <div role="group" aria-labelledby="encuesta-objecion">
          <p id="encuesta-objecion" className="mb-3 text-lg font-bold">
            ¿Algo que no te convenció?{" "}
            <span className="font-normal text-tinta-tenue">Elige uno, si aplica</span>
          </p>
          <div className="flex flex-wrap gap-2.5">
            {OBJECIONES.map((codigo) => (
              <button
                key={codigo}
                type="button"
                onClick={() => setObjecion((actual) => (actual === codigo ? null : codigo))}
                aria-pressed={objecion === codigo}
                className={`h-12 rounded-full px-5.5 text-[15px] transition-colors ${
                  objecion === codigo
                    ? "bg-tinta font-bold text-white"
                    : "border-[1.5px] border-borde-fuerte bg-white font-semibold text-tinta hover:border-tinta"
                }`}
              >
                {ETIQUETA_OBJECION[codigo]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="encuesta-texto-libre" className="text-lg font-bold">
            ¿Algo más que quieras contarnos? <span className="font-normal text-tinta-tenue">Opcional</span>
          </label>
          <textarea
            id="encuesta-texto-libre"
            value={textoLibre}
            onChange={(e) => setTextoLibre(e.target.value.slice(0, 2000))}
            rows={3}
            maxLength={2000}
            className="campo mt-2 rounded-[18px] px-4.5"
          />
        </div>
      </fieldset>

      {estado.tipo === "error" && <Aviso variante="error">{estado.mensaje}</Aviso>}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={enviar}
          disabled={interesScore === null || enviando}
          className="btn btn-lg btn-primario"
        >
          {enviando ? "Enviando tu opinión…" : "Enviar mi opinión"}
        </button>
        {interesScore === null && (
          <span className="text-sm text-tinta-suave">Para enviar, elige qué tan interesado quedaste.</span>
        )}
      </div>
    </section>
  );
}
