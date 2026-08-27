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
  registros: number;
  productos_distintos: number;
  sin_stock: number;
  con_stock: number;
  stock_minimo: number | null;
  en_el_minimo: number;
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
 * La vista es por producto y sucursal, de modo que `registros`
 * cuenta combinaciones producto-sucursal y `productos_distintos`
 * cuenta productos. Los nombres importan: con el campo llamado
 * `total` el modelo leyó `productos_distintos` como "los que sí
 * tienen stock" e informó 27 donde había 26.
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
      with filtradas as (
        select *
        from vw_productos_stock_bajo
        where true
          ${filtroSucursal}
      )
      select
        count(*)::int as registros,
        count(distinct producto_id)::int as productos_distintos,

        count(*) filter (
          where stock_disponible = 0
        )::int as sin_stock,

        count(*) filter (
          where stock_disponible > 0
        )::int as con_stock,

        min(stock_disponible)::int as stock_minimo,

        /*
         * Cuántas filas comparten el stock más bajo. Sin este
         * número el modelo corona un ganador único donde hay
         * empate, que es el modo de falla de C2.
         */
        count(*) filter (
          where stock_disponible = (
            select min(stock_disponible) from filtradas
          )
        )::int as en_el_minimo,

        coalesce(
          sum(
            greatest(coalesce(punto_reorden, 0) - stock_disponible, 0)
          ),
          0
        )::int as unidades_para_reponer

      from filtradas
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

  const total = totales?.registros ?? 0;
  const mostrados = productos.length;
  const hayMas = offset + mostrados < total;

  const stockMinimo = totales?.stock_minimo ?? null;
  const enElMinimo = totales?.en_el_minimo ?? 0;

  /*
   * El modelo deduce el mínimo leyendo las filas y se equivoca:
   * con nueve productos en cero llegó a nombrar uno con una
   * unidad. Las reglas del prompt no corrigieron eso; la
   * instrucción dentro del resultado sí, como ya ocurrió con
   * siguiente_paso en buscar_producto.
   */
  const nota =
    stockMinimo !== null && enElMinimo > 1
      ? `Hay ${enElMinimo} registros empatados en el stock más bajo (${stockMinimo} unidades). ` +
        "Está prohibido nombrar un único producto con menos stock: preséntalo como empate e indica cuántos son."
      : null;

  return {
    consulta: {
      sucursal: sucursal ?? "todas",
    },

    ...(nota ? { nota } : {}),

    resumen: {
      registros: total,
      productos_distintos: totales?.productos_distintos ?? 0,
      mostrados,
      sin_stock: totales?.sin_stock ?? 0,
      con_stock: totales?.con_stock ?? 0,
      stock_minimo: stockMinimo,
      productos_en_el_minimo: enElMinimo,
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
