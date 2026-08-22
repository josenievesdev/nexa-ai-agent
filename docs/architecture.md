# NEXA AI - Architecture Overview

## 1. Descripción general

NEXA AI es un agente inteligente empresarial basado en modelos locales de inteligencia artificial.

Su objetivo es permitir que usuarios consulten información de una organización utilizando lenguaje natural, conectando un modelo de lenguaje con fuentes de datos reales mediante herramientas especializadas.

A diferencia de un chatbot tradicional, NEXA no responde únicamente con información aprendida por el modelo, sino que utiliza herramientas controladas (tools) para consultar información actualizada proveniente de fuentes empresariales.

El modelo de inteligencia artificial no tiene acceso directo a las bases de datos. En su lugar, identifica qué información necesita y solicita la ejecución de herramientas especializadas que realizan las consultas correspondientes.

Ejemplo:

Usuario:

> ¿Dónde está el ibuprofeno de 400 mg?

Proceso:

1. El modelo interpreta la intención del usuario.

2. Selecciona la herramienta necesaria para identificar el producto.

3. La herramienta consulta la base de datos y obtiene la información correspondiente.

4. Se consultan herramientas adicionales para obtener ubicación y stock.

5. El modelo genera una respuesta utilizando información real obtenida desde los sistemas empresariales.


---

# 2. Arquitectura general


                 Usuario

                    |

                    |

             Lenguaje natural

                    |

                    v

              NEXA AI Agent

                    |

        -------------------------

        |                       |

        v                       v

   Qwen Local              Tool Layer

   Ollama                  (Functions)

                              |

              --------------------------------

              |              |               |

          Inventario      Ventas        Lotes

                              |

                              v

                         PostgreSQL

                         Supabase


---

# 3. Componentes principales


## 3.1 Modelo de inteligencia artificial

Tecnología:

- Ollama

- Qwen 3.5 4B


Responsabilidades:

- Interpretar la intención del usuario.

- Seleccionar las herramientas necesarias.

- Analizar los resultados obtenidos por las herramientas.

- Generar respuestas en lenguaje natural.


El modelo no tiene acceso directo a la base de datos ni ejecuta consultas SQL. Su función es tomar decisiones sobre qué herramientas utilizar y procesar la información que estas herramientas retornan.


---

## 3.2 Tool Layer

Las herramientas funcionan como una capa intermedia entre la inteligencia artificial y los datos empresariales.

Esta capa permite controlar qué información puede consultar el modelo y cómo interactúa con los sistemas internos.

Cada herramienta tiene una responsabilidad específica.

Actualmente:


### buscar_producto

Permite identificar productos mediante:

- Nombre.

- Alias.

- Presentación.

- Concentración.


Ejemplo:

"ibuprofeno 400 mg"


Resultado:

Producto identificado.


---

### consultar_stock

Consulta:

- Cantidad disponible.

- Stock mínimo.

- Punto de reorden.

- Distribución por sucursal.


---

### consultar_ubicacion

Consulta información física:

- Sucursal.

- Bodega.

- Pasillo.

- Estante.

- Nivel.

- Lote.


---

### consultar_lotes

Consulta:

- Número de lote.

- Fecha de vencimiento.

- Cantidad disponible.


---

### listar_stock_bajo

Permite identificar productos que requieren reabastecimiento.


---

### listar_lotes_por_vencer

Permite detectar productos próximos a vencimiento.


---

### consultar_mas_vendidos

Permite analizar comportamiento de ventas recientes.


---

# 4. Flujo de una consulta


Ejemplo:

Usuario:

"¿Dónde está el ibuprofeno de 400 mg?"


Proceso:


1. El usuario envía una pregunta en lenguaje natural.


2. NEXA AI recibe la consulta y el modelo analiza la intención.


3. El modelo determina que necesita identificar primero el producto y utiliza:

buscar_producto


4. La herramienta ejecuta la consulta correspondiente en PostgreSQL.


5. Obtiene:

Producto:

Ibuprofeno 400 mg


6. El modelo determina que necesita información física y utiliza:

consultar_ubicacion


7. La herramienta consulta nuevamente la base de datos y obtiene:

Sucursal:

Centro

Ubicación:

Bodega Principal

P01-E03-N2

Stock:

84 unidades


8. El modelo genera la respuesta final utilizando la información obtenida mediante las herramientas.


---

# 5. Tecnologías utilizadas


## Backend

- Node.js

- TypeScript


## Inteligencia Artificial

- Ollama

- Qwen 3.5 4B


## Base de datos

- PostgreSQL

- Supabase


## Desarrollo

- Git

- GitHub


---

# 6. Principios del diseño


## Datos primero

La información empresarial siempre debe venir de fuentes reales y actualizadas.


## Herramientas controladas

El modelo no ejecuta consultas directamente sobre la base de datos. Todas las interacciones con los datos se realizan mediante herramientas definidas y controladas.


## Modularidad

Cada nueva capacidad debe agregarse como una herramienta independiente.


## Escalabilidad

La arquitectura permite agregar nuevos módulos:

- Compras.

- Facturación.

- Clientes.

- Producción.

- Logística.


---

# 7. Próximas mejoras

- API backend para comunicación externa.

- Interfaz web.

- Integración con Telegram o WhatsApp.

- Más módulos empresariales.

- Registro de conversaciones y auditoría.