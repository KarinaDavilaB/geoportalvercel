-- ============================================================
-- VISTA GEOJSON: parroquias_dmq_geojson
-- Para que el geoportal pueda consultar las parroquias vía REST
-- ============================================================

CREATE OR REPLACE VIEW public.parroquias_dmq_geojson AS
SELECT
  gid,
  id,
  dpa_parroq,
  dpa_despar,
  ST_AsGeoJSON(geom)::JSON AS geom
FROM public.parroquias_dmq;

-- ============================================================
-- RLS: permitir lectura anónima
-- ============================================================

ALTER TABLE public.parroquias_dmq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parroquias_select_anon" ON public.parroquias_dmq;
CREATE POLICY "parroquias_select_anon"
  ON public.parroquias_dmq FOR SELECT USING (true);
