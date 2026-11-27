/**
 * Modul pemuatan data spasial (src/js/data.js)
 * Mendukung format EsriJSON dan GeoJSON standar (koordinat WGS84 / EPSG:4326)
 * lalu mentransformasikannya ke proyeksi tampilan peta EPSG:3857.
 */
import EsriJSON from 'ol/format/EsriJSON';
import GeoJSON from 'ol/format/GeoJSON';

// Daftar konfigurasi 5 layer utama sesuai struktur folder public/data/
export const LAYER_CONFIGS = [
  {
    key: 'points',
    name: 'Titik Fasilitas Pendidikan',
    description: '30 titik sekolah & halte (survei Avenza Maps)',
    url: './data/01_data_point.json',
    defaultVisible: true,
    zIndex: 50,
  },
  {
    key: 'routes',
    name: 'Rute Akses Estimasi',
    description: '5 rute penghubung dari titik survei',
    url: './data/02_data_polyline.json',
    defaultVisible: true,
    zIndex: 40,
  },
  {
    key: 'zones',
    name: 'Zona Sekolah & Permukiman',
    description: '5 poligon zona sekolah (A02, A05) & permukiman (A01, A03, A04)',
    url: './data/03_data_polygon.json',
    defaultVisible: false,
    zIndex: 20,
  },
  {
    key: 'analysis',
    name: 'Zona Hasil Analisis',
    description: '5 zona dengan skor & klasifikasi aksesibilitas',
    url: './data/04_data_hasil_analisis.json',
    defaultVisible: true,
    zIndex: 30,
  },
  {
    key: 'buffers',
    name: 'Buffer Sekolah',
    description: 'Poligon jangkauan layanan sekolah (500/1000/2000 m)',
    url: './data/05_buffer_sekolah.json',
    defaultVisible: false,
    zIndex: 10,
  },
];

const esriFormat = new EsriJSON();
const geoJsonFormat = new GeoJSON();

/**
 * Membaca objek JSON (GeoJSON atau EsriJSON) menjadi array OpenLayers Feature
 * dengan transformasi koordinat dari EPSG:4326 ke EPSG:3857.
 */
function parseSpatialFeatures(jsonData, layerKey) {
  const readOptions = {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  };

  let features = [];

  if (jsonData && (jsonData.type === 'FeatureCollection' || jsonData.type === 'Feature')) {
    // Format GeoJSON standar
    features = geoJsonFormat.readFeatures(jsonData, readOptions);
  } else if (jsonData && Array.isArray(jsonData.features)) {
    // Format EsriJSON (ArcGIS JSON)
    features = esriFormat.readFeatures(jsonData, readOptions);
  }

  // Tandai asal layer pada setiap fitur untuk kebutuhan popup
  features.forEach((feature) => {
    feature.set('_layerKey', layerKey);
  });

  return features;
}

/**
 * Memuat satu file data spasial secara aman.
 * Jika file tidak ditemukan atau bukan JSON valid, layer otomatis dilewati tanpa error.
 */
async function loadSingleLayer(config) {
  try {
    const response = await fetch(config.url, { cache: 'no-cache' });
    if (!response.ok) {
      return {
        config,
        available: false,
        features: [],
        reason: `File ${config.url.replace('./', 'public/')} tidak ditemukan (HTTP ${response.status}).`,
      };
    }

    const rawText = await response.text();
    let jsonData;
    try {
      jsonData = JSON.parse(rawText);
    } catch {
      // Menangani kasus dev server mengembalikan HTML fallback untuk file yang tidak ada
      return {
        config,
        available: false,
        features: [],
        reason: `File ${config.url.replace('./', 'public/')} tidak tersedia atau bukan JSON valid.`,
      };
    }

    const features = parseSpatialFeatures(jsonData, config.key);
    return {
      config,
      available: true,
      features,
      reason: null,
    };
  } catch (err) {
    return {
      config,
      available: false,
      features: [],
      reason: `Gagal memuat ${config.url}: ${err.message}`,
    };
  }
}

/**
 * Memuat seluruh 5 layer secara paralel.
 * Mengembalikan objek peta hasil per key layer dan daftar layer yang tidak tersedia.
 */
export async function loadAllLayers() {
  const results = await Promise.all(LAYER_CONFIGS.map(loadSingleLayer));
  const datasets = {};
  const missingLayers = [];

  results.forEach((item) => {
    datasets[item.config.key] = item;
    if (!item.available) {
      missingLayers.push(item);
    }
  });

  return { datasets, missingLayers };
}
