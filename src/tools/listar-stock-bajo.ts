import { sql } from "../database/db.js";
import { enteroAcotado } from "./utilidades.js";

export type ListarStockBajoArgs = {
  sucursal?: string | null;
  limite?: number | null;
  offset?: number | null;
};

/*
 * El tamaño de página lo decide la herramienta, no el modelo.
 *
 * limite sigue aceptándose por compatibilidad, pero con un piso:
 * el modelo llegó a pedir limite 1 para "el producto con menos
 * stock" y a declarar un ganador único donde había nueve productos
 * empatados en cero.
 */
const LIMITE_POR_DEFECTO = 15;
const LIMITE_MINIMO = 10;
const LIMITE_MAXIMO = 50;

type FilaResumen = {
  total: number;
  productos_distintos: number;
  sin_stock: number;
  unidades_para_reponer: number;
};

type FilaSucursal = {
  sucursal: string;
  registros: number;
  sin_stock: number;
};

type FilaProducto = {
  producto_id: number;
  sku: string;
  producto: string;
  marca: string | null;
  sucursal: string;
  stock_disponible: number;
  punto_reorden: number;
  faltante: number;
};

/*
 * Devuelve resumen + paginacion + productos.
 *
 * El resumen se calcula sobre TODAS las filas que cumplen el
 * filtro, no sobre la página: así el modelo nunca puede presentar
 * una lista parcial como si fuera el inventario completo.
 *
 * La vista es por producto y sucursal, de modo que `total` cuenta
 * combinaciones producto-sucursal y `productos_distintos` cuenta
 * productos.
 */
export async function listarStockBajo(args: ListarStockBajoArgs) {
  const limite = enteroAcotado(
    args.limite,
    LIMITE_POR_DEFECTO,
    LIMITE_MINIMO,
    LIMITE_MAXIMO
  );

  const offset = enteroAcotado(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const sucursal = args.sucursal?.trim() || null;

  const filtroSucursal = sucursal
    ? sql`and lower(sucursal) = lower(${sucursal})`
    : sql``;

  const [resumen, porSucursal, productos] = await Promise.all([
    sql<FilaResumen[]>`
      select
        count(*)::int as total,
        count(distinct producto_id)::int as productos_distintos,

        count(*) filter (
          where stock_disponible = 0
        )::int as sin_stock,

        coalesce(
          sum(
            greatest(coalesce(punto_reorden, 0) - stock_disponible, 0)
          ),
          0
        )::int as unidades_para_reponer

      from vw_productos_stock_bajo
      where true
        ${filtroSucursal}
    `,

    sql<FilaSucursal[]>`
      select
        sucursal,
        count(*)::int as registros,

        count(*) filter (
          where stock_disponible = 0
        )::int as sin_stock

      from vw_productos_stock_bajo
      where true
        ${filtroSucursal}
      group by sucursal
      order by
        registros desc,
        sucursal
    `,

    sql<FilaProducto[]>`
      select
        producto_id::int as producto_id,
        sku,

        concat_ws(
          ' ',
          nombre_generico,
          concentracion,
          presentacion
        ) as producto,

        nombre_comercial as marca,
        sucursal,

        stock_disponible::int as stock_disponible,
        coalesce(punto_reorden, 0)::int as punto_reorden,

        greatest(
          coalesce(punto_reorden, 0) - stock_disponible,
          0
        )::int as faltante

      from vw_productos_stock_bajo
      where true
        ${filtroSucursal}
      order by
        stock_disponible asc,
        sucursal,
        nombre_generico,
        sku
      limit ${limite}
      offset ${offset}
    `,
  ]);

  const totales = resumen[0];

  const total = totales?.total ?? 0;
  const mostrados = productos.length;
  const hayMas = offset + mostrados < total;

  return {
    consulta: {
      sucursal: sucursal ?? "todas",
    },

    resumen: {
      total,
      mostrados,
      productos_distintos: totales?.productos_distintos ?? 0,
      sin_stock: totales?.sin_stock ?? 0,
      unidades_para_reponer: totales?.unidades_para_reponer ?? 0,
      por_sucursal: [...porSucursal],
    },

    paginacion: {
      limite,
      offset,
      hay_mas: hayMas,
      siguiente_offset: hayMas ? offset + mostrados : null,
    },

    productos: [...productos],
  };
}
