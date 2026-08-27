/*
 * El modelo envía a veces cadenas, null o valores fuera de rango.
 * Number(null) es 0, así que no basta con Number().
 *
 * El mínimo no es cosmético: es lo que impide que el modelo
 * estreche la evidencia por su cuenta pidiendo una sola fila.
 */
export function enteroAcotado(
  valor: unknown,
  porDefecto: number,
  minimo: number,
  maximo: number
): number {
  if (valor === null || valor === undefined || valor === "") {
    return porDefecto;
  }

  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return porDefecto;
  }

  return Math.min(maximo, Math.max(minimo, Math.floor(numero)));
}
