"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { pingHealth, type Source } from "@/lib/insights/client";
import { useInsightsChat } from "./hooks";

export type MensajeInsights = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  sources?: Source[];
};

type EstadoInsights = {
  conversationId: string | null;
  mensajes: MensajeInsights[];
  isOpen: boolean;
  isPending: boolean;
  /** El servicio respondió 403: se esconde el formulario. */
  bloqueado: boolean;
  /** El texto del input. Vive aquí para devolverlo si el envío falla. */
  borrador: string;
  setBorrador: (texto: string) => void;
  enviar: () => Promise<void>;
  abrir: () => void;
  cerrar: () => void;
  nuevaConversacion: () => void;
};

const Contexto = createContext<EstadoInsights | null>(null);

// sessionStorage y no localStorage: la conversación es de esta pestaña y se
// va al cerrarla. Nunca guarda el token.
const CLAVE_CONVERSACION = "homelitics.insights";
const CLAVE_DESPIERTO = "homelitics.insights.despierto";

const NO_DISPONIBLE = "El asistente no está disponible, intenta de nuevo.";

type Guardado = { conversationId: string | null; mensajes: MensajeInsights[] };

function leerGuardado(): Guardado | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_CONVERSACION);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<Guardado>;
    if (!Array.isArray(datos.mensajes)) return null;
    return { conversationId: typeof datos.conversationId === "string" ? datos.conversationId : null, mensajes: datos.mensajes };
  } catch {
    return null;
  }
}

function guardar(datos: Guardado) {
  try {
    sessionStorage.setItem(CLAVE_CONVERSACION, JSON.stringify(datos));
  } catch {
    // Sin storage (modo privado, cuota): la conversación vive hasta recargar.
  }
}

/** true la primera vez en esta pestaña; después, false. */
function primeraApertura(): boolean {
  try {
    if (sessionStorage.getItem(CLAVE_DESPIERTO)) return false;
    sessionStorage.setItem(CLAVE_DESPIERTO, "1");
    return true;
  } catch {
    return true;
  }
}

const nuevoId = () => crypto.randomUUID();

/**
 * Estado del asistente de insights del admin. Lo monta `app/(agente)/layout.tsx`
 * solo para `TEAM_ADMIN`; vive en el layout, así que la conversación y el
 * panel abierto sobreviven a la navegación entre pantallas.
 *
 * Lo guardado se lee después de montar y no en el `useState` inicial: el
 * servidor no tiene sessionStorage y el primer render tiene que coincidir.
 */
export function InsightsProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeInsights[]>([]);
  const [cargado, setCargado] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);
  const [borrador, setBorrador] = useState("");
  const { enviar: preguntar, isPending } = useInsightsChat();

  useEffect(() => {
    const guardado = leerGuardado();
    if (guardado) {
      setConversationId(guardado.conversationId);
      setMensajes(guardado.mensajes);
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (cargado) guardar({ conversationId, mensajes });
  }, [cargado, conversationId, mensajes]);

  const enviar = useCallback(async () => {
    const texto = borrador.trim();
    if (!texto || isPending || bloqueado) return;
    const propio: MensajeInsights = { id: nuevoId(), role: "user", text: texto };
    // Un aviso de "no disponible" anterior ya no aplica.
    setMensajes(previos => [...previos.filter(m => m.role !== "system"), propio]);
    setBorrador("");

    const resultado = await preguntar(texto, conversationId);
    if (!resultado) return;
    if (resultado.ok) {
      const { reply, conversation_id, sources } = resultado.respuesta;
      // Si el servicio se reinició devuelve otro id: se adopta sin más.
      setConversationId(conversation_id);
      setMensajes(previos => [...previos, { id: nuevoId(), role: "assistant", text: reply, sources }]);
      return;
    }
    if (resultado.fallo === "sesion_vencida") return;
    // El texto vuelve al input y su burbuja sale: no se mandó.
    setMensajes(previos => previos.filter(m => m.id !== propio.id));
    setBorrador(texto);
    if (resultado.fallo === "solo_admin") setBloqueado(true);
    else setMensajes(previos => [...previos, { id: nuevoId(), role: "system", text: NO_DISPONIBLE }]);
  }, [borrador, isPending, bloqueado, preguntar, conversationId]);

  const abrir = useCallback(() => {
    setIsOpen(true);
    if (primeraApertura()) void pingHealth();
  }, []);

  const cerrar = useCallback(() => setIsOpen(false), []);

  const nuevaConversacion = useCallback(() => {
    setMensajes([]);
    setConversationId(null);
  }, []);

  const valor = useMemo<EstadoInsights>(
    () => ({
      conversationId, mensajes, isOpen, isPending, bloqueado, borrador, setBorrador, enviar, abrir, cerrar,
      nuevaConversacion,
    }),
    [conversationId, mensajes, isOpen, isPending, bloqueado, borrador, enviar, abrir, cerrar, nuevaConversacion],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useInsights(): EstadoInsights {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useInsights() necesita estar dentro de <InsightsProvider>.");
  return valor;
}
