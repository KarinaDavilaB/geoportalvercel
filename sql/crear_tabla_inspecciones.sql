-- ============================================================
-- TABLA: inspecciones_campo
-- Almacena reportes diarios de inspección de los técnicos
-- con punto geométrico automático (PostGIS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inspecciones_campo (
  id            SERIAL PRIMARY KEY,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  hora          TIME NOT NULL DEFAULT CURRENT_TIME,
  parroquia     VARCHAR(100),
  coordenada_x  NUMERIC(10,7) NOT NULL,   -- Longitud (WGS84)
  coordenada_y  NUMERIC(10,7) NOT NULL,   -- Latitud (WGS84)
  utm_x         NUMERIC(12,2),            -- UTM Este
  utm_y         NUMERIC(12,2),            -- UTM Norte
  utm_zona      INTEGER,                  -- Zona UTM
  tipo_inspeccion VARCHAR(50) NOT NULL DEFAULT 'seguimiento',
  arbol_riesgo  BOOLEAN NOT NULL DEFAULT FALSE,
  comentario    TEXT,
  tecnico       VARCHAR(100),
  estado        VARCHAR(30) NOT NULL DEFAULT 'pendiente',
  geom          GEOMETRY(Point, 4326) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_inspecciones_geom ON public.inspecciones_campo USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_inspecciones_fecha ON public.inspecciones_campo (fecha);
CREATE INDEX IF NOT EXISTS idx_inspecciones_estado ON public.inspecciones_campo (estado);

-- ============================================================
-- TRIGGER: crea el geom automáticamente a partir de X, Y
-- y calcula UTM automáticamente
-- ============================================================

CREATE OR REPLACE FUNCTION public.inspecciones_campo_geom_trigger()
RETURNS TRIGGER AS $$
DECLARE
  zona INTEGER;
  utm_east NUMERIC;
  utm_north NUMERIC;
BEGIN
  -- Crear punto WGS84
  NEW.geom = ST_SetSRID(ST_MakePoint(NEW.coordenada_x, NEW.coordenada_y), 4326);

  -- Calcular zona UTM automáticamente según longitud
  zona := floor((NEW.coordenada_x + 180) / 6) + 1;

  -- Convertir a UTM (zona calculada, hemisferio sur)
  SELECT
    ST_X(utm),
    ST_Y(utm)
  INTO utm_east, utm_north
  FROM (
    SELECT ST_Transform(
      ST_SetSRID(ST_MakePoint(NEW.coordenada_x, NEW.coordenada_y), 4326),
      32600 + zona  -- EPSG para hemisferio norte; para sur usar 32700 + zona
    ) AS utm
  ) sub;

  -- Para Quito (lat negativa), usar hemisferio sur
  IF NEW.coordenada_y < 0 THEN
    SELECT
      ST_X(utm),
      ST_Y(utm)
    INTO utm_east, utm_north
    FROM (
      SELECT ST_Transform(
        ST_SetSRID(ST_MakePoint(NEW.coordenada_x, NEW.coordenada_y), 4326),
        32700 + zona
      ) AS utm
    ) sub;
  END IF;

  NEW.utm_x := utm_east;
  NEW.utm_y := utm_north;
  NEW.utm_zona := zona;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inspecciones_geom ON public.inspecciones_campo;
CREATE TRIGGER trg_inspecciones_geom
  BEFORE INSERT OR UPDATE OF coordenada_x, coordenada_y
  ON public.inspecciones_campo
  FOR EACH ROW
  EXECUTE FUNCTION public.inspecciones_campo_geom_trigger();

-- ============================================================
-- FUNCIÓN: obtener_parroquia_por_punto
-- Dadas coordenadas lat/lng, retorna la parroquia que contiene el punto
-- ============================================================

CREATE OR REPLACE FUNCTION public.obtener_parroquia_por_punto(lng NUMERIC, lat NUMERIC)
RETURNS TABLE(parroquia TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT p.dpa_despar::TEXT
  FROM public.parroquias_dmq p
  WHERE ST_Contains(
    p.geom,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCIÓN: inspecciones_cerca_del_punto
-- Dadas coordenadas lat/lng, retorna inspecciones dentro de radio_m metros
-- Usada por el formulario para verificar inspecciones previas
-- ============================================================

CREATE OR REPLACE FUNCTION public.inspecciones_cerca_del_punto(
  lng NUMERIC,
  lat NUMERIC,
  radio_m NUMERIC DEFAULT 50
)
RETURNS TABLE(
  id INTEGER,
  fecha DATE,
  hora TIME,
  parroquia VARCHAR,
  tipo_inspeccion VARCHAR,
  arbol_riesgo BOOLEAN,
  comentario TEXT,
  tecnico VARCHAR,
  estado VARCHAR,
  distancia_m NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.fecha,
    i.hora,
    i.parroquia,
    i.tipo_inspeccion,
    i.arbol_riesgo,
    i.comentario,
    i.tecnico,
    i.estado,
    ROUND(ST_Distance(
      i.geom::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    )::NUMERIC, 1) AS distancia_m
  FROM public.inspecciones_campo i
  WHERE ST_DWithin(
    i.geom::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radio_m
  )
  ORDER BY i.fecha DESC, i.hora DESC;
END;
$$ LANGUAGE plpgsql;

-- Permisos para la función de inspecciones cercanas
GRANT EXECUTE ON FUNCTION public.inspecciones_cerca_del_punto(NUMERIC, NUMERIC, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.inspecciones_cerca_del_punto(NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- ============================================================
-- FUNCIÓN: inspecciones_previas_az
-- Consulta la capa puntos_az para verificar inspecciones previas
-- dentro de un radio (default 10m). Retorna las fechas (mm-yy).
-- ============================================================

CREATE OR REPLACE FUNCTION public.inspecciones_previas_az(
  lng NUMERIC,
  lat NUMERIC,
  radio_m NUMERIC DEFAULT 10
)
RETURNS TABLE(
  insp_no DOUBLE PRECISION,
  fecha VARCHAR,
  x NUMERIC,
  y NUMERIC,
  distancia_m NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p."insp no",
    p."mm-yy",
    p.x,
    p.y,
    ROUND(ST_Distance(
      p.geom::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    )::NUMERIC, 1) AS distancia_m
  FROM public.puntos_az p
  WHERE ST_DWithin(
    p.geom::geography,
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
    radio_m
  )
  ORDER BY p."mm-yy" DESC;
END;
$$ LANGUAGE plpgsql;

-- Habilitar RLS en puntos_az si no está habilitado
ALTER TABLE public.puntos_az ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "puntos_az_select_anon" ON public.puntos_az;
CREATE POLICY "puntos_az_select_anon"
  ON public.puntos_az FOR SELECT USING (true);

-- Permisos para la función de inspecciones previas
GRANT EXECUTE ON FUNCTION public.inspecciones_previas_az(NUMERIC, NUMERIC, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.inspecciones_previas_az(NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- ============================================================
-- VISTA GEOJSON: inspecciones_campo_geojson
-- Para que el geoportal pueda consultarla vía REST
-- ============================================================

CREATE OR REPLACE VIEW public.inspecciones_campo_geojson AS
SELECT
  id,
  fecha::TEXT,
  hora::TEXT,
  parroquia,
  coordenada_x,
  coordenada_y,
  utm_x,
  utm_y,
  utm_zona,
  tipo_inspeccion,
  arbol_riesgo,
  comentario,
  tecnico,
  estado,
  created_at::TEXT,
  ST_AsGeoJSON(geom)::JSON AS geom
FROM public.inspecciones_campo;

-- ============================================================
-- RLS: permitir lectura anónima e inserción
-- ============================================================

ALTER TABLE public.inspecciones_campo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inspecciones_select_anon" ON public.inspecciones_campo;
CREATE POLICY "inspecciones_select_anon"
  ON public.inspecciones_campo FOR SELECT USING (true);

DROP POLICY IF EXISTS "inspecciones_insert_anon" ON public.inspecciones_campo;
CREATE POLICY "inspecciones_insert_anon"
  ON public.inspecciones_campo FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "inspecciones_update_anon" ON public.inspecciones_campo;
CREATE POLICY "inspecciones_update_anon"
  ON public.inspecciones_campo FOR UPDATE USING (true) WITH CHECK (true);

-- Permisos para la función de parroquia
GRANT EXECUTE ON FUNCTION public.obtener_parroquia_por_punto(NUMERIC, NUMERIC) TO anon;
GRANT EXECUTE ON FUNCTION public.obtener_parroquia_por_punto(NUMERIC, NUMERIC) TO authenticated;

-- ============================================================
-- DATOS DE EJEMPLO (opcional, para probar)
-- ============================================================

INSERT INTO public.inspecciones_campo (parroquia, coordenada_x, coordenada_y, tipo_inspeccion, arbol_riesgo, comentario, tecnico, estado)
VALUES
  ('Centro Histórico', -78.4821, -0.1807, 'riesgo', true, 'Árbol inclinado sobre vía principal, requiere poda urgente', 'Juan Pérez', 'pendiente'),
  ('La Mariscal', -78.4680, -0.1750, 'seguimiento', false, 'Árbol en buen estado, sin intervención necesaria', 'María González', 'completado'),
  ('El Condado', -78.4590, -0.1680, 'riesgo', true, 'Rama seca a punto de caer sobre acera', 'Carlos López', 'en_proceso')
ON CONFLICT DO NOTHING;
