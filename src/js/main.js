/**
 * Entry point halaman peta interaktif (src/js/main.js)
 * Mengintegrasikan OpenLayers, kontrol 5 layer, filter chip, pencarian sekolah,
 * hover tooltip, popup beranimasi, legenda dinamis, basemap OSM/Satelit, dan Turf.js.
 * Catatan: Tidak menggunakan localStorage maupun sessionStorage.
 */
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import Overlay from 'ol/Overlay';
import { fromLonLat } from 'ol/proj';
import { extend as extendExtent, createEmpty as createEmptyExtent, isEmpty as isEmptyExtent } from 'ol/extent';

import { LAYER_CONFIGS, loadAllLayers } from './data.js';
import {
  ROAD_COLORS,
  CLASS_COLORS,
  BUFFER_COLORS,
  JENIS_SHAPES,
  pointStyleFunction,
  routeStyleFunction,
  zoneStyleFunction,
  analysisStyleFunction,
  bufferLayerStyleFunction,
  interactiveBufferStyleFunction,
  highlightStyleFunction,
} from './style.js';
import { initPointFilters } from './filter.js';
import {
  runBufferAndQuery,
  renderBufferQueryResult,
  renderZoneSummaryPanel,
} from './analysis.js';

// Koordinat awal Kota Pekanbaru (EPSG:4326 -> EPSG:3857)
const PEKANBARU_CENTER = fromLonLat([101.454, 0.520]);

// Warna penanda pada daftar layer sidebar
const LAYER_DOT_COLORS = {
  points: '#16a34a',
  routes: '#2563eb',
  zones: '#4f46e5',
  analysis: '#eab308',
  buffers: '#7c3aed',
};

// Pemetaan fungsi gaya untuk masing-masing layer
const STYLE_MAP = {
  points: pointStyleFunction,
  routes: routeStyleFunction,
  zones: zoneStyleFunction,
  analysis: analysisStyleFunction,
  buffers: bufferLayerStyleFunction,
};

// State aplikasi di memori (tanpa localStorage/sessionStorage)
const appState = {
  layers: {},
  sources: {},
  allPointFeatures: [],
  bufferMode: false,
  selectedBufferFeature: null,
  bufferRadius: 1000,
  toastTimer: null,
};

/**
 * Menampilkan notifikasi toast singkat di bagian bawah peta.
 */
function showToast(message) {
  const toastEl = document.getElementById('map-toast');
  if (!toastEl) return;

  toastEl.textContent = message;
  toastEl.classList.remove('hidden');

  if (appState.toastTimer) {
    clearTimeout(appState.toastTimer);
  }
  appState.toastTimer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 2400);
}

/**
 * Inisialisasi seluruh komponen peta setelah DOM siap.
 */
async function initApp() {
  // 1. Basemap OSM dan Satelit (Esri World Imagery)
  const osmLayer = new TileLayer({
    source: new OSM(),
    visible: true,
    zIndex: 0,
  });

  const satelliteLayer = new TileLayer({
    source: new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
      maxZoom: 19,
    }),
    visible: false,
    zIndex: 0,
  });

  // 2. Layer khusus untuk poligon buffer interaktif Turf.js
  const interactiveBufferSource = new VectorSource();
  const interactiveBufferLayer = new VectorLayer({
    source: interactiveBufferSource,
    style: interactiveBufferStyleFunction,
    zIndex: 45,
  });

  // 3. Overlay popup untuk menampilkan atribut objek saat diklik
  const popupEl = document.getElementById('popup');
  const popupContentEl = document.getElementById('popup-content');
  const popupCloserEl = document.getElementById('popup-closer');
  const tooltipEl = document.getElementById('map-tooltip');

  const popupOverlay = new Overlay({
    element: popupEl,
    autoPan: {
      animation: { duration: 280 },
    },
  });

  const closePopup = () => {
    popupOverlay.setPosition(undefined);
    popupEl.classList.add('hidden');
  };

  popupCloserEl.addEventListener('click', closePopup);

  // 4. Inisialisasi peta OpenLayers
  const map = new Map({
    target: 'map',
    layers: [osmLayer, satelliteLayer, interactiveBufferLayer],
    overlays: [popupOverlay],
    view: new View({
      center: PEKANBARU_CENTER,
      zoom: 14,
      minZoom: 10,
      maxZoom: 19,
    }),
  });

  // 5. Muat 5 layer data spasial (otomatis melewati file yang tidak ada tanpa error)
  const { datasets, missingLayers } = await loadAllLayers();

  LAYER_CONFIGS.forEach((cfg) => {
    const result = datasets[cfg.key];
    const source = new VectorSource({
      features: result.available ? result.features : [],
    });

    const layer = new VectorLayer({
      source,
      style: STYLE_MAP[cfg.key],
      visible: result.available && cfg.defaultVisible,
      zIndex: cfg.zIndex,
    });
    layer.set('key', cfg.key);
    layer.set('available', result.available);

    appState.sources[cfg.key] = source;
    appState.layers[cfg.key] = layer;
    map.addLayer(layer);
  });

  appState.allPointFeatures = datasets.points?.features || [];

  // 6. Render kontrol layer (toggle switch), filter chip, pencarian, ringkasan zona, dan legenda
  renderLayerControls(datasets, missingLayers, () => {
    updateLegend(interactiveBufferSource);
  });

  initPointFilters(appState.allPointFeatures, appState.sources.points, (filtered, isReset) => {
    if (isReset) {
      showToast(`Filter direset — menampilkan ${filtered.length} titik`);
    }
  });

  initFacilitySearch(appState.allPointFeatures, (feature) => {
    const coords = feature.getGeometry()?.getCoordinates();
    if (!coords) return;

    // Pastikan layer titik aktif agar objek yang dicari terlihat
    if (appState.layers.points && !appState.layers.points.getVisible()) {
      appState.layers.points.setVisible(true);
      const cb = document.querySelector('input[data-layer-key="points"]');
      if (cb) cb.checked = true;
      updateLegend(interactiveBufferSource);
    }

    // Animasi terbang halus menuju sekolah
    map.getView().animate({
      center: coords,
      zoom: 17,
      duration: 600,
    });
    showFeaturePopup(feature, coords, popupContentEl, popupOverlay, popupEl);
    showToast(`Menuju ${feature.get('Nama') || feature.get('Kode')}`);
  });

  renderZoneSummaryPanel(datasets.analysis?.features || [], (zoneFeature) => {
    const geom = zoneFeature.getGeometry();
    if (!geom) return;
    if (appState.layers.analysis && !appState.layers.analysis.getVisible()) {
      appState.layers.analysis.setVisible(true);
      const cb = document.querySelector('input[data-layer-key="analysis"]');
      if (cb) cb.checked = true;
      updateLegend(interactiveBufferSource);
    }
    map.getView().fit(geom.getExtent(), {
      padding: [65, 65, 65, 65],
      duration: 550,
      maxZoom: 16,
    });
    showToast(`Memfokuskan ${zoneFeature.get('Kode')} (${zoneFeature.get('Jenis_Zona')})`);
  });

  updateLegend(interactiveBufferSource);

  // 7. Fungsi "Zoom ke Semua Data"
  const zoomToAllData = (announce = false) => {
    const combinedExtent = createEmptyExtent();
    Object.values(appState.sources).forEach((source) => {
      if (source.getFeatures().length > 0) {
        extendExtent(combinedExtent, source.getExtent());
      }
    });
    if (!isEmptyExtent(combinedExtent)) {
      map.getView().fit(combinedExtent, {
        padding: [55, 55, 55, 55],
        duration: 550,
        maxZoom: 16,
      });
      if (announce) showToast('Menampilkan seluruh area data Pekanbaru');
    }
  };

  document.getElementById('btn-zoom-all').addEventListener('click', () => zoomToAllData(true));
  zoomToAllData(false);

  // 8. Switcher Basemap (OSM / Satelit)
  document.querySelectorAll('.basemap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.basemap;
      osmLayer.setVisible(mode === 'osm');
      satelliteLayer.setVisible(mode === 'satelit');
      document.querySelectorAll('.basemap-btn').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      showToast(mode === 'osm' ? 'Peta dasar: OpenStreetMap' : 'Peta dasar: Citra Satelit');
    });
  });

  // 9. Kontrol Analisis Buffer Interaktif (Turf.js)
  const bufferModeToggle = document.getElementById('toggle-buffer-mode');
  const bufferBanner = document.getElementById('buffer-mode-banner');
  const bufferBannerText = document.getElementById('buffer-banner-text');
  const exitBufferModeBtn = document.getElementById('btn-exit-buffer-mode');
  const radiusSlider = document.getElementById('buffer-radius');
  const radiusLabel = document.getElementById('buffer-radius-label');
  const clearBufferBtn = document.getElementById('btn-clear-buffer');

  const syncBufferModeUi = (active) => {
    appState.bufferMode = active;
    bufferModeToggle.checked = active;
    bufferBanner.classList.toggle('hidden', !active);
    bufferBannerText.textContent = `Mode Buffer Aktif (${appState.bufferRadius} m) — Klik titik sekolah di peta!`;
    map.getTargetElement().style.cursor = active ? 'crosshair' : '';
  };

  const executeInteractiveBuffer = (feature, shouldFit = true) => {
    appState.selectedBufferFeature = feature;
    const result = runBufferAndQuery(
      feature,
      appState.allPointFeatures,
      appState.bufferRadius,
      interactiveBufferSource
    );

    renderBufferQueryResult(result, (targetFeature) => {
      const coords = targetFeature.getGeometry()?.getCoordinates();
      if (coords) {
        map.getView().animate({ center: coords, zoom: 17, duration: 480 });
        showFeaturePopup(targetFeature, coords, popupContentEl, popupOverlay, popupEl);
      }
    });

    updateLegend(interactiveBufferSource);

    if (shouldFit && result?.bufferExtent) {
      map.getView().fit(result.bufferExtent, {
        padding: [65, 65, 65, 65],
        duration: 500,
        maxZoom: 16,
      });
      showToast(`Buffer ${appState.bufferRadius} m: ${result.insideFacilities.length} titik dalam radius`);
    }
  };

  bufferModeToggle.addEventListener('change', (e) => {
    syncBufferModeUi(e.target.checked);
    if (e.target.checked) {
      showToast('Mode Buffer aktif — klik sebuah titik sekolah di peta');
    }
  });

  exitBufferModeBtn.addEventListener('click', () => {
    syncBufferModeUi(false);
    showToast('Mode Buffer dinonaktifkan');
  });

  radiusSlider.addEventListener('input', (e) => {
    appState.bufferRadius = Number(e.target.value);
    radiusLabel.textContent = `${appState.bufferRadius} m`;
    if (appState.bufferMode) {
      bufferBannerText.textContent = `Mode Buffer Aktif (${appState.bufferRadius} m) — Klik titik sekolah di peta!`;
    }
    if (appState.selectedBufferFeature) {
      executeInteractiveBuffer(appState.selectedBufferFeature, false);
    }
  });

  clearBufferBtn.addEventListener('click', () => {
    appState.selectedBufferFeature = null;
    interactiveBufferSource.clear();
    renderBufferQueryResult(null);
    updateLegend(interactiveBufferSource);
    showToast('Buffer interaktif dihapus');
  });

  // 10. Feature Overlay untuk Highlight saat Hover (sesuai Modul 8 OpenLayers)
  const featureOverlay = new VectorLayer({
    source: new VectorSource(),
    map,
    style: highlightStyleFunction,
    zIndex: 60,
  });

  let highlightedFeature = null;
  const highlightFeature = (feature) => {
    if (feature !== highlightedFeature) {
      if (highlightedFeature) {
        featureOverlay.getSource().removeFeature(highlightedFeature);
      }
      if (feature) {
        featureOverlay.getSource().addFeature(feature);
      }
      highlightedFeature = feature;
    }
  };

  // Interaksi Klik & Hover Tooltip pada Peta
  const priorityOrder = ['points', 'routes', 'analysis', 'zones', 'buffers'];

  const getTopFeatureAtPixel = (pixel) => {
    const hits = [];
    map.forEachFeatureAtPixel(
      pixel,
      (feature, layer) => {
        if (!layer || !layer.get('key') || feature.get('_isInteractiveBuffer')) return;
        hits.push({ feature, layerKey: layer.get('key') });
      },
      { hitTolerance: 6 }
    );
    if (hits.length === 0) return null;
    hits.sort((a, b) => priorityOrder.indexOf(a.layerKey) - priorityOrder.indexOf(b.layerKey));
    return hits[0];
  };

  map.on('singleclick', (evt) => {
    const topHit = getTopFeatureAtPixel(evt.pixel);
    if (!topHit) {
      closePopup();
      return;
    }

    if (appState.bufferMode && topHit.layerKey === 'points') {
      closePopup();
      executeInteractiveBuffer(topHit.feature, true);
      return;
    }

    showFeaturePopup(topHit.feature, evt.coordinate, popupContentEl, popupOverlay, popupEl);
  });

  // Hover tooltip mengambang + highlight featureOverlay saat pointermove
  map.on('pointermove', (evt) => {
    if (evt.dragging) {
      tooltipEl.classList.add('hidden');
      highlightFeature(null);
      return;
    }

    const topHit = getTopFeatureAtPixel(evt.pixel);
    highlightFeature(topHit ? topHit.feature : null);

    if (appState.bufferMode) {
      map.getTargetElement().style.cursor = 'crosshair';
    } else {
      map.getTargetElement().style.cursor = topHit ? 'pointer' : '';
    }

    if (!topHit) {
      tooltipEl.classList.add('hidden');
      return;
    }

    const f = topHit.feature;
    let label = '';
    if (topHit.layerKey === 'points') {
      label = `${f.get('Nama') || f.get('Kode')} · ${f.get('Jenis') || ''} · Skor ${f.get('Skor_Akses') ?? '-'}`;
    } else if (topHit.layerKey === 'routes') {
      label = `Rute ${f.get('Kode')}: ${f.get('Dari')} → ${f.get('Tujuan')} (${f.get('Panjang_m')} m)`;
    } else if (topHit.layerKey === 'analysis') {
      label = `${f.get('Kode')} (${f.get('Jenis_Zona')}) · Skor ${f.get('Skor')} · ${f.get('Kelas')}`;
    } else if (topHit.layerKey === 'zones') {
      label = `${f.get('Kode')} · ${f.get('Jenis_Zona')} (${f.get('Jml_Titik')} titik)`;
    } else {
      label = `${f.get('Nama') || f.get('Kode') || 'Buffer'} (${f.get('Jarak_buf') || ''} m)`;
    }

    tooltipEl.textContent = label;
    tooltipEl.style.left = `${evt.pixel[0]}px`;
    tooltipEl.style.top = `${evt.pixel[1]}px`;
    tooltipEl.classList.remove('hidden');
  });

  map.getViewport().addEventListener('mouseleave', () => {
    tooltipEl.classList.add('hidden');
    highlightFeature(null);
  });

  // 11. Interaksi UI: Tab Sidebar, Toggle Sidebar (Responsif HP), dan Toggle Legenda
  initUiControls(map);
}

/**
 * Menginisialisasi kotak pencarian sekolah cepat dengan saran otomatis.
 */
function initFacilitySearch(allPointFeatures, onSelectFeature) {
  const input = document.getElementById('facility-search');
  const clearBtn = document.getElementById('btn-clear-search');
  const resultsBox = document.getElementById('search-results');

  const closeResults = () => resultsBox.classList.add('hidden');

  const renderMatches = (query) => {
    const q = query.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', q.length === 0);

    if (q.length === 0) {
      closeResults();
      return;
    }

    const matches = allPointFeatures
      .filter((f) => {
        const nama = String(f.get('Nama') || '').toLowerCase();
        const kode = String(f.get('Kode') || '').toLowerCase();
        const jenis = String(f.get('Jenis') || '').toLowerCase();
        return nama.includes(q) || kode.includes(q) || jenis.includes(q);
      })
      .slice(0, 8);

    resultsBox.innerHTML = '';
    if (matches.length === 0) {
      resultsBox.innerHTML =
        '<div class="search-result-item"><div class="search-result-sub">Fasilitas tidak ditemukan.</div></div>';
      resultsBox.classList.remove('hidden');
      return;
    }

    matches.forEach((f) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div class="search-result-title">${escapeHtml(f.get('Kode') || '')} — ${escapeHtml(f.get('Nama') || '')}</div>
        <div class="search-result-sub">${escapeHtml(f.get('Jenis') || '')} · ${escapeHtml(f.get('Kond_Jalan') || '')} · Skor ${escapeHtml(String(f.get('Skor_Akses') ?? '-'))}</div>
      `;
      item.addEventListener('click', () => {
        input.value = f.get('Nama') || f.get('Kode') || '';
        closeResults();
        onSelectFeature(f);
      });
      resultsBox.appendChild(item);
    });

    resultsBox.classList.remove('hidden');
  };

  input.addEventListener('input', (e) => renderMatches(e.target.value));
  input.addEventListener('focus', () => {
    if (input.value.trim()) renderMatches(input.value);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    closeResults();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.map-search-box')) {
      closeResults();
    }
  });
}

/**
 * Merender daftar 5 layer dengan toggle switch modern pada panel samping.
 */
function renderLayerControls(datasets, missingLayers, onToggle) {
  const container = document.getElementById('layer-controls');
  const missingBanner = document.getElementById('missing-layer-info');
  container.innerHTML = '';

  LAYER_CONFIGS.forEach((cfg) => {
    const dataInfo = datasets[cfg.key];
    const layer = appState.layers[cfg.key];
    const isAvailable = dataInfo?.available;

    const label = document.createElement('label');
    label.className = `layer-item${isAvailable ? '' : ' disabled'}`;

    const left = document.createElement('div');
    left.className = 'layer-left';

    const dot = document.createElement('span');
    dot.className = 'layer-dot';
    dot.style.backgroundColor = LAYER_DOT_COLORS[cfg.key] || '#64748b';

    const meta = document.createElement('div');
    meta.className = 'layer-meta';

    const title = document.createElement('span');
    title.className = 'layer-name';
    title.textContent = isAvailable
      ? `${cfg.name} (${dataInfo.features.length})`
      : `${cfg.name} (Tidak tersedia)`;

    const desc = document.createElement('span');
    desc.className = 'layer-desc';
    desc.textContent = isAvailable
      ? cfg.description
      : 'File belum ada di public/data/ — dilewati otomatis.';

    meta.appendChild(title);
    meta.appendChild(desc);
    left.appendChild(dot);
    left.appendChild(meta);

    // Sakelar toggle switch (tetap menggunakan input checkbox semantik)
    const switchWrap = document.createElement('span');
    switchWrap.className = 'switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.layerKey = cfg.key;
    checkbox.checked = isAvailable && layer.getVisible();
    checkbox.disabled = !isAvailable;

    checkbox.addEventListener('change', () => {
      layer.setVisible(checkbox.checked);
      if (typeof onToggle === 'function') onToggle();
    });

    const slider = document.createElement('span');
    slider.className = 'switch-slider';

    switchWrap.appendChild(checkbox);
    switchWrap.appendChild(slider);

    label.appendChild(left);
    label.appendChild(switchWrap);
    container.appendChild(label);
  });

  if (missingLayers.length > 0) {
    const names = missingLayers.map((m) => m.config.url.replace('./', 'public/')).join(', ');
    missingBanner.textContent = `Info: ${names} belum tersedia. Layer terkait dilewati otomatis tanpa error.`;
    missingBanner.classList.remove('hidden');
  } else {
    missingBanner.classList.add('hidden');
  }
}

/**
 * Memperbarui isi legenda secara dinamis mengikuti layer yang sedang aktif.
 */
function updateLegend(interactiveBufferSource) {
  const legendContent = document.getElementById('legend-content');
  const sections = [];

  if (appState.layers.points?.getVisible()) {
    const roadRows = Object.entries(ROAD_COLORS)
      .map(
        ([label, color]) => `
        <div class="legend-row">
          <span class="color-dot" style="background:${color}; width:11px; height:11px;"></span>
          <span>${label}</span>
        </div>`
      )
      .join('');

    const shapeItems = Object.entries(JENIS_SHAPES)
      .map(([jenis, bentuk]) => `<div><strong>${jenis}</strong>: ${bentuk}</div>`)
      .join('');

    sections.push(`
      <div>
        <div class="legend-group-title">Titik Fasilitas (Kondisi Jalan)</div>
        ${roadRows}
        <div class="legend-shapes-grid">${shapeItems}</div>
        <div style="margin-top:4px; font-size:0.69rem; color:#64748b;">
          Ukuran titik mengikuti <strong>Skor_Akses</strong>.
        </div>
      </div>
    `);
  }

  if (appState.layers.routes?.getVisible()) {
    sections.push(`
      <div>
        <div class="legend-group-title">Rute Akses (Panjang_m)</div>
        <div class="legend-row"><span class="legend-line" style="height:3px;"></span><span>&lt; 1.100 m</span></div>
        <div class="legend-row"><span class="legend-line" style="height:5px;"></span><span>1.100 – 1.250 m</span></div>
        <div class="legend-row"><span class="legend-line" style="height:7px;"></span><span>&gt; 1.250 m</span></div>
      </div>
    `);
  }

  if (appState.layers.analysis?.getVisible()) {
    const classRows = Object.entries(CLASS_COLORS)
      .map(
        ([kelas, pal]) => `
        <div class="legend-row">
          <span class="legend-swatch" style="background:${pal.fill}; border-color:${pal.stroke};"></span>
          <span>Kelas ${kelas}</span>
        </div>`
      )
      .join('');

    sections.push(`
      <div>
        <div class="legend-group-title">Zona Hasil Analisis</div>
        ${classRows}
        <div style="margin-top:4px; font-size:0.69rem; color:#64748b;">
          Garis solid: Zona Sekolah · Putus-putus: Zona Permukiman.
        </div>
      </div>
    `);
  }

  if (appState.layers.zones?.getVisible()) {
    sections.push(`
      <div>
        <div class="legend-group-title">Zona Sekolah &amp; Permukiman</div>
        <div class="legend-row">
          <span class="legend-swatch" style="background:rgba(79,70,229,0.16); border:2px solid #4f46e5;"></span>
          <span>Zona Sekolah (A02, A05)</span>
        </div>
        <div class="legend-row">
          <span class="legend-swatch" style="background:rgba(217,119,6,0.16); border:2px dashed #d97706;"></span>
          <span>Zona Permukiman (A01, A03, A04)</span>
        </div>
      </div>
    `);
  }

  if (appState.layers.buffers?.getVisible()) {
    const bufRows = Object.values(BUFFER_COLORS)
      .map(
        (pal) => `
        <div class="legend-row">
          <span class="legend-swatch" style="background:${pal.fill}; border-color:${pal.stroke};"></span>
          <span>${pal.label}</span>
        </div>`
      )
      .join('');

    sections.push(`
      <div>
        <div class="legend-group-title">Buffer Sekolah</div>
        ${bufRows}
      </div>
    `);
  }

  if (interactiveBufferSource.getFeatures().length > 0) {
    sections.push(`
      <div>
        <div class="legend-group-title">Buffer Interaktif (Turf.js)</div>
        <div class="legend-row">
          <span class="legend-swatch" style="background:rgba(14,165,233,0.2); border:2px dashed #0284c7;"></span>
          <span>Radius ${appState.bufferRadius} m</span>
        </div>
      </div>
    `);
  }

  legendContent.innerHTML =
    sections.length > 0
      ? sections.join('')
      : '<span style="color:#64748b;">Tidak ada layer aktif.</span>';
}

/**
 * Menampilkan popup atribut fitur dengan animasi pop-in saat objek diklik.
 */
function showFeaturePopup(feature, coordinate, contentEl, overlay, popupEl) {
  const layerKey = feature.get('_layerKey');
  const props = feature.getProperties();

  const title = props.Nama || props.Title || props.Kode || 'Detail Objek';
  const subtitle = props.Title && props.Title !== title ? props.Title : `Layer: ${layerKey}`;

  const fieldOrderByLayer = {
    points: [
      ['Kode', 'Kode'],
      ['Jenis', 'Jenis'],
      ['Kond_Jalan', 'Kondisi Jalan'],
      ['Pedestrian', 'Pedestrian'],
      ['Trans_Utama', 'Transportasi Utama'],
      ['Transport', 'Moda Tersedia'],
      ['Skor_Akses', 'Skor Akses'],
      ['Kelas_Akses', 'Kelas Akses'],
      ['Elevasi', 'Elevasi (m)'],
      ['Latitude', 'Latitude'],
      ['Longitude', 'Longitude'],
      ['Tanggal', 'Tanggal Survei'],
      ['Sumber', 'Sumber'],
    ],
    routes: [
      ['Kode', 'Kode Rute'],
      ['Dari', 'Dari'],
      ['Tujuan', 'Tujuan'],
      ['Kode_Tujuan', 'Kode Tujuan'],
      ['Via', 'Via'],
      ['Panjang_m', 'Panjang (m)'],
      ['Waktu_mnt', 'Estimasi Waktu (mnt)'],
      ['Kond_Jalan', 'Kondisi Jalan'],
      ['Pedestrian', 'Pedestrian'],
      ['Transport', 'Transportasi'],
      ['Sumber', 'Sumber'],
    ],
    zones: [
      ['Kode', 'Kode Zona'],
      ['Jenis_Zona', 'Jenis Zona'],
      ['Jml_Titik', 'Jumlah Titik'],
      ['Jarak_m', 'Jarak Rata-rata (m)'],
      ['Waktu_mnt', 'Waktu (mnt)'],
      ['Kond_Jalan', 'Kondisi Jalan'],
      ['Pedestrian', 'Pedestrian'],
      ['Transport', 'Transportasi'],
      ['Luas_ha', 'Luas (ha)'],
      ['Sumber', 'Sumber'],
    ],
    analysis: [
      ['Kode', 'Kode Zona'],
      ['Jenis_Zona', 'Jenis Zona'],
      ['Skor', 'Skor Akhir'],
      ['Kelas', 'Kelas Akses'],
      ['S_Jarak', 'Skor Jarak (40%)'],
      ['S_Jalan', 'Skor Jalan (25%)'],
      ['S_Ped', 'Skor Pedestrian (20%)'],
      ['S_Trans', 'Skor Transportasi (15%)'],
      ['Jml_Titik', 'Jumlah Titik'],
      ['Join_Count', 'Join Count'],
      ['Luas_ha', 'Luas (ha)'],
      ['Metode', 'Metode'],
    ],
    buffers: [
      ['Kode', 'Kode'],
      ['Nama', 'Nama'],
      ['Jarak_buf', 'Jarak Buffer (m)'],
      ['Kategori', 'Kategori'],
    ],
  };

  const fields = fieldOrderByLayer[layerKey] || [];
  const rowsHtml = fields
    .filter(([key]) => props[key] !== undefined && props[key] !== null && String(props[key]) !== '')
    .map(
      ([key, label]) => `
      <tr>
        <th>${escapeHtml(label)}</th>
        <td>${escapeHtml(String(props[key]))}</td>
      </tr>`
    )
    .join('');

  contentEl.innerHTML = `
    <div class="popup-title">${escapeHtml(String(title))}</div>
    <div class="popup-subtitle">${escapeHtml(String(subtitle))}</div>
    <table class="popup-table">${rowsHtml}</table>
  `;

  if (layerKey === 'points' && props.Foto && String(props.Foto).trim() !== '') {
    const photoPaths = String(props.Foto)
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);

    if (photoPaths.length > 0) {
      const photoGrid = document.createElement('div');
      photoGrid.className = 'popup-photos';

      photoPaths.forEach((rawPath) => {
        const normalizedPath = rawPath.startsWith('./') || rawPath.startsWith('/')
          ? rawPath
          : `./${rawPath}`;

        const img = document.createElement('img');
        img.src = normalizedPath;
        img.alt = `Foto ${title}`;
        img.loading = 'lazy';
        img.onerror = () => {
          img.remove();
          if (photoGrid.children.length === 0) {
            photoGrid.remove();
          }
        };
        photoGrid.appendChild(img);
      });

      contentEl.appendChild(photoGrid);
    }
  }

  // Picu ulang animasi pop-in tiap kali popup dibuka
  popupEl.classList.add('hidden');
  void popupEl.offsetWidth;
  popupEl.classList.remove('hidden');
  overlay.setPosition(coordinate);
}

/**
 * Mengatur tab sidebar, tombol buka/tutup sidebar responsif, dan toggle legenda.
 */
function initUiControls(map) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.classList.toggle('active', panel.id === targetId);
      });
    });
  });

  const sidebar = document.getElementById('sidebar');
  if (window.innerWidth <= 820) {
    sidebar.classList.add('collapsed');
  }

  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    setTimeout(() => map.updateSize(), 300);
  });

  const legendPanel = document.getElementById('legend-panel');
  const legendToggleBtn = document.getElementById('btn-toggle-legend');
  legendToggleBtn.addEventListener('click', () => {
    const minimized = legendPanel.classList.toggle('minimized');
    legendToggleBtn.textContent = minimized ? '+' : '−';
  });
}

/**
 * Helper sanitasi HTML untuk mencegah injeksi teks atribut.
 */
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Jalankan inisialisasi aplikasi
initApp();
