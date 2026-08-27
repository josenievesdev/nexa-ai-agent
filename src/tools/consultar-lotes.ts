import { sql } from "../database/db.js";
import {
  enteroAcotado,
  identidadProducto,
  validarProductoId,
} from "./utilidades.js";

export type ConsultarLotesArgs = {
  producto_id: number;
  sucursal?: string | null;
  dias?: number | null;
  limite?: number | null;
  offset?: number | null;
};

const DIAS_MAXIMOS = 3650;

const LIMITE_POR_DEFECTO = 10;
const LIMITE_MINIMO = 5;
const LIMITE_MAXIMO = 50;

type FilaResumen = {
  total: number;
  unidades: number;
  activos: number;
  vencidos: number;
  proximo_vencimiento: string | null;
  dias_del_proximo_vencimiento: number | null;
};

type FilaLote = {
  sucursal: string;
  ubicacion: string;
  lote: string;
  vence: string;
  dias_para_vencer: number;
  estado: string;
  cantidad: number;
};

/*
 * Mismo contrato que consultar_ubicacion: identidad una vez,
 * resumen sobre todos los lotes del filtro, tope de filas con el
 * total declarado y fechas ya en YYYY-MM-DD.
 *
 * El próximo vencimiento viene calculado desde SQL porque es
 * exactamente el tipo de cifra derivada que el modelo se equivoca
 * al deducir: en la auditoría afirmó "2 lotes vencen en 2 días"
 * cuando el dato entregado decía uno.
 */
export async function consultarLotes(args: ConsultarLotesArgs) {
  const productoId = validarProductoId(args.producto_id);
  const sucursal = args.sucursal?.trim() || null;

  /*
   * dias es opcional de verdad: sin él se listan todos los lotes.
   * El modelo puede mandar cadena vacía, así que no basta con
   * comprobar null.
   */
  const diasRecibido = args.dias as unknown;

  const dias =
    diasRecibido === null ||
    diasRecibido === undefined ||
    diasRecibido === ""
      ? null
      : enteroAcotado(diasRecibido, 0, 0, DIAS_MAXIMOS);

  const limite = enteroAcotado(
    args.limite,
    LIMITE_POR_DEFECTO,
    LIMITE_MINIMO,
    LIMITE_MAXIMO
  );

  const offset = enteroAcotado(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const filtroSucursal = sucursal
    ? sql`and lower(sucursal) = lower(${sucursal})`
    : sql``;

  const filtroDias =
    dias === null ? sql`` : sql`and dias_para_vencer between 0 and ${dias}`;

  const [producto, resumen, lotes] = await Promise.all([
    identidadProducto(productoId),

    sql<FilaResumen[]>`
      select
        count(*)::int as total,
        coalesce(sum(cantidad_disponible), 0)::int as unidades,

        count(*) filter (
          where estado_lote = 'activo'
        )::int as activos,

        count(*) filter (
          where dias_para_vencer < 0
        )::int as vencidos,

        to_char(
          min(fecha_vencimiento) filter (where dias_para_vencer >= 0),
          'YYYY-MM-DD'
        ) as proximo_vencimiento,

        min(dias_para_vencer) filter (
          where dias_para_vencer >= 0
        )::int as dias_del_proximo_vencimiento

      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        ${filtroSucursal}
        ${filtroDias}
    `,

    sql<FilaLote[]>`
      select
        sucursal,

        concat_ws(
          ' / ',
          bodega,
          codigo_ubicacion
        ) as ubicacion,

        numero_lote as lote,
        to_char(fecha_vencimiento, 'YYYY-MM-DD') as vence,
        dias_para_vencer::int as dias_para_vencer,

        estado_lote as estado,
        cantidad_disponible::int as cantidad

      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        ${filtroSucursal}
        ${filtroDias}
      order by
        dias_para_vencer asc,
        sucursal,
        numero_lote
      limit ${limite}
      offset ${offset}
    `,
  ]);

  const totales = resumen[0];

  const total = totales?.total ?? 0;
  const mostrados = lotes.length;
  const hayMas = offset + mostrados < total;

  return {
    producto,

    consulta: {
      sucursal: sucursal ?? "todas",
      dias: dias ?? "sin límite",
    },

    resumen: {
      total,
      mostrados,
      unidades: totales?.unidades ?? 0,
      activos: totales?.activos ?? 0,
      vencidos: totales?.vencidos ?? 0,
      proximo_vencimiento: totales?.proximo_vencimiento ?? null,
      dias_del_proximo_vencimiento:
        totales?.dias_del_proximo_vencimiento ?? null,
    },

    paginacion: {
      limite,
      offset,
      hay_mas: hayMas,
      siguiente_offset: hayMas ? offset + mostrados : null,
    },

    lotes: [...lotes],
  };
}
