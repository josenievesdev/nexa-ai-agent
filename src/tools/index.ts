import { buscarProducto } from "./buscar-producto.js";
import { consultarStock } from "./consultar-stock.js";
import { consultarUbicacion } from "./consultar-ubicacion.js";
import { consultarLotes } from "./consultar-lotes.js";
import { listarStockBajo } from "./listar-stock-bajo.js";
import { listarLotesPorVencer } from "./listar-lotes-por-vencer.js";
import { consultarMasVendidos } from "./consultar-mas-vendidos.js";

type JsonObject = Record<string, unknown>;

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "buscar_producto",
      description:
        "Busca productos por nombre, SKU o código de barras. Usa codigo_barras cuando el usuario mencione un código de barras, sku cuando mencione un SKU y nombre únicamente cuando identifique el producto por su nombre. Nunca coloques un SKU o código de barras en nombre. Debe usarse antes de otras herramientas cuando todavía no se conoce el producto_id.",
      parameters: {
        type: "object",
        properties: {
          nombre: {
            type: "string",
            minLength: 1,
            description:
              "Nombre genérico, nombre comercial o alias del producto, por ejemplo ibuprofeno o paracetamol. No usar para SKU ni códigos de barras.",
          },
          sku: {
            type: "string",
            minLength: 1,
            description:
              "SKU empresarial del producto cuando el usuario menciona un SKU, por ejemplo MED-0006. No enviarlo en nombre.",
          },
          codigo_barras: {
            type: "string",
            minLength: 1,
            description:
              "Código de barras del producto cuando el usuario menciona un código de barras, por ejemplo 7709000000006. No enviarlo en nombre.",
          },
          presentacion: {
            type: "string",
            minLength: 1,
            description:
              "Concentración o presentación si el usuario la especifica, por ejemplo 400 mg, 100 mg/5 mL o caja x 20.",
          },
        },
        anyOf: [
          { required: ["nombre"] },
          { required: ["sku"] },
          { required: ["codigo_barras"] },
        ],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_stock",
      description:
        "Consulta el stock de un producto ya identificado. Puede devolver el stock por todas las sucursales o limitarlo a una sucursal.",
      parameters: {
        type: "object",
        properties: {
          producto_id: {
            type: "integer",
            description: "ID interno del producto obtenido con buscar_producto.",
          },
          sucursal: {
            type: ["string", "null"],
            description:
              "Nombre de la sucursal si el usuario indicó una, por ejemplo Centro, Norte o Sur.",
          },
        },
        required: ["producto_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_ubicacion",
      description:
        "Obtiene las ubicaciones físicas con stock disponible de un producto ya identificado: sucursal, bodega, pasillo, estante, nivel y lote.",
      parameters: {
        type: "object",
        properties: {
          producto_id: {
            type: "integer",
            description: "ID interno del producto obtenido con buscar_producto.",
          },
          sucursal: {
            type: ["string", "null"],
            description:
              "Sucursal a consultar si el usuario la especificó.",
          },
        },
        required: ["producto_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_lotes",
      description:
        "Consulta los lotes de un producto ya identificado, incluyendo fecha de vencimiento, días para vencer, ubicación, estado y cantidad.",
      parameters: {
        type: "object",
        properties: {
          producto_id: {
            type: "integer",
            description: "ID interno del producto obtenido con buscar_producto.",
          },
          sucursal: {
            type: ["string", "null"],
            description: "Sucursal opcional.",
          },
          dias: {
            type: ["integer", "null"],
            description:
              "Si se especifica, limita a lotes que vencen entre hoy y esa cantidad de días.",
          },
        },
        required: ["producto_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_stock_bajo",
      description:
        "Lista productos cuyo stock disponible está en o por debajo de su punto de reorden. Sirve para preguntas generales de reabastecimiento, faltantes y para saber qué producto tiene menos stock. Devuelve un objeto con resumen (totales sobre TODOS los productos que cumplen el filtro, incluidos cuántos están en cero), paginacion y la lista productos de la página actual. El tamaño de página lo fija la herramienta.",
      parameters: {
        type: "object",
        properties: {
          sucursal: {
            type: ["string", "null"],
            description: "Sucursal opcional.",
          },
          offset: {
            type: ["integer", "null"],
            description:
              "Número de productos a omitir para pedir la siguiente página. Usa el valor de paginacion.siguiente_offset de la llamada anterior. Por defecto 0.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_lotes_por_vencer",
      description:
        "Lista lotes de cualquier producto que vencen dentro de una cantidad de días. Úsala para preguntas generales sobre próximos vencimientos. Devuelve un objeto con resumen (totales sobre todos los lotes que cumplen el filtro), paginacion y la lista lotes de la página actual.",
      parameters: {
        type: "object",
        properties: {
          dias: {
            type: ["integer", "null"],
            description:
              "Número de días hacia adelante. Si no se indica, usa 30 días.",
          },
          sucursal: {
            type: ["string", "null"],
            description: "Sucursal opcional.",
          },
          limite: {
            type: ["integer", "null"],
            description:
              "Número de lotes por página. Por defecto 10 y máximo 50. Los totales del resumen siempre se calculan sobre todos los lotes, no sobre la página.",
          },
          offset: {
            type: ["integer", "null"],
            description:
              "Número de lotes a omitir para pedir la siguiente página. Usa el valor de paginacion.siguiente_offset de la llamada anterior. Por defecto 0.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_mas_vendidos",
      description:
        "Consulta los productos más vendidos durante los últimos 30 días. Puede filtrarse por sucursal.",
      parameters: {
        type: "object",
        properties: {
          sucursal: {
            type: ["string", "null"],
            description: "Sucursal opcional.",
          },
          limite: {
            type: ["integer", "null"],
            description: "Número máximo de resultados.",
          },
        },
      },
    },
  },
] as const;

function parseArguments(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  if (typeof value === "string") {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
  }

  return {};
}

export async function executeTool(
  name: string,
  rawArguments: unknown
): Promise<unknown> {
  const args = parseArguments(rawArguments);

  switch (name) {
    case "buscar_producto":
      return buscarProducto(args as Parameters<typeof buscarProducto>[0]);

    case "consultar_stock":
      return consultarStock(args as Parameters<typeof consultarStock>[0]);

    case "consultar_ubicacion":
      return consultarUbicacion(
        args as Parameters<typeof consultarUbicacion>[0]
      );

    case "consultar_lotes":
      return consultarLotes(args as Parameters<typeof consultarLotes>[0]);

    case "listar_stock_bajo":
      return listarStockBajo(
        args as Parameters<typeof listarStockBajo>[0]
      );

    case "listar_lotes_por_vencer":
      return listarLotesPorVencer(
        args as Parameters<typeof listarLotesPorVencer>[0]
      );

    case "consultar_mas_vendidos":
      return consultarMasVendidos(
        args as Parameters<typeof consultarMasVendidos>[0]
      );

    default:
      throw new Error(`Herramienta desconocida: ${name}`);
  }
}
