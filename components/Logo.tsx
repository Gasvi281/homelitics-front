/**
 * Marca de Homelitics: una burbuja de chat (la conversación con el
 * asistente) con un techo hecho de barras (los datos del embudo). La barra
 * del medio va en Sol. `sobreOscuro` aclara el texto para la barra lateral
 * del agente.
 */
export function Logo({
  tamano = "md",
  sobreOscuro = false,
}: {
  tamano?: "sm" | "md" | "lg";
  sobreOscuro?: boolean;
}) {
  const medidas = {
    sm: { icono: 28, texto: "text-xl" },
    md: { icono: 34, texto: "text-2xl" },
    lg: { icono: 48, texto: "text-4xl" },
  }[tamano];

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={medidas.icono}
        height={Math.round((medidas.icono * 56) / 60)}
        viewBox="0 0 60 56"
        aria-hidden="true"
        className="shrink-0"
      >
        <path
          d="M10 4 H50 A7 7 0 0 1 57 11 V37 A7 7 0 0 1 50 44 H24 L12 53 V44 H10 A7 7 0 0 1 3 37 V11 A7 7 0 0 1 10 4 Z"
          fill="#2448C9"
        />
        <rect x="16" y="26" width="7" height="10" rx="2" fill="#FFFFFF" />
        <rect x="26.5" y="17" width="7" height="19" rx="2" fill="#FFC83D" />
        <rect x="37" y="21" width="7" height="15" rx="2" fill="#FFFFFF" />
      </svg>
      <span
        className={`font-display font-extrabold tracking-[-0.035em] ${medidas.texto} ${
          sobreOscuro ? "text-white" : "text-tinta"
        }`}
      >
        homelitics
      </span>
    </span>
  );
}
