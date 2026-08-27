import { sql } from "../database/db.js";

export type ListarLotesPorVencerArgs = {
  dias?: number | null;
  sucursal?: string | null;
  limite?: number | null;
  offset?: number | null;
};

const DIAS_POR_DEFECTO = 30;
const DIAS_MAXIMOS = 180;

const LIMITE_POR_DEFECTO = 10;
const LIMITE_MAXIMO = 50;

type FilaResumen = {
  total_lotes: number;
  productos_distintos: number;
  unidades_en_riesgo: number;
  lotes_vencen_en_7_dias: number;
  lotes_vencen_en_15_dias: number;
  dias_del_proximo_vencimiento: number | null;
};

type FilaSucursal = {
  sucursal: string;
  lotes: number;
  unidades: number;
};

type FilaLote = {
  producto_id: string;
  sku: string;
  producto: string;
  sucursal: string;
  ubicacion: string;
  lote: string;
  vence: string;
  dias_para_vencer: number;
  cantidad: number;
};

/*
 * El modelo envía a veces cadenas, null o valores fuera de rango.
 * Number(null) es 0, así que no basta con Number().
 */
function enteroAcotado(
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

/*
 * Devuelve un objeto con tres partes:
 *
 * - resumen:     totales calculados sobre TODOS los lotes que
 *                cumplen el filtro, no sobre la página.
 * - paginacion:  permite pedir el resto sin perder información.
 * - lotes:       la página actual, en formato compacto.
 *
 * Esto evita que el modelo tenga que reproducir decenas de
 * registros completos para contestar una pregunta general, que
 * era la causa de done_reason: "length".
 */
export async function listarLotesPorVencer(args: ListarLotesPorVencerArgs) {
  const dias = enteroAcotado(args.dias, DIAS_POR_DEFECTO, 0, DIAS_MAXIMOS);

  const limite = enteroAcotado(
    args.limite,
    LIMITE_POR_DEFECTO,
    1,
    LIMITE_MAXIMO
  );

  const offset = enteroAcotado(args.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const sucursal = args.sucursal?.trim() || null;

  const filtroSucursal = sucursal
    ? sql`and lower(sucursal) = lower(${sucursal})`
    : sql``;

  const [resumen, porSucursal, lotes] = await Promise.all([
    sql<FilaResumen[]>`
      select
        count(*)::int as total_lotes,
        count(distinct producto_id)::int as productos_distintos,
        coalesce(sum(cantidad_disponible), 0)::int as unidades_en_riesgo,

        count(*) filter (
          where dias_para_vencer <= 7
        )::int as lotes_vencen_en_7_dias,

        count(*) filter (
          where dias_para_vencer <= 15
        )::int as lotes_vencen_en_15_dias,

        min(dias_para_vencer)::int as dias_del_proximo_vencimiento

      from vw_lotes_por_vencer
      where
        dias_para_vencer <= ${dias}
        ${filtroSucursal}
    `,

    sql<FilaSucursal[]>`
      select
        sucursal,
        count(*)::int as lotes,
        coalesce(sum(cantidad_disponible), 0)::int as unidades
      from vw_lotes_por_vencer
      where
        dias_para_vencer <= ${dias}
        ${filtroSucursal}
      group by sucursal
      order by
        lotes desc,
        sucursal
    `,

    sql<FilaLote[]>`
      select
        producto_id,
        sku,

        concat_ws(
          ' ',
          nombre_generico,
          concentracion,
          presentacion
        ) as producto,

        sucursal,

        concat_ws(
          ' / ',
          bodega,
          codigo_ubicacion
        ) as ubicacion,

        numero_lote as lote,

        to_char(fecha_vencimiento, 'YYYY-MM-DD') as vence,

        dias_para_vencer::int as dias_para_vencer,
        cantidad_disponible::int as cantidad

      from vw_lotes_por_vencer
      where
        dias_para_vencer <= ${dias}
        ${filtroSucursal}
      order by
        dias_para_vencer asc,
        sucursal,
        nombre_generico,
        numero_lote
      limit ${limite}
      offset ${offset}
    `,
  ]);

  const totales = resumen[0];

  const totalLotes = totales?.total_lotes ?? 0;
  const mostrados = lotes.length;
  const hayMas = offset + mostrados < totalLotes;

  return {
    consulta: {
      dias,
      sucursal: sucursal ?? "todas",
    },

    resumen: {
      total_lotes: totalLotes,
      lotes_mostrados: mostrados,
      productos_distintos: totales?.productos_distintos ?? 0,
      unidades_en_riesgo: totales?.unidades_en_riesgo ?? 0,
      lotes_vencen_en_7_dias: totales?.lotes_vencen_en_7_dias ?? 0,
      lotes_vencen_en_15_dias: totales?.lotes_vencen_en_15_dias ?? 0,
      dias_del_proximo_vencimiento:
        totales?.dias_del_proximo_vencimiento ?? null,
      por_sucursal: [...porSucursal],
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
