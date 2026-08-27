import { sql } from "../database/db.js";

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

export function validarProductoId(valor: unknown): number {
  const productoId = Number(valor);

  if (!Number.isInteger(productoId) || productoId <= 0) {
    throw new Error("producto_id debe ser un entero positivo.");
  }

  return productoId;
}

/*
 * La identidad del producto viajaba repetida en cada fila:
 * consultar_ubicacion devolvía cuatro filas con sku,
 * nombre_generico, nombre_comercial, concentracion y presentacion
 * en las cuatro, 1 661 bytes donde bastaba la mitad.
 *
 * Se resuelve una sola vez por consulta y va en la cabecera del
 * resultado. Se consulta la tabla y no la vista para que un
 * producto sin stock siga teniendo nombre en la respuesta.
 */
export type IdentidadProducto = {
  producto_id: number;
  sku: string;
  nombre: string;
  marca: string | null;
};

export async function identidadProducto(
  productoId: number
): Promise<IdentidadProducto | null> {
  const [fila] = await sql<IdentidadProducto[]>`
    select
      id::int as producto_id,
      sku,

      concat_ws(
        ' ',
        nombre_generico,
        concentracion,
        presentacion
      ) as nombre,

      nombre_comercial as marca

    from productos
    where id = ${productoId}
  `;

  return fila ?? null;
}
