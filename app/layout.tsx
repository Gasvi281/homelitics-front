import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

/*
 * Fuentes servidas desde el repo (app/fuentes/, licencia OFL) y no con
 * next/font/google: así el build no depende de alcanzar Google Fonts, que en
 * algunos entornos de CI o de la universidad está bloqueado. Solo el
 * subconjunto latino, que cubre español completo.
 */
const figtree = localFont({
  src: "./fuentes/figtree.woff2",
  variable: "--font-figtree",
  weight: "300 900",
  display: "swap",
});

const bricolage = localFont({
  src: "./fuentes/bricolage-grotesque.woff2",
  variable: "--font-bricolage",
  weight: "200 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Homelitics",
  description: "Agenda visitas y sigue cada conversación con tus clientes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${figtree.variable} ${bricolage.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
