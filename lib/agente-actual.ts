import "server-only";

import { cache } from "react";
import { api } from "./homelitics";

/**
 * El agente dueño de la credencial de esta petición (GET /me), para decidir
 * qué se muestra según su rol. `cache()` de React: el layout de (agente) y la
 * página que pinta adentro comparten una sola llamada por petición.
 *
 * Es solo para no mostrar botones inútiles. El API vuelve a verificar el rol
 * y responde 403 (reasignar, embudo); la pantalla igual tiene que manejarlo.
 */
export const obtenerAgenteActual = cache(() => api.yo());
