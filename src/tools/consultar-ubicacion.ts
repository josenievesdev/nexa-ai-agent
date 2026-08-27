import { sql } from "../database/db.js";
import {
  enteroAcotado,
  identidadProducto,
  validarProductoId,
} from "./utilidades.js";

export type ConsultarUbicacionArgs = {
  producto_id: number;
  sucursal?: string | null;
  limite?: number | null;
  offset?: number | null;
};

/*
 * Hoy el máximo real son seis filas por producto, así que el tope
 * no duele. Pero sin él el diseño no acota nada: un producto con
 * muchos lotes activos devolvería un resultado sin límite hacia un
 * contexto de 6 144 tokens.
 */
const LIMITE_POR_DEFECTO = 10;
const LIMITE_MINIMO = 5;
const LIMITE_MAXIMO = 50;

type FilaResumen = {
  total: number;
  unidades_disponibles: number;
  sucursales: number;
  bodegas: number;
};

type FilaUbicacion = {
  sucursal: string;
  bodega: string;
  codigo_ubicacion: string;
  pasillo: string | null;
  estante: string | null;
  nivel: number | null;
  lote: string;
  vence: string;
  dias_para_vencer: number;
  cantidad: number;
};

/*
 * Devuelve la identidad del producto una sola vez y filas con lo
 * que varía. Antes cada fila repetía sku, nombre_generico,
 * nombre_comercial, concentracion y presentacion: 1 661 bytes para
 * cuatro ubicaciones.
 *
 * Las fechas salen ya como YYYY-MM-DD. Devolverlas como
 * "2027-02-17T00:00:00.000Z" obligaba al modelo a reformatear un
 * vencimiento, que es justo el dato donde un corrimiento de un día
 * importa.
 */
export async function consultarUbicacion(args: ConsultarUbicacionArgs) {
  const productoId = validarProductoId(args.producto_id);
  const sucursal = args.sucursal?.trim() || null;

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

  const [producto, resumen, ubicaciones] = await Promise.all([
    identidadProducto(productoId),

    sql<FilaResumen[]>`
      select
        count(*)::int as total,
        coalesce(sum(cantidad_disponible), 0)::int as unidades_disponibles,
        count(distinct sucursal)::int as sucursales,
        count(distinct bodega)::int as bodegas
      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        and estado_lote = 'activo'
        and fecha_vencimiento >= current_date
        and cantidad_disponible > 0
        ${filtroSucursal}
    `,

    sql<FilaUbicacion[]>`
      select
        sucursal,
        bodega,
        codigo_ubicacion,
        pasillo,
        estante,
        nivel_estante as nivel,

        numero_lote as lote,
        to_char(fecha_vencimiento, 'YYYY-MM-DD') as vence,
        dias_para_vencer::int as dias_para_vencer,

        cantidad_disponible::int as cantidad

      from vw_inventario_detallado
      where
        producto_id = ${productoId}
        and estado_lote = 'activo'
        and fecha_vencimiento >= current_date
        and cantidad_disponible > 0
        ${filtroSucursal}
      order by
        sucursal,
        fecha_vencimiento asc,
        cantidad_disponible desc,
        codigo_ubicacion
      limit ${limite}
      offset ${offset}
    `,
  ]);

  const totales = resumen[0];

  const total = totales?.total ?? 0;
  const mostradas = ubicaciones.length;
  const hayMas = offset + mostradas < total;

  return {
    producto,

    consulta: {
      sucursal: sucursal ?? "todas",
    },

    resumen: {
      total,
      mostradas,
      unidades_disponibles: totales?.unidades_disponibles ?? 0,
      sucursales: totales?.sucursales ?? 0,
      bodegas: totales?.bodegas ?? 0,
    },

    paginacion: {
      limite,
      offset,
      hay_mas: hayMas,
      siguiente_offset: hayMas ? offset + mostradas : null,
    },

    ubicaciones: [...ubicaciones],
  };
}
