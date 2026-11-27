/**
 * Modul simbologi & gaya layer peta (src/js/style.js)
 * - Titik: warna menurut Kond_Jalan, bentuk menurut Jenis, ukuran menurut Skor_Akses
 * - Rute: ketebalan garis menurut Panjang_m
 * - Zona analisis: warna menurut Kelas (hijau/kuning/merah)
 * - Buffer sekolah: warna transparan berbeda per Jarak_buf (500/1000/2000)
 */
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';
import RegularShape from 'ol/style/RegularShape';
import Text from 'ol/style/Text';

// Palet warna kondisi jalan untuk titik fasilitas
export const ROAD_COLORS = {
  'Aspal Baik': '#16a34a',
  'Aspal Sedang': '#eab308',
  'Aspal Berlubang': '#dc2626',
};

// Palet warna kelas aksesibilitas zona
export const CLASS_COLORS = {
  Tinggi: { fill: 'rgba(22, 163, 74, 0.30)', stroke: '#15803d', hex: '#16a34a' },
  Sedang: { fill: 'rgba(234, 179, 8, 0.34)', stroke: '#a16207', hex: '#eab308' },
  Rendah: { fill: 'rgba(220, 38, 38, 0.32)', stroke: '#b91c1c', hex: '#dc2626' },
};

// Palet warna buffer sekolah berdasarkan Jarak_buf
export const BUFFER_COLORS = {
  500: { fill: 'rgba(16, 185, 129, 0.24)', stroke: '#059669', label: '500 m (Sangat Dekat)' },
  1000: { fill: 'rgba(59, 130, 246, 0.18)', stroke: '#2563eb', label: '1000 m (Dekat)' },
  2000: { fill: 'rgba(139, 92, 246, 0.14)', stroke: '#7c3aed', label: '2000 m (Jauh)' },
};

// Keterangan bentuk simbol per jenis fasilitas (karena public/icon/school.png tidak tersedia)
export const JENIS_SHAPES = {
  SD: 'Lingkaran',
  SMP: 'Persegi',
  SMA: 'Segitiga',
  SMK: 'Belah Ketupat',
  TK: 'Bintang',
  MI: 'Segilima',
  MA: 'Segienam',
  Halte: 'Tanda Plus',
};

/**
 * Menghitung ukuran simbol titik berdasarkan nilai Skor_Akses (rentang ~1.25 - 3.0).
 */
function getPointRadius(skor) {
  const num = Number(skor);
  if (Number.isNaN(num)) return 8;
  return Math.max(6, Math.min(13, 3.8 + num * 3));
}

/**
 * Membuat simbol OpenLayers berbeda untuk setiap nilai Jenis fasilitas.
 */
function createPointImage(jenis, fillColor, radius) {
  const fill = new Fill({ color: fillColor });
  const stroke = new Stroke({ color: '#ffffff', width: 2 });

  switch (jenis) {
    case 'SMP':
      return new RegularShape({
        fill,
        stroke,
        points: 4,
        radius: radius + 1,
        angle: Math.PI / 4,
      });
    case 'SMA':
      return new RegularShape({
        fill,
        stroke,
        points: 3,
        radius: radius + 2,
        angle: 0,
      });
    case 'SMK':
      return new RegularShape({
        fill,
        stroke,
        points: 4,
        radius: radius + 1.5,
        angle: 0,
      });
    case 'TK':
      return new RegularShape({
        fill,
        stroke,
        points: 5,
        radius: radius + 2,
        radius2: (radius + 2) * 0.48,
        angle: 0,
      });
    case 'MI':
      return new RegularShape({
        fill,
        stroke,
        points: 5,
        radius: radius + 1,
        angle: 0,
      });
    case 'MA':
      return new RegularShape({
        fill,
        stroke,
        points: 6,
        radius: radius + 1,
        angle: 0,
      });
    case 'Halte':
      return new RegularShape({
        fill,
        stroke,
        points: 4,
        radius: radius + 2,
        radius2: (radius + 2) * 0.35,
        angle: 0,
      });
    case 'SD':
    default:
      return new CircleStyle({
        fill,
        stroke,
        radius,
      });
  }
}

/**
 * Gaya dinamis untuk layer Titik Fasilitas Pendidikan.
 * Label kode titik hanya ditampilkan saat zoom cukup dekat (resolution < 5.5)
 * agar tidak bertumpuk di area padat seperti A02 dan A05.
 */
export function pointStyleFunction(feature, resolution) {
  const kondJalan = feature.get('Kond_Jalan');
  const jenis = feature.get('Jenis');
  const skor = feature.get('Skor_Akses');
  const kode = feature.get('Kode') || '';

  const color = ROAD_COLORS[kondJalan] || '#64748b';
  const radius = getPointRadius(skor);
  const showLabel = resolution !== undefined ? resolution < 5.5 : true;

  return new Style({
    image: createPointImage(jenis, color, radius),
    text: showLabel
      ? new Text({
          text: kode,
          offsetY: -(radius + 9),
          font: '600 10px "Plus Jakarta Sans", system-ui, sans-serif',
          fill: new Fill({ color: '#0f172a' }),
          stroke: new Stroke({ color: '#ffffff', width: 3 }),
        })
      : undefined,
  });
}

/**
 * Gaya dinamis untuk layer Rute Akses (ketebalan garis berdasarkan Panjang_m).
 */
export function routeStyleFunction(feature) {
  const panjang = Number(feature.get('Panjang_m')) || 1000;
  let width = 3;
  if (panjang >= 1250) {
    width = 6.5;
  } else if (panjang >= 1100) {
    width = 4.5;
  }

  return [
    // Garis luar putih agar kontras pada basemap satelit maupun OSM
    new Style({
      stroke: new Stroke({
        color: 'rgba(255, 255, 255, 0.85)',
        width: width + 2.5,
      }),
    }),
    new Style({
      stroke: new Stroke({
        color: '#2563eb',
        width,
      }),
    }),
  ];
}

/**
 * Gaya untuk layer Zona Pendidikan dasar (03_data_polygon.json)
 * Membedakan Zona Sekolah (indigo) dan Zona Permukiman (oranye).
 */
export function zoneStyleFunction(feature) {
  const kode = feature.get('Kode') || '';
  const jenisZona = feature.get('Jenis_Zona') || 'Zona Sekolah';
  const isPermukiman = jenisZona === 'Zona Permukiman';

  return new Style({
    fill: new Fill({
      color: isPermukiman ? 'rgba(217, 119, 6, 0.14)' : 'rgba(79, 70, 229, 0.14)',
    }),
    stroke: new Stroke({
      color: isPermukiman ? '#d97706' : '#4f46e5',
      width: 2.2,
      lineDash: isPermukiman ? [6, 4] : undefined,
    }),
    text: new Text({
      text: `${kode}\n${jenisZona}`,
      font: '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif',
      fill: new Fill({ color: isPermukiman ? '#92400e' : '#312e81' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
    }),
  });
}

/**
 * Gaya dinamis untuk layer Zona Hasil Analisis (04_data_hasil_analisis.json)
 * berdasarkan field Kelas (Tinggi=hijau, Sedang=kuning, Rendah=merah)
 * dengan garis batas solid untuk Zona Sekolah dan putus-putus untuk Zona Permukiman.
 */
export function analysisStyleFunction(feature) {
  const kelas = feature.get('Kelas');
  const kode = feature.get('Kode') || '';
  const skor = feature.get('Skor');
  const jenisZona = feature.get('Jenis_Zona') || '';
  const isPermukiman = jenisZona === 'Zona Permukiman';
  const palette = CLASS_COLORS[kelas] || {
    fill: 'rgba(100, 116, 139, 0.28)',
    stroke: '#475569',
  };

  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 2.2,
      lineDash: isPermukiman ? [6, 4] : undefined,
    }),
    text: new Text({
      text: skor !== undefined ? `${kode} (${jenisZona === 'Zona Permukiman' ? 'Permukiman' : 'Sekolah'})\nSkor ${skor}` : kode,
      font: '700 10.5px "Plus Jakarta Sans", system-ui, sans-serif',
      fill: new Fill({ color: '#0f172a' }),
      stroke: new Stroke({ color: '#ffffff', width: 3 }),
    }),
  });
}

/**
 * Gaya dinamis untuk layer Buffer Sekolah (05_buffer_sekolah.json)
 * berdasarkan field Jarak_buf (500 / 1000 / 2000).
 */
export function bufferLayerStyleFunction(feature) {
  const jarak = Number(feature.get('Jarak_buf'));
  const palette = BUFFER_COLORS[jarak] || {
    fill: 'rgba(14, 165, 233, 0.16)',
    stroke: '#0284c7',
  };

  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 1.5,
    }),
  });
}

/**
 * Gaya untuk poligon buffer interaktif hasil analisis Turf.js.
 */
export function interactiveBufferStyleFunction(feature) {
  const geomType = feature.getGeometry()?.getType();
  if (geomType === 'Point') {
    // Penanda lingkaran sorot pada sekolah yang dipilih
    return new Style({
      image: new CircleStyle({
        radius: 15,
        fill: new Fill({ color: 'rgba(2, 132, 199, 0.22)' }),
        stroke: new Stroke({ color: '#0284c7', width: 3 }),
      }),
    });
  }

  return new Style({
    fill: new Fill({ color: 'rgba(14, 165, 233, 0.16)' }),
    stroke: new Stroke({
      color: '#0284c7',
      width: 2.5,
      lineDash: [8, 5],
    }),
  });
}
