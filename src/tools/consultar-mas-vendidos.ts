import { sql } from "../database/db.js";
import { enteroAcotado } from "./utilidades.js";

export type ConsultarMasVendidosArgs = {
  sucursal?: string | null;
  limite?: number | null;
  offset?: number | null;
};

const PERIODO_DIAS = 30;

/*
 * El tamaño de página lo decide la herramienta. limite se sigue
 * aceptando por compatibilidad, pero con piso: pedir una sola fila
 * para "el producto más vendido" es la misma forma de estrechar la
 * evidencia que se corrigió en listar_stock_bajo.
 */
const LIMITE_POR_DEFECTO = 10;
const LIMITE_MINIMO = 10;
const LIMITE_MAXIMO = 50;

type FilaResumen = {
  total: number;
  unidades_vendidas: number;
  ventas_totales: number;
};

type FilaSucursal = {
  sucursal: string;
  unidades: number;
  ventas: number;
};

type FilaProducto = {
  producto_id: number;
  sku: string;
  producto: string;
  marca: string | null;
  unidades: number;
  ventas: number;
  transacciones: number;
  por_sucursal: Record<string, number>;
};

/*
 * vw_ventas_producto_30d está agrupada por producto Y sucursal:
 * 188 filas para 81 productos. Ordenar esa vista directamente no
 * responde "cuáles son los productos más vendidos", porque compara
 * porciones de sucursal contra porciones de sucursal.
 *
 * Medido sobre la base real, el top 1 de la vista cruda es
 * Famotidina con 13 unidades en Norte, mientras que el producto
 * más vendido de la farmacia es Hidroclorotiazida con 25 unidades
 * sumando las tres sucursales.
 *
 * Por eso el ranking se calcula siempre por producto, y cada fila
 * lleva su reparto por sucursal para no perder ese detalle.
 */
export async function consultarMasVendidos(args: ConsultarMasVendidosArgs) {
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
        count(distinct producto_id)::int as total,

        coalesce(
          sum(unidades_vendidas_30d),
          0
        )::int as unidades_vendidas,

        round(
          coalesce(sum(ventas_30d), 0),
          2
        )::float8 as ventas_totales

      from vw_ventas_producto_30d
      where true
        ${filtroSucursal}
    `,

    sql<FilaSucursal[]>`
      select
        sucursal,
        sum(unidades_vendidas_30d)::int as unidades,
        round(sum(ventas_30d), 2)::float8 as ventas
      from vw_ventas_producto_30d
      where true
        ${filtroSucursal}
      group by sucursal
      order by
        unidades desc,
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

        sum(unidades_vendidas_30d)::int as unidades,
        round(sum(ventas_30d), 2)::float8 as ventas,
        sum(numero_ventas_30d)::int as transacciones,

        jsonb_object_agg(
          sucursal,
          unidades_vendidas_30d
        ) as por_sucursal

      from vw_ventas_producto_30d
      where true
        ${filtroSucursal}
      group by
        producto_id,
        sku,
        nombre_generico,
        concentracion,
        presentacion,
        nombre_comercial
      order by
        unidades desc,
        ventas desc,
        sku
      limit ${limite}
      offset ${offset}
    `,
  ]);

  const totales = resumen[0];

  const total = totales?.total ?? 0;
  const mostrados = productos.length;
  const hayMas = offset + mostrados < total;

  /*
   * Con una sucursal filtrada el desglose tendría una sola clave
   * repitiendo el dato que ya está en la fila y en consulta.
   */
  const filas = sucursal
    ? productos.map(({ por_sucursal, ...resto }) => resto)
    : [...productos];

  return {
    consulta: {
      periodo_dias: PERIODO_DIAS,
      sucursal: sucursal ?? "todas",
      agrupado_por: "producto",
    },

    resumen: {
      total,
      mostrados,
      unidades_vendidas: totales?.unidades_vendidas ?? 0,
      ventas_totales: totales?.ventas_totales ?? 0,
      por_sucursal: [...porSucursal],
    },

    paginacion: {
      limite,
      offset,
      hay_mas: hayMas,
      siguiente_offset: hayMas ? offset + mostrados : null,
    },

    productos: filas,
  };
}
