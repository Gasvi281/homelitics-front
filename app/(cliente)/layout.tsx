import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

/**
 * Marco de las pantallas de quien busca vivienda. Sin sesión ni navegación:
 * el cliente llega por un enlace que le manda el asistente o el agente, así
 * que el encabezado solo dice dónde está y en qué hora se leen los horarios.
 */
export default function ClienteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-borde bg-white">
        <div className="mx-auto flex min-h-17 w-full max-w-[1360px] flex-wrap items-center justify-between gap-4 px-10">
          <Logo />
          <span className="text-sm text-tinta-suave">Todas las horas están en hora de Colombia</span>
        </div>
      </header>
      {children}
    </div>
  );
}
