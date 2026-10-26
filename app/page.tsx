import Link from "next/link";
import { Logo } from "@/components/Logo";

/**
 * La raíz no tiene pantalla propia: el cliente siempre llega por un enlace
 * directo (agendar, su visita, la encuesta) y el agente entra al tablero.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo tamano="lg" />
      <p className="max-w-[46ch] text-base leading-relaxed text-tinta-suave">
        Si eres cliente, abre el enlace que te mandó tu asesor por Telegram para agendar o revisar tu
        visita.
      </p>
      <Link href="/tablero" className="btn btn-primario">
        Ir al tablero de leads
      </Link>
    </main>
  );
}
