import { sql } from "./db.js";

async function main() {
  console.log("\n=== RESUMEN ===");

  const resumen = await sql`
    select
      (select count(*) from sucursales) as sucursales,
      (select count(*) from productos) as productos,
      (select count(*) from lotes) as lotes,
      (select count(*) from movimientos_inventario) as movimientos,
      (select count(*) from ventas) as ventas
  `;

  console.table(resumen);

  console.log("\n=== BUSCAR IBUPROFENO 400 MG ===");

  const busquedaIbuprofeno = await sql`
    select *
    from buscar_productos('ibuprofeno', '400 mg', 5)
  `;

  console.table(busquedaIbuprofeno);

  console.log("\n=== UBICACIÓN IBUPROFENO 400 MG EN CENTRO ===");

  const ubicacionIbuprofeno = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      bodega,
      codigo_ubicacion,
      nivel_estante,
      cantidad_disponible,
      numero_lote,
      fecha_vencimiento
    from vw_inventario_detallado
    where
      nombre_generico = 'Ibuprofeno'
      and concentracion = '400 mg'
      and sucursal = 'Centro'
      and cantidad_disponible > 0
    order by cantidad_disponible desc
  `;

  console.table(ubicacionIbuprofeno);

  console.log("\n=== ESCENARIO CONTROLADO: LORATADINA 10 MG EN CENTRO ===");

  const loratadina = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      stock_disponible,
      stock_minimo,
      punto_reorden,
      stock_maximo
    from vw_stock_producto_sucursal
    where
      nombre_generico = 'Loratadina'
      and concentracion = '10 mg'
      and sucursal = 'Centro'
  `;

  console.table(loratadina);

  console.log("\n=== ESCENARIO CONTROLADO: OMEPRAZOL 20 MG EN CENTRO ===");

  const omeprazol = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      numero_lote,
      fecha_vencimiento,
      dias_para_vencer,
      cantidad_disponible
    from vw_inventario_detallado
    where
      nombre_generico = 'Omeprazol'
      and concentracion = '20 mg'
      and sucursal = 'Centro'
      and estado_lote = 'activo'
    order by dias_para_vencer asc
    limit 5
  `;

  console.table(omeprazol);

  console.log("\n=== ESCENARIO CONTROLADO: VITAMINA C 500 MG EN SUR ===");

  const vitaminaC = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      stock_disponible,
      punto_reorden
    from vw_stock_producto_sucursal
    where
      nombre_generico = 'Vitamina C'
      and concentracion = '500 mg'
      and sucursal = 'Sur'
  `;

  console.table(vitaminaC);

  console.log("\n=== STOCK BAJO ===");

  const stockBajo = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      stock_disponible,
      punto_reorden
    from vw_productos_stock_bajo
    order by stock_disponible asc, sucursal, nombre_generico
    limit 15
  `;

  console.table(stockBajo);

  console.log("\n=== VENCIMIENTOS <= 60 DÍAS ===");

  const vencimientos = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      numero_lote,
      fecha_vencimiento,
      dias_para_vencer,
      cantidad_disponible
    from vw_lotes_por_vencer
    where dias_para_vencer <= 60
    order by dias_para_vencer asc
    limit 15
  `;

  console.table(vencimientos);

  console.log("\n=== MÁS VENDIDOS 30 DÍAS ===");

  const masVendidos = await sql`
    select
      sku,
      nombre_generico,
      concentracion,
      sucursal,
      unidades_vendidas_30d,
      ventas_30d
    from vw_ventas_producto_30d
    order by unidades_vendidas_30d desc, ventas_30d desc
    limit 15
  `;

  console.table(masVendidos);

  await sql.end();
}

main().catch(async (error) => {
  console.error("Error verificando la base de datos:");
  console.error(error);

  await sql.end({ timeout: 1 }).catch(() => undefined);

  process.exit(1);
});
