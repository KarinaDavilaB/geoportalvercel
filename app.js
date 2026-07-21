const TABLAS_CONFIG = {
  parroquias_dmq: {
    label: 'Parroquias',
    tipo: 'poligono',
    color: '#555555',
    fillOpacity: 0,
    weight: 1.4,
    interactivo: false,
    titleField: 'dpa_despar',
    popupFields: [
      ['dpa_parroq', 'Código parroquia'],
      ['dpa_despar', 'Parroquia']
    ]
  },
  quebradas_dmq: {
    label: 'Quebradas',
    tipo: 'linea',
    color: '#00acc1',
    weight: 2.2,
    titleField: 'nam',
    popupFields: [
      ['nam', 'Nombre'],
      ['na2', 'Nombre secundario'],
      ['descripcio', 'Descripción'],
      ['fcode', 'Código'],
      ['shape_leng', 'Longitud (m)'],
      ['longitud_k', 'Longitud (km)'],
      ['acc_desc', 'Accesorio'],
      ['hyp_desc', 'Hipso']
    ]
  },
  rios_dmq: {
    label: 'Ríos',
    tipo: 'poligono',
    color: '#1565c0',
    fillColor: '#42a5f5',
    fillOpacity: 0.4,
    weight: 1,
    titleField: 'nam',
    popupFields: [
      ['nam', 'Nombre'],
      ['na2', 'Nombre secundario'],
      ['descripcio', 'Descripción'],
      ['fcode', 'Código'],
      ['shape_leng', 'Longitud (m)'],
      ['shape_area', 'Área (m²)'],
      ['acc_desc', 'Accesorio'],
      ['hyp_desc', 'Hipso']
    ]
  },
  reserva_biosfera_dmq: {
    label: 'Reserva de biosfera',
    tipo: 'poligono',
    color: '#2e7d32',
    fillColor: '#66bb6a',
    fillOpacity: 0.18,
    weight: 2,
    titleField: 'nombre',
    popupFields: [
      ['nombre', 'Nombre'],
      ['codigo_de_', 'Código'],
      ['fecha_de_d', 'Fecha declaratoria'],
      ['area_super', 'Área (m²)'],
      ['texto_asoc', 'Texto asociado']
    ]
  },
  puntos_az: {
    label: 'Puntos de inspección',
    tipo: 'punto',
    color: '#e65100',
    titleField: null,
    popupFields: [
      ['insp no', 'Insp No'],
      ['x', 'X'],
      ['y', 'Y'],
      ['mm-yy', 'Fecha']
    ]
  },
};

// ---------------------------------------------------------------
// Parser WKB/EWKB hex -> GeoJSON
// ---------------------------------------------------------------
function hexToBytes(hex){
  const bytes = new Uint8Array(hex.length/2);
  for(let i=0;i<bytes.length;i++) bytes[i] = parseInt(hex.substr(i*2,2),16);
  return bytes;
}

function parseWKB(bytes){
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function readByte(){ const v = bytes[offset]; offset += 1; return v; }
  function readUInt32(le){ const v = view.getUint32(offset, le); offset += 4; return v; }
  function readDouble(le){ const v = view.getFloat64(offset, le); offset += 8; return v; }

  function readPoint(dim, le){
    const c = [];
    for(let i=0;i<dim;i++) c.push(readDouble(le));
    return [c[0], c[1]];
  }

  function readGeometry(){
    const bo = readByte();
    const le = bo === 1;
    let typeCode = readUInt32(le);

    const hasZ = !!(typeCode & 0x80000000);
    const hasM = !!(typeCode & 0x40000000);
    const hasSRID = !!(typeCode & 0x20000000);
    let baseType = typeCode & 0xFF;
    if(baseType > 20) baseType = typeCode % 1000;
    if(hasSRID) offset += 4;
    const dim = 2 + (hasZ?1:0) + (hasM?1:0);

    switch(baseType){
      case 1:
        return { type:'Point', coordinates: readPoint(dim, le) };
      case 2: {
        const n = readUInt32(le);
        const coords = [];
        for(let i=0;i<n;i++) coords.push(readPoint(dim, le));
        return { type:'LineString', coordinates: coords };
      }
      case 3: {
        const numRings = readUInt32(le);
        const rings = [];
        for(let r=0;r<numRings;r++){
          const n = readUInt32(le);
          const ring = [];
          for(let i=0;i<n;i++) ring.push(readPoint(dim, le));
          rings.push(ring);
        }
        return { type:'Polygon', coordinates: rings };
      }
      case 4: {
        const n = readUInt32(le);
        const coords = [];
        for(let i=0;i<n;i++) coords.push(readGeometry().coordinates);
        return { type:'MultiPoint', coordinates: coords };
      }
      case 5: {
        const n = readUInt32(le);
        const lines = [];
        for(let i=0;i<n;i++) lines.push(readGeometry().coordinates);
        return { type:'MultiLineString', coordinates: lines };
      }
      case 6: {
        const n = readUInt32(le);
        const polys = [];
        for(let i=0;i<n;i++) polys.push(readGeometry().coordinates);
        return { type:'MultiPolygon', coordinates: polys };
      }
      case 7: {
        const n = readUInt32(le);
        const geoms = [];
        for(let i=0;i<n;i++) geoms.push(readGeometry());
        return { type:'GeometryCollection', geometries: geoms };
      }
      default:
        return null;
    }
  }

  return readGeometry();
}

function parseGeomValue(val){
  if(val == null) return null;
  if(typeof val === 'object' && val.type && (val.coordinates || val.geometries)) return val;
  if(typeof val === 'string'){
    const s = val.trim();
    if(s.startsWith('{')){
      try { return JSON.parse(s); } catch(e){ return null; }
    }
    if(/^[0-9A-Fa-f]+$/.test(s) && s.length % 2 === 0){
      try { return parseWKB(hexToBytes(s)); } catch(e){ return null; }
    }
  }
  return null;
}

// ---------------------------------------------------------------
// Mapa base
// ---------------------------------------------------------------
const map = L.map('map').setView([-0.18, -78.48], 12);

const baseOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19
}).addTo(map);

const baseSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri',
  maxZoom: 19
});

const controlCapas = L.control.layers(
  { 'Mapa claro': baseOSM, 'Satélite': baseSat },
  null,
  { position: 'topright', collapsed: true }
).addTo(map);

let capasCargadas = {};

const leyenda = L.control({ position: 'bottomright' });
leyenda.onAdd = function(){
  const div = L.DomUtil.create('div', 'leyenda');
  let html = '<b>Leyenda</b><br>';
  Object.entries(TABLAS_CONFIG).forEach(([tabla, cfg]) => {
    let simbolo = '';
    if(cfg.tipo === 'punto'){
      simbolo = `<span class="punto" style="background:${cfg.color}"></span>`;
    } else if(cfg.tipo === 'linea'){
      simbolo = `<span class="linea" style="background:${cfg.color}"></span>`;
    } else {
      simbolo = `<span class="barra" style="background:${cfg.fillColor || cfg.color}; border:1px solid ${cfg.color}"></span>`;
    }
    html += `<div class="item">${simbolo} ${cfg.label}</div>`;
  });
  div.innerHTML = html;
  return div;
};
leyenda.addTo(map);



// ---------------------------------------------------------------
// UI: checkboxes de capas
// ---------------------------------------------------------------
function pintarCheckboxesCapas(){
  const wrap = document.getElementById('capasToggle');
  wrap.innerHTML = Object.entries(TABLAS_CONFIG).map(([tabla, cfg]) => `
    <label>
      <input type="checkbox" value="${tabla}" checked>
      <span class="swatch" style="background:${cfg.fillColor || cfg.color}"></span>
      ${cfg.label}
    </label>
  `).join('');
}
pintarCheckboxesCapas();

window.addEventListener('DOMContentLoaded', () => {
  cargarGeoportal();
});

function estado(msg, color='#1f2937'){
  const el = document.getElementById('estado');
  el.style.color = color;
  el.innerHTML = msg;
}

function normalizarURL(url){
  url = url.trim().replace(/\/$/, '');
  if(url.endsWith('/rest/v1')) url = url.replace('/rest/v1', '');
  return url;
}

function centrarDMQ(){
  if(capasCargadas['parroquias_dmq']){
    const bounds = capasCargadas['parroquias_dmq'].getBounds();
    map.fitBounds(bounds);
    return;
  }
  map.setView([-0.18, -78.48], 12);
}

// ---------------------------------------------------------------
// Carga de capas
// ---------------------------------------------------------------
const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_KEY = window.SUPABASE_KEY || '';

async function cargarGeoportal(){
  const url = SUPABASE_URL;
  const key = SUPABASE_KEY;

  const tablasActivas = Array.from(
    document.querySelectorAll('#capasToggle input[type=checkbox]:checked')
  ).map(cb => cb.value);

  if(tablasActivas.length === 0){
    estado('Selecciona al menos una capa.', '#b45309');
    return;
  }

  Object.values(capasCargadas).forEach(c => map.removeLayer(c));
  Object.entries(capasCargadas).forEach(([tabla, capa]) => controlCapas.removeLayer(capa));
  capasCargadas = {};

  let cargadas = 0;
  let fallidas = [];

  for(let i = 0; i < tablasActivas.length; i++){
    const tabla = tablasActivas[i];
    estado(`Cargando "${TABLAS_CONFIG[tabla].label}" (${i+1}/${tablasActivas.length})...`);
    if(i > 0) await esperar(400);
    try{
      const capa = await consultarTabla(tabla, url, key);
      if(capa){
        capa.addTo(map);
        controlCapas.addOverlay(capa, TABLAS_CONFIG[tabla].label);
        capasCargadas[tabla] = capa;
        cargadas++;
      } else {
        fallidas.push(`${tabla} (sin datos/geometría)`);
      }
    } catch(err){
      const msgAmigable = err.message.includes('Failed to fetch') || err.name === 'TypeError'
        ? 'error de red/CSP — abre este archivo desde un servidor local (usa Live Server o similar)'
        : err.message;
      fallidas.push(`${tabla} (${msgAmigable})`);
    }
  }

  if(cargadas > 0) centrarDMQ();
  if(capasCargadas['puntos_az']) capasCargadas['puntos_az'].bringToFront();

  let msg = `${cargadas} capa(s) cargada(s) correctamente.`;
  if(fallidas.length > 0) msg += ` Con problemas: ${fallidas.join('; ')}.`;
  estado(msg, cargadas > 0 ? '#0f766e' : '#b45309');
}

function esperar(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function consultarTabla(tabla, supabaseUrl, apiKey, intento = 1){
  const vista = `${tabla}_geojson`;
  const res = await fetch(`${supabaseUrl}/rest/v1/${vista}?select=*&limit=5000`, {
    cache: 'no-store',
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` }
  });

  if(!res.ok){
    const body = await res.text();
    let detalle = body;
    try { detalle = JSON.parse(body).message || body; } catch(e) {}
    throw new Error(`HTTP ${res.status}: ${detalle.slice(0,150)}`);
  }

  const datos = await res.json();
  if(!Array.isArray(datos) || datos.length === 0) {
    if(intento < 3){
      await esperar(1200 * intento);
      return consultarTabla(tabla, supabaseUrl, apiKey, intento + 1);
    }
    throw new Error('la tabla respondió 0 filas tras 3 intentos');
  }

  const cfg = TABLAS_CONFIG[tabla];
  const features = [];

  datos.forEach(reg => {
    const rawGeom = reg.geom ?? reg.geometry ?? reg.geojson;
    const geom = parseGeomValue(rawGeom);
    if(geom) features.push({ type:'Feature', properties: reg, geometry: geom });
  });

  if(features.length === 0) {
    if(intento < 3){
      await esperar(1200 * intento);
      return consultarTabla(tabla, supabaseUrl, apiKey, intento + 1);
    }
    throw new Error(`${datos.length} fila(s) recibida(s) pero ninguna geometría se pudo interpretar tras 3 intentos`);
  }

  const capa = L.geoJSON(
    { type:'FeatureCollection', features },
    {
      interactive: cfg.interactivo !== false,
      style: () => ({
        color: cfg.color,
        weight: cfg.weight || 2,
        fillColor: cfg.fillColor || cfg.color,
        fillOpacity: cfg.fillOpacity ?? 0.3
      }),
      pointToLayer: (f, ll) => {
        const esRiesgo = f.properties && f.properties.arbol_riesgo === true;
        return L.circleMarker(ll, {
          radius: esRiesgo ? 9 : 6,
          fillColor: esRiesgo ? '#dc2626' : '#eab308',
          color: esRiesgo ? '#fca5a5' : '#854d0e',
          weight: esRiesgo ? 3 : 1.5,
          fillOpacity: 0.9
        });
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        let titulo = cfg.titleField && props[cfg.titleField] != null
          ? props[cfg.titleField]
          : cfg.label;
        let html = `<b>${titulo}</b><hr style="margin:4px 0">`;
        cfg.popupFields.forEach(([campo, etiqueta]) => {
          if(props[campo] !== undefined && props[campo] !== null && props[campo] !== '') {
            html += `<b>${etiqueta}:</b> ${props[campo]}<br>`;
          }
        });
        layer.bindPopup(html);
      }
    }
  );

  return capa;
}
