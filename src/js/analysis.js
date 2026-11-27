/**
 * Modul analisis spasial menggunakan Turf.js (src/js/analysis.js)
 * Mencakup:
 * 1) Buffer interaktif (radius 500-2000 m) saat titik fasilitas diklik
 * 2) Spatial query daftar fasilitas pendidikan di dalam radius beserta jaraknya
 * 3) Ringkasan skor tiap zona & identifikasi zona prioritas (skor terendah)
 */
import * as turf from '@turf/turf';
import GeoJSON from 'ol/format/GeoJSON';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { toLonLat } from 'ol/proj';

const geoJsonFormat = new GeoJSON();

/**
 * Menjalankan analisis buffer Turf.js dan spatial query terhadap seluruh titik fasilitas.
 */
export function runBufferAndQuery(selectedFeature, allPointFeatures, radiusMeters, bufferSource) {
  const geom = selectedFeature.getGeometry();
  if (!geom || geom.getType() !== 'Point') return null;

  const coord3857 = geom.getCoordinates();
  const [lon, lat] = toLonLat(coord3857);

  // Buat titik pusat & poligon buffer dengan Turf.js (satuan kilometer)
  const centerPoint = turf.point([lon, lat]);
  const bufferPolygon = turf.buffer(centerPoint, radiusMeters / 1000, {
    units: 'kilometers',
  });

  // Konversi poligon buffer ke OpenLayers Feature (EPSG:3857)
  const olBufferFeature = geoJsonFormat.readFeature(bufferPolygon, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857',
  });
  olBufferFeature.set('_isInteractiveBuffer', true);

  // Fitur sorot pada titik pusat terpilih
  const highlightPoint = new Feature({
    geometry: new Point(coord3857),
  });
  highlightPoint.set('_isInteractiveBuffer', true);

  bufferSource.clear();
  bufferSource.addFeatures([olBufferFeature, highlightPoint]);

  // Spatial query: cari seluruh fasilitas di dalam poligon buffer beserta jaraknya
  const selectedKode = selectedFeature.get('Kode');
  const insideFacilities = [];

  allPointFeatures.forEach((f) => {
    const fGeom = f.getGeometry();
    if (!fGeom || fGeom.getType() !== 'Point') return;

    const [fLon, fLat] = toLonLat(fGeom.getCoordinates());
    const targetPt = turf.point([fLon, fLat]);

    const isInside = turf.booleanPointInPolygon(targetPt, bufferPolygon);
    const distMeters = turf.distance(centerPoint, targetPt, { units: 'meters' });

    if (isInside || distMeters <= radiusMeters) {
      insideFacilities.push({
        kode: f.get('Kode') || '-',
        nama: f.get('Nama') || '-',
        jenis: f.get('Jenis') || '-',
        kelas: f.get('Kelas_Akses') || '-',
        distanceMeters: Math.round(distMeters),
        isOrigin: f.get('Kode') === selectedKode,
        feature: f,
      });
    }
  });

  // Urutkan dari jarak terdekat ke terjauh
  insideFacilities.sort((a, b) => a.distanceMeters - b.distanceMeters);

  return {
    origin: {
      kode: selectedKode || '-',
      nama: selectedFeature.get('Nama') || '-',
      jenis: selectedFeature.get('Jenis') || '-',
    },
    radiusMeters,
    insideFacilities,
    bufferExtent: olBufferFeature.getGeometry().getExtent(),
  };
}

/**
 * Merender hasil spatial query ke panel analisis di sidebar.
 */
export function renderBufferQueryResult(result, onSelectFacility) {
  const container = document.getElementById('buffer-result');
  if (!result) {
    container.innerHTML =
      '<p class="empty-state">Belum ada sekolah yang dipilih. Aktifkan mode buffer lalu klik titik pada peta.</p>';
    return;
  }

  const otherCount = result.insideFacilities.filter((item) => !item.isOrigin).length;

  const wrapper = document.createElement('div');

  const summary = document.createElement('div');
  summary.className = 'query-summary';
  summary.innerHTML = `
    <strong>Pusat:</strong> ${escapeHtml(result.origin.nama)} (${escapeHtml(result.origin.kode)})<br/>
    <strong>Radius:</strong> ${result.radiusMeters} meter<br/>
    <strong>Ditemukan:</strong> ${result.insideFacilities.length} titik dalam radius
    (${otherCount} fasilitas lain selain titik pusat)
  `;
  wrapper.appendChild(summary);

  const list = document.createElement('ul');
  list.className = 'query-list';

  result.insideFacilities.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'query-item';
    li.style.cursor = 'pointer';
    li.title = 'Klik untuk memusatkan peta ke fasilitas ini';

    const left = document.createElement('div');
    left.innerHTML = `
      <div class="query-item-name">${escapeHtml(item.kode)} — ${escapeHtml(item.nama)}</div>
      <div class="query-item-sub">${escapeHtml(item.jenis)} · Akses ${escapeHtml(item.kelas)}</div>
    `;

    const pill = document.createElement('span');
    pill.className = 'distance-pill';
    pill.textContent = item.isOrigin ? 'Pusat (0 m)' : `${item.distanceMeters} m`;

    li.appendChild(left);
    li.appendChild(pill);
    li.addEventListener('click', () => {
      if (typeof onSelectFacility === 'function') {
        onSelectFacility(item.feature);
      }
    });

    list.appendChild(li);
  });

  wrapper.appendChild(list);
  container.innerHTML = '';
  container.appendChild(wrapper);
}

/**
 * Merender panel ringkasan skor tiap zona dan daftar zona prioritas (skor terendah)
 * dari data 04_data_hasil_analisis.json.
 */
export function renderZoneSummaryPanel(analysisFeatures, onZoomToZone) {
  const priorityContainer = document.getElementById('priority-zones-list');
  const allZonesContainer = document.getElementById('all-zones-list');

  if (!analysisFeatures || analysisFeatures.length === 0) {
    priorityContainer.innerHTML = '<p class="empty-state">Data analisis zona tidak tersedia.</p>';
    allZonesContainer.innerHTML = '<p class="empty-state">Data analisis zona tidak tersedia.</p>';
    return;
  }

  // Urutkan zona dari skor terendah ke tertinggi
  const sorted = [...analysisFeatures].sort((a, b) => {
    const sa = Number(a.get('Skor')) || 0;
    const sb = Number(b.get('Skor')) || 0;
    return sa - sb;
  });

  // Zona prioritas: zona dengan kelas selain Tinggi (atau minimal 2 zona dengan skor terendah)
  let priorityZones = sorted.filter((f) => f.get('Kelas') !== 'Tinggi');
  if (priorityZones.length === 0) {
    priorityZones = sorted.slice(0, 2);
  }

  const createZoneCard = (feature, isPriority) => {
    const kode = feature.get('Kode') || '-';
    const nama = feature.get('Nama') || '-';
    const jenisZona = feature.get('Jenis_Zona') || '-';
    const skor = feature.get('Skor') ?? '-';
    const kelas = feature.get('Kelas') || '-';
    const sJarak = feature.get('S_Jarak') ?? '-';
    const sJalan = feature.get('S_Jalan') ?? '-';
    const sPed = feature.get('S_Ped') ?? '-';
    const sTrans = feature.get('S_Trans') ?? '-';
    const kondJalan = feature.get('Kond_Jalan') || '-';
    const ped = feature.get('Pedestrian') || '-';
    const jmlTitik = feature.get('Jml_Titik') ?? '-';

    const badgeClass =
      kelas === 'Tinggi'
        ? 'badge-tinggi'
        : kelas === 'Sedang'
          ? 'badge-sedang'
          : 'badge-rendah';

    const barColor =
      kelas === 'Tinggi' ? '#16a34a' : kelas === 'Sedang' ? '#eab308' : '#dc2626';
    const pct = Math.max(8, Math.min(100, Math.round(((Number(skor) || 0) / 3) * 100)));

    const card = document.createElement('div');
    card.className = `zone-card${isPriority ? ' priority' : ''}`;
    card.title = 'Klik untuk zoom ke zona ini';
    card.innerHTML = `
      <div class="zone-card-top">
        <span class="zone-card-title">${escapeHtml(kode)} · Skor ${escapeHtml(String(skor))} / 3.0</span>
        <span class="badge ${badgeClass}">${escapeHtml(kelas)}</span>
      </div>
      <div class="score-bar-track">
        <div class="score-bar-fill" style="width:${pct}%; background:${barColor};"></div>
      </div>
      <div class="zone-card-meta">
        <strong>${escapeHtml(nama)}</strong> (${escapeHtml(jenisZona)})<br/>
        Sub-skor — Jarak: ${escapeHtml(String(sJarak))}, Jalan: ${escapeHtml(String(sJalan))},
        Pedestrian: ${escapeHtml(String(sPed))}, Trans: ${escapeHtml(String(sTrans))}<br/>
        Kondisi: ${escapeHtml(kondJalan)} · Pedestrian: ${escapeHtml(ped)} · ${escapeHtml(String(jmlTitik))} titik
      </div>
    `;

    card.addEventListener('click', () => {
      if (typeof onZoomToZone === 'function') {
        onZoomToZone(feature);
      }
    });

    return card;
  };

  priorityContainer.innerHTML = '';
  priorityZones.forEach((f) => priorityContainer.appendChild(createZoneCard(f, true)));

  allZonesContainer.innerHTML = '';
  sorted.forEach((f) => allZonesContainer.appendChild(createZoneCard(f, false)));
}

/**
 * Helper sanitasi HTML sederhana untuk mencegah injeksi teks atribut.
 */
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
