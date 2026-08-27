# NEXA AI

Agente local de inteligencia artificial para consultar información empresarial mediante lenguaje natural, herramientas controladas y PostgreSQL.

NEXA AI conecta un modelo de lenguaje local con datos reales de una organización mediante herramientas especializadas, permitiendo consultar inventarios, ubicaciones, stock, lotes y ventas de forma conversacional.

## ¿Cómo funciona?

```text
Usuario
  ↓
NEXA AI Agent
  ↓
Modelo local
Ollama + Qwen
  ↓
Tool Calling
  ↓
Herramientas TypeScript
  ↓
PostgreSQL / Supabase
  ↓
Resultado estructurado
  ↓
Modelo
  ↓
Respuesta al usuario
```

El modelo de inteligencia artificial no accede directamente a la base de datos ni ejecuta consultas SQL arbitrarias.

Los datos empresariales son obtenidos mediante herramientas previamente definidas y controladas.

## Características actuales

- Inteligencia artificial local mediante Ollama.
- Modelo Qwen.
- Tool Calling.
- Integración con PostgreSQL y Supabase.
- Búsqueda flexible de productos.
- Consultas de inventario.
- Stock por sucursal.
- Ubicación física de productos.
- Detección de stock bajo.
- Control de lotes y vencimientos.
- Análisis de ventas recientes.
- Identificación mediante SKU y código de barras.
- Contexto conversacional.
- Logs de ejecución del agente.
- Medición de rendimiento.
- Migraciones de base de datos.

## Caso demostrativo

El prototipo actual utiliza una base de datos simulada de una farmacia.

Ejemplos de consultas:

```text
¿Dónde está el ibuprofeno de 400 mg en Centro?
```

```text
¿Cuánto stock tenemos en las otras sucursales?
```

```text
¿Qué productos necesitan reabastecimiento?
```

```text
¿Qué lotes vencen próximamente?
```

```text
¿Cuáles son los productos más vendidos?
```

```text
¿Cuál es el SKU y el código de barras de este producto?
```

## Herramientas actuales

```text
buscar_producto
consultar_stock
consultar_ubicacion
consultar_lotes
listar_stock_bajo
listar_lotes_por_vencer
consultar_mas_vendidos
```

## Tecnologías

- TypeScript
- Node.js
- Ollama
- Qwen
- PostgreSQL
- Supabase
- Git
- GitHub

## Estructura general

```text
database/
├── migrations/
├── schema.sql
└── seed.sql

docs/
└── architecture.md

src/
├── ai/
├── database/
├── tools/
└── index.ts
```

## Principio de arquitectura

NEXA utiliza una arquitectura basada en herramientas:

```text
Lenguaje natural
       ↓
Modelo local
       ↓
Herramientas controladas
       ↓
Datos empresariales
```

La base de datos continúa siendo la fuente de verdad.

El modelo interpreta la solicitud y selecciona herramientas, mientras que las herramientas realizan el acceso controlado a los datos.

## Estado actual

NEXA AI se encuentra actualmente en etapa de prototipo funcional y utiliza una interfaz CLI desde terminal.

Entre las siguientes etapas del proyecto se encuentran:

- API backend.
- Interfaz web.
- Usuarios y permisos.
- Persistencia de conversaciones.
- Auditoría.
- Integración con Telegram o WhatsApp.
- Nuevos módulos empresariales.
- Integración con sistemas ERP reales.

## Documentación técnica

La arquitectura completa del proyecto se encuentra en:

```text
docs/architecture.md
```