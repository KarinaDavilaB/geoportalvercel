# Geoportal Árbolado Urbano DMQ — Documentación

## Resumen
Geoportal web para el Distrito Metropolitano de Quito que visualiza capas geoespaciales (parroquias, quebradas, ríos, reserva de biosfera, puntos de inspección) servidas desde Supabase/PostGIS, con formulario de inspección para técnicos y exportación a Excel.

## Stack
- **Frontend:** Leaflet 1.9.4, HTML/CSS/JS vanilla
- **Backend:** Supabase (PostGIS), RPC functions
- **Deploy:** Vercel (credenciales en variables de entorno)
- **Repos:** `KarinaDavilaB/Geoportal_Arbolado_Urbano_DMQ` (original), `KarinaDavilaB/geoportalvercel` (Vercel)

---

## Archivos del proyecto

| Archivo | Descripción |
|---|---|
| `index.html` | Geoportal principal con sidebar lateral |
| `app.js` | Configuración de 6 capas, parser WKB, carga desde Supabase |
| `styles.css` | Estilos del geoportal (sidebar, mapa, leyenda) |
| `formulario_inspeccion.html` | Formulario de campo (UTM, parroquia, inspecciones previas, Excel) |
| `build.js` | Script de build para inyectar env vars en config.js |
| `vercel.json` | Configuración de Vercel |
| `.gitignore` | Excluye config.js y archivos de token |

---

## Base de datos (Supabase)

### Tablas
- `parroquias_dmq` — 65 parroquias del DMQ (gid, dpa_parroq, dpa_despar, geom)
- `puntos_az` — Puntos de inspección (gid, insp no [DOUBLE PRECISION], x, y, mm-yy, geom)
- `inspecciones_campo` — Inspecciones realizadas (id, fecha, hora, parroquia, coordenada_x, coordenada_y, utm_x, utm_y, utm_zona, tipo_inspeccion, arbol_riesgo, comentario, tecnico, estado, geom, created_at)

### Vistas (para consultas REST)
- `parroquias_dmq_geojson`
- `puntos_az_geojson`
- `inspecciones_campo_geojson`

### Funciones RPC
1. `obtener_parroquia_por_punto(lng, lat)` — Detecta parroquia via ST_Contains
2. `inspecciones_previas_az(lng, lat, radio_m)` — Busca inspecciones previas en puntos_az dentro de radio (default 10m)
3. `inspecciones_cerca_del_punto(lng, lat, radio_m)` — Busca en inspecciones_campo (referencia)

### Configuración de capas (TABLAS_CONFIG en app.js)
| Capa | Tipo | Color |
|---|---|---|
| parroquias_dmq | polígono | #555555 (sin relleno) |
| quebradas_dmq | línea | #00acc1 |
| rios_dmq | polígono | #1565c0 / #42a5f5 |
| reserva_biosfera_dmq | polígono | #2e7d32 / #66bb6a |
| puntos_az | punto | #e65100 |
| inspecciones_campo | punto | #eab308 (amarillo) |

---

## Funcionalidades

### Geoportal (index.html + app.js)
- Sidebar lateral izquierdo fijo (300px) con checkboxes de capas
- Botones: Cargar geoportal, Centrar en DMQ, Formulario de inspección
- Mapa base: OpenStreetMap + Satélite (Esri)
- Leyenda en esquina inferior derecha
- Árboles de riesgo: rojo (#dc2626), puntos normales: amarillo (#eab308)
- Parser WKB/EWKB hex → GeoJSON integrado

### Formulario de inspección (formulario_inspeccion.html)
- Mapa interactivo con Leaflet
- Coordenadas UTM (zona 17S / EPSG:32717) calculadas automáticamente
- Detección de parroquia via RPC al hacer clic en el mapa
- Verificación de inspecciones previas en puntos_az (radio 10m)
- Formulario completo: parroquia, tipo, árbol de riesgo, comentario, técnico
- Guardado en `inspecciones_campo` con conversión automática a UTM
- Exportación a Excel via SheetJS (xlsx)
- Historial de inspecciones recientes del día

---

## Variables de entorno (Vercel)
```
SUPABASE_URL = https://lzhdjxhcxcaeibslwugt.supabase.co
SUPABASE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Cronología de cambios

1. Geoportal base con 6 capas desde Supabase
2. Sidebar lateral con checkboxes de capas (reemplazó menú flotante)
3. Credenciales movidas a variables de entorno de Vercel
4. Historial de git limpiado (repo nuevo con 1 commit)
5. Carpeta sql/ eliminada del repo

---

## Commits
```
a3527d0 Eliminar carpeta sql innecesaria
b616b36 Limpieza: credenciales en variables de entorno via Vercel
```
