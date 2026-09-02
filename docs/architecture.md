# SIBIA AI - Architecture Overview

## 1. Descripción general

SIBIA AI es un agente inteligente empresarial diseñado para permitir la consulta de información organizacional mediante lenguaje natural.

El sistema conecta un modelo de lenguaje local con fuentes de datos empresariales reales utilizando herramientas controladas, conocidas como tools.

El objetivo de SIBIA AI no es reemplazar los sistemas empresariales existentes, sino crear una capa inteligente de interacción que permita consultar información de forma más rápida y natural.

Ejemplo:

> ¿Dónde está el ibuprofeno de 400 mg en la sucursal Centro?

En lugar de navegar manualmente por módulos, filtros y reportes, SIBIA interpreta la consulta, identifica qué información necesita, utiliza herramientas autorizadas y genera una respuesta basada en los datos obtenidos.

El modelo de inteligencia artificial no tiene acceso directo a PostgreSQL ni ejecuta consultas SQL arbitrarias.

La base de datos continúa siendo la fuente de verdad del sistema.


---

# 2. Problema que busca resolver

Los sistemas empresariales suelen almacenar grandes cantidades de información estructurada:

- Inventarios.
- Productos.
- Ventas.
- Lotes.
- Ubicaciones.
- Proveedores.
- Compras.
- Facturación.
- Producción.
- Logística.

Sin embargo, acceder a esta información normalmente requiere conocer la interfaz del software, los módulos disponibles, filtros, reportes y procesos internos.

SIBIA AI propone una capa de lenguaje natural sobre estos sistemas.

Flujo tradicional:

```text
Empleado
   ↓
Software empresarial
   ↓
Módulo
   ↓
Filtros
   ↓
Reporte
   ↓
Información
```

Con SIBIA:

```text
Empleado
   ↓
Pregunta en lenguaje natural
   ↓
SIBIA AI
   ↓
Información empresarial
```


---

# 3. Arquitectura general

```text
                         USUARIO
                            │
                            ▼
                   Lenguaje natural
                            │
                            ▼
                     SIBIA AI Agent
                            │
                            ▼
                  Modelo local de IA
                    Ollama + Qwen
                            │
                   solicita una tool
                            │
                            ▼
                       Tool Layer
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
     Inventario           Ventas            Lotes
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                            ▼
                  PostgreSQL / Supabase
                            │
                            ▼
                   Resultado estructurado
                            │
                            ▼
                     SIBIA AI Agent
                            │
                            ▼
                   Modelo local de IA
                            │
                            ▼
                    Respuesta al usuario
```


---

# 4. Principio fundamental de seguridad

SIBIA AI separa claramente el modelo de lenguaje de la base de datos.

Arquitectura NO utilizada:

```text
Qwen
  ↓
SQL generado libremente
  ↓
PostgreSQL
```

Arquitectura utilizada:

```text
Qwen
  ↓
Tool autorizada
  ↓
Consulta definida en TypeScript
  ↓
PostgreSQL
```

El modelo puede decidir qué herramienta necesita utilizar, pero no recibe credenciales de base de datos ni puede generar y ejecutar consultas SQL arbitrarias.

Esto permite:

- Controlar qué operaciones están disponibles.
- Reducir riesgos de seguridad.
- Evitar consultas destructivas.
- Facilitar auditoría.
- Mantener reglas de negocio fuera del modelo.
- Separar razonamiento conversacional de acceso a datos.


---

# 5. Componentes principales

## 5.1 SIBIA AI Agent

El agente funciona como orquestador del sistema.

Responsabilidades:

- Recibir la consulta del usuario.
- Mantener el contexto conversacional.
- Enviar mensajes al modelo local.
- Recibir solicitudes de herramientas.
- Ejecutar las tools autorizadas.
- Devolver resultados al modelo.
- Repetir el proceso cuando sean necesarias varias herramientas.
- Entregar la respuesta final al usuario.


---

## 5.2 Modelo de inteligencia artificial

Tecnología actual:

- Ollama.
- Qwen 3.5 4B.

Responsabilidades:

- Interpretar la intención del usuario.
- Identificar qué información necesita.
- Seleccionar herramientas.
- Procesar resultados estructurados.
- Mantener contexto conversacional.
- Generar respuestas naturales.

El modelo NO debe:

- Acceder directamente a PostgreSQL.
- Ejecutar SQL.
- Inventar información empresarial.
- Crear SKU.
- Crear códigos de barras.
- Crear cantidades.
- Crear lotes.
- Crear precios.
- Crear ubicaciones.
- Sustituir campos empresariales por otros similares.

Actualmente se está evaluando la posibilidad de utilizar un modelo local de mayor capacidad para mejorar el comportamiento del agente.


---

# 6. Tool Layer

La Tool Layer es la capa que conecta el agente con los datos empresariales.

Cada herramienta representa una capacidad específica y controlada.

Actualmente SIBIA dispone de las siguientes herramientas.


## 6.1 buscar_producto

Permite identificar productos utilizando:

- Nombre genérico.
- Nombre comercial.
- Alias.
- Concentración.
- Presentación.
- SKU.
- Código de barras.

Ejemplo:

```text
ibuprofeno 400 mg
```

Puede devolver información como:

```text
producto_id: 6
sku: MED-0006
codigo_barras: 7709000000006
nombre_generico: Ibuprofeno
nombre_comercial: IbuNova
concentracion: 400 mg
forma_farmaceutica: Tableta
presentacion: Caja x 20 tabletas
```


---

## 6.2 consultar_stock

Permite consultar:

- Stock físico.
- Stock reservado.
- Stock disponible.
- Sucursal.
- Stock mínimo.
- Punto de reorden.
- Stock máximo.
- Lotes activos.
- Ubicaciones con stock.


---

## 6.3 consultar_ubicacion

Permite consultar la ubicación física de un producto:

- Sucursal.
- Bodega.
- Pasillo.
- Estante.
- Nivel.
- Código de ubicación.
- Lote.
- Cantidad disponible.


---

## 6.4 consultar_lotes

Permite consultar:

- Número de lote.
- Fecha de vencimiento.
- Días restantes.
- Cantidad disponible.
- Sucursal.


---

## 6.5 listar_stock_bajo

Permite identificar productos que requieren reabastecimiento.

Actualmente también devuelve información suficiente para continuar procesos operativos:

- producto_id.
- SKU.
- Código de barras.
- Nombre genérico.
- Nombre comercial.
- Concentración.
- Forma farmacéutica.
- Presentación.
- Sucursal.
- Stock disponible.
- Stock mínimo.
- Punto de reorden.

Esto permite que una consulta como:

> ¿Qué productos necesitan reabastecimiento?

pueda continuar con:

> Dame los SKU y códigos de barras para buscarlos en el software.


---

## 6.6 listar_lotes_por_vencer

Permite identificar productos próximos a vencimiento.

Puede utilizarse para:

- Alertas de vencimiento.
- Rotación de inventario.
- Priorización de salida.
- Control de pérdidas.


---

## 6.7 consultar_mas_vendidos

Permite analizar el comportamiento reciente de ventas.

Puede obtener:

- Producto.
- Sucursal.
- Unidades vendidas.
- Valor vendido.
- Número de ventas.


---

# 7. Flujo completo de una consulta

Ejemplo:

> ¿Dónde está el ibuprofeno de 400 mg en la sucursal Centro?

Flujo:

```text
Usuario
  │
  ▼
SIBIA recibe la pregunta
  │
  ▼
Qwen interpreta la intención
  │
  ▼
buscar_producto
  │
  ▼
PostgreSQL
  │
  ▼
Ibuprofeno 400 mg
producto_id = 6
  │
  ▼
Qwen analiza el resultado
  │
  ▼
consultar_ubicacion
  │
  ▼
PostgreSQL
  │
  ▼
Sucursal Centro
Bodega Principal
P01-E03-N2
84 unidades
  │
  ▼
Qwen genera respuesta
  │
  ▼
Usuario
```


---

# 8. Ejemplo real de Tool Calling

Consulta:

```text
¿Dónde está el ibuprofeno de 400 mg en la sucursal Centro?
```

Primera decisión:

```text
[TOOL REQUEST] buscar_producto
```

Argumentos:

```json
{
  "nombre": "ibuprofeno",
  "presentacion": "400 mg"
}
```

Resultado relevante:

```json
{
  "producto_id": "6",
  "sku": "MED-0006",
  "codigo_barras": "7709000000006",
  "nombre_generico": "Ibuprofeno",
  "nombre_comercial": "IbuNova",
  "concentracion": "400 mg",
  "presentacion": "Caja x 20 tabletas"
}
```

Segunda decisión:

```text
[TOOL REQUEST] consultar_ubicacion
```

Argumentos:

```json
{
  "producto_id": 6,
  "sucursal": "Centro"
}
```

Resultado:

```json
{
  "sucursal": "Centro",
  "bodega": "Bodega Principal",
  "codigo_ubicacion": "P01-E03-N2",
  "pasillo": "P01",
  "estante": "E03",
  "nivel_estante": 2,
  "cantidad_disponible": 84
}
```

Respuesta final:

```text
El ibuprofeno de 400 mg se encuentra en la sucursal Centro,
en la Bodega Principal, ubicación P01-E03-N2.
```


---

# 9. Identidad de productos

Durante el desarrollo se estableció una identidad consistente para los productos.

Ejemplo:

```text
producto_id
6
```

Identificador técnico utilizado internamente por PostgreSQL y las tools.

```text
sku
MED-0006
```

Código interno comercial del producto.

```text
codigo_barras
7709000000006
```

Código utilizado para identificación mediante sistemas o lectores.

Estos tres valores son diferentes y no deben intercambiarse.

La estructura base incluye también:

```text
nombre_generico
nombre_comercial
concentracion
forma_farmaceutica
presentacion
```

Las vistas principales de inventario, stock, ventas y lotes fueron actualizadas para mantener esta identidad de forma consistente.


---

# 10. Base de datos

SIBIA utiliza PostgreSQL alojado actualmente en Supabase.

El modelo de datos incluye:

- Empresas.
- Sucursales.
- Bodegas.
- Ubicaciones.
- Categorías.
- Laboratorios.
- Productos.
- Alias de productos.
- Proveedores.
- Relación producto-proveedor.
- Parámetros de inventario.
- Lotes.
- Inventario.
- Movimientos de inventario.
- Pedidos de compra.
- Detalles de pedidos.
- Ventas.
- Detalles de ventas.


---

# 11. Vistas empresariales

Para evitar consultas complejas repetidas desde las tools se utilizan vistas especializadas.

Actualmente:

```text
vw_inventario_detallado
vw_stock_producto_sucursal
vw_lotes_por_vencer
vw_productos_stock_bajo
vw_ventas_producto_30d
```

Estas vistas actúan como contratos de datos entre PostgreSQL y las herramientas del agente.


---

# 12. Búsqueda flexible de productos

PostgreSQL incluye una función:

```text
buscar_productos()
```

La búsqueda puede considerar:

- Nombre genérico.
- Nombre comercial.
- Alias.
- SKU.
- Código de barras.
- Concentración.
- Presentación.
- Similitud mediante pg_trgm.
- Normalización mediante unaccent.

Ejemplo:

```sql
select *
from buscar_productos(
  'ibuprofeno',
  '400 mg',
  10
);
```

También permite:

```sql
buscar_productos('MED-0006', null, 10)
```

o buscar directamente utilizando un código de barras.


---

# 13. Grounding y prevención de alucinaciones

Uno de los problemas detectados durante el desarrollo fue que el modelo podía generar información empresarial no presente en las herramientas.

Ejemplo detectado:

```text
Usuario:
Dame los SKU y códigos de barras.
```

El modelo llegó a generar códigos que no existían en PostgreSQL.

Este comportamiento es inaceptable en un sistema empresarial.

Por esta razón se reforzó el grounding del agente.

Reglas actuales:

```text
Datos empresariales
        ↓
deben provenir de tools
```

Si una consulta requiere ubicación:

```text
consultar_ubicacion debe ejecutarse
```

Si requiere stock:

```text
consultar_stock debe ejecutarse
```

Si requiere lotes:

```text
consultar_lotes debe ejecutarse
```

Si requiere stock bajo:

```text
listar_stock_bajo debe ejecutarse
```

El agente también diferencia explícitamente:

```text
producto_id ≠ SKU ≠ código de barras
```

Si una herramienta no proporciona un campo solicitado, el modelo no debe inventarlo.


---

# 14. Observabilidad

Durante el desarrollo se añadió un sistema de logs para observar el comportamiento del agente.

Antes solamente se observaba:

```text
Usuario → Respuesta
```

Actualmente pueden observarse las diferentes etapas:

```text
[USER]

[MODEL]

[TOOL REQUEST]

[TOOL RESPONSE]

[REQUEST COMPLETE]
```

Ejemplo:

```text
[USER]
¿Dónde está el ibuprofeno de 400 mg?

[MODEL] Iteración 1: 4898 ms

[TOOL REQUEST] buscar_producto

[TOOL RESPONSE] buscar_producto: 932 ms

[MODEL] Iteración 2: 3818 ms

[TOOL REQUEST] consultar_ubicacion

[TOOL RESPONSE] consultar_ubicacion: 172 ms

[MODEL] Iteración 3: 3842 ms

[REQUEST COMPLETE] 22652 ms
```

Esto permite detectar:

- Tools incorrectas.
- Tools no ejecutadas.
- Respuestas vacías.
- Alucinaciones.
- Errores de argumentos.
- Lentitud del modelo.
- Lentitud de PostgreSQL.


---

# 15. Rendimiento

Las pruebas de observabilidad mostraron que actualmente el principal cuello de botella no es PostgreSQL.

Ejemplo aproximado:

```text
Tiempo PostgreSQL / Tool:
< 1 segundo en la mayoría de consultas

Tiempo del modelo:
varios segundos por iteración
```

En consultas grandes, la generación final del modelo puede superar ampliamente el tiempo utilizado por la base de datos.

Esto indica que las próximas optimizaciones deben concentrarse principalmente en:

- Modelo local.
- Tamaño de contexto.
- Cantidad de datos enviados al modelo.
- Diseño de tools.
- Longitud del historial.
- Cantidad de iteraciones del agente.


---

# 16. Memoria conversacional

Inicialmente SIBIA guardaba dentro del historial:

```text
Usuario
Assistant tool_call
Tool result
Assistant tool_call
Tool result
Respuesta
```

Esto hacía que el contexto creciera rápidamente.

Actualmente el historial persistido entre preguntas conserva principalmente:

```text
Usuario
Respuesta
```

Los resultados internos de las tools continúan disponibles durante la consulta actual, pero no se conservan innecesariamente para todas las consultas siguientes.

Esto reduce:

- Tamaño del contexto.
- Tokens procesados.
- Tiempo de inferencia.
- Ruido para el modelo.


---

# 17. Migraciones de base de datos

El proyecto diferencia entre:

```text
database/schema.sql
```

y:

```text
database/migrations/
```

`schema.sql` representa la estructura completa para crear una base desde cero.

Las migraciones permiten actualizar una base existente sin eliminar información.

Ejemplo:

```text
database/migrations/001_product_identity.sql
```

Esta migración incorporó una identidad consistente de producto en vistas y funciones existentes.


---

# 18. Estructura actual del proyecto

```text
sibia-ai-agent/
│
├── database/
│   ├── migrations/
│   │   └── 001_product_identity.sql
│   ├── schema.sql
│   └── seed.sql
│
├── docs/
│   └── architecture.md
│
├── src/
│   ├── ai/
│   │   └── ollama.ts
│   │
│   ├── database/
│   │   ├── db.ts
│   │   ├── setup-db.ts
│   │   └── check-db.ts
│   │
│   ├── tools/
│   │   ├── buscar-producto.ts
│   │   ├── consultar-stock.ts
│   │   ├── consultar-ubicacion.ts
│   │   ├── consultar-lotes.ts
│   │   ├── listar-stock-bajo.ts
│   │   ├── listar-lotes-por-vencer.ts
│   │   ├── consultar-mas-vendidos.ts
│   │   └── index.ts
│   │
│   └── index.ts
│
├── .env
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
└── tsconfig.json
```


---

# 19. Tecnologías utilizadas

## Backend

- Node.js.
- TypeScript.

## Inteligencia Artificial

- Ollama.
- Qwen 3.5 4B.

## Base de datos

- PostgreSQL.
- Supabase.

## Control de versiones

- Git.
- GitHub.

## Base de datos avanzada

- pg_trgm.
- unaccent.
- Views.
- Functions.
- Migrations.


---

# 20. Estado actual

Actualmente SIBIA AI dispone de:

```text
Agente local funcional
Tool Calling
7 herramientas empresariales
PostgreSQL / Supabase
Base de datos de demostración
Búsqueda flexible de productos
Inventario por sucursal
Ubicación física
Control de lotes
Stock bajo
Ventas recientes
Identidad SKU / barcode
Grounding
Memoria conversacional
Logs
Métricas de rendimiento
Migraciones
Git / GitHub
```

La interfaz actual es una CLI ejecutada desde terminal.


---

# 21. Consultas demostrativas

SIBIA puede responder preguntas como:

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
¿Cuál es el SKU del ibuprofeno?
```

```text
¿Cuál es su código de barras?
```


---

# 22. Limitaciones actuales

El proyecto se encuentra en etapa de desarrollo.

Limitaciones actuales:

- El modelo local utilizado es pequeño.
- Puede cometer errores en selección o uso de tools.
- El grounding todavía debe reforzarse mediante validaciones deterministas.
- La interfaz actual es únicamente terminal.
- No existen usuarios ni autenticación.
- No existe API pública.
- No existe persistencia completa de conversaciones.
- El agente está acoplado a un único dominio demostrativo.
- Algunas capacidades empresariales todavía no tienen herramientas.


---

# 23. Próximas mejoras

## Corto plazo

- Completar identidad de productos en todas las tools.
- Crear herramientas adicionales de consulta de producto.
- Reforzar validación contra alucinaciones.
- Comparar modelos locales de mayor capacidad.
- Mejorar rendimiento.

## Mediano plazo

- Crear API backend.
- Crear interfaz web.
- Persistencia de conversaciones.
- Usuarios y permisos.
- Auditoría.

## Largo plazo

- Integración con Telegram.
- Integración con WhatsApp.
- Compras.
- Proveedores.
- Facturación.
- Clientes.
- Producción.
- Logística.
- Integración con sistemas ERP reales.


---

# 24. Arquitectura futura

```text
                ┌─────────────┐
                │     Web     │
                └──────┬──────┘
                       │
                ┌──────┴──────┐
                │   Telegram  │
                └──────┬──────┘
                       │
                ┌──────┴──────┐
                │  WhatsApp   │
                └──────┬──────┘
                       │
                       ▼
                 SIBIA API
                       │
                       ▼
                 SIBIA Agent
                       │
                       ▼
                  Tool Layer
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      PostgreSQL      ERP        APIs
```


---

# 25. Conclusión

SIBIA AI busca demostrar que un modelo de lenguaje puede convertirse en una interfaz inteligente sobre datos empresariales sin necesidad de darle acceso directo a los sistemas internos.

La arquitectura separa:

```text
Interpretación
     ↓
Modelo de IA

Operaciones
     ↓
Tools

Información
     ↓
Base de datos
```

El principio central del proyecto es:

> El modelo decide qué información necesita, las herramientas realizan operaciones controladas y la base de datos continúa siendo la fuente de verdad.

SIBIA AI no busca que el modelo conozca los datos de una empresa.

Busca que el modelo sepa cómo encontrar esos datos de forma segura, controlada y comprensible.