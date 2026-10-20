/**
 * Descargar un archivo armado en el navegador (CSV y PDF del embudo y del
 * reporte de riesgo). Solo navegador: usa `document`.
 */
export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Después del clic: revocar en el mismo tick cancela la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
