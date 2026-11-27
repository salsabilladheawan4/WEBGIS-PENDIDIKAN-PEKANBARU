/**
 * Modul penyaringan (filter) titik fasilitas pendidikan (src/js/filter.js)
 * Menggunakan filter chip interaktif berbasis checkbox (Kond_Jalan, Pedestrian, Kelas_Akses)
 * dan dropdown (Jenis, Trans_Utama) dengan logika gabungan AND.
 */
import { ROAD_COLORS } from './style.js';

const KOND_JALAN_OPTIONS = ['Aspal Baik', 'Aspal Sedang', 'Aspal Berlubang'];
const PEDESTRIAN_OPTIONS = ['Ada Trotoar', 'Tidak Ada'];
const KELAS_AKSES_OPTIONS = ['Tinggi', 'Sedang', 'Rendah'];

const KELAS_DOT_COLORS = {
  Tinggi: '#16a34a',
  Sedang: '#eab308',
  Rendah: '#dc2626',
};

/**
 * Merender daftar filter chip interaktif (tetap menggunakan input checkbox semantik).
 */
function renderChipCheckboxGroup(container, groupName, options, colorMap = null, onChange) {
  container.innerHTML = '';
  options.forEach((val) => {
    const label = document.createElement('label');
    label.className = 'filter-chip checked';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = groupName;
    input.value = val;
    input.checked = true;
    input.addEventListener('change', () => {
      label.classList.toggle('checked', input.checked);
      onChange();
    });

    label.appendChild(input);

    if (colorMap && colorMap[val]) {
      const dot = document.createElement('span');
      dot.className = 'color-dot';
      dot.style.backgroundColor = colorMap[val];
      label.appendChild(dot);
    }

    const text = document.createElement('span');
    text.textContent = val;
    label.appendChild(text);

    container.appendChild(label);
  });
}

/**
 * Mengisi opsi dropdown dari nilai unik field pada data aktual.
 */
function populateSelectOptions(selectEl, defaultLabel, values) {
  selectEl.innerHTML = '';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = defaultLabel;
  selectEl.appendChild(defaultOpt);

  values.forEach((val) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    selectEl.appendChild(opt);
  });
}

/**
 * Mengambil nilai unik terurut dari atribut fitur.
 */
function getUniqueValues(features, fieldName) {
  const set = new Set();
  features.forEach((f) => {
    const val = f.get(fieldName);
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      set.add(String(val).trim());
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
}

/**
 * Menginisialisasi seluruh kontrol filter dan menghubungkannya dengan VectorSource titik.
 */
export function initPointFilters(allPointFeatures, pointSource, onFilterApplied) {
  const kondContainer = document.getElementById('filter-kond-jalan');
  const pedContainer = document.getElementById('filter-pedestrian');
  const kelasContainer = document.getElementById('filter-kelas-akses');
  const jenisSelect = document.getElementById('filter-jenis');
  const transSelect = document.getElementById('filter-trans-utama');
  const counterEl = document.getElementById('filter-counter');
  const resetBtn = document.getElementById('btn-reset-filter');

  const totalCount = allPointFeatures.length;

  // Isi opsi dropdown dari nilai aktual di file 01_data_point.json
  const jenisValues = getUniqueValues(allPointFeatures, 'Jenis');
  const transValues = getUniqueValues(allPointFeatures, 'Trans_Utama');
  populateSelectOptions(jenisSelect, 'Semua Jenis', jenisValues);
  populateSelectOptions(transSelect, 'Semua Moda', transValues);

  // Mengambil nilai checkbox yang tercentang pada suatu container
  const getCheckedValues = (container) => {
    const checked = container.querySelectorAll('input[type="checkbox"]:checked');
    return new Set(Array.from(checked).map((el) => el.value));
  };

  // Menerapkan semua filter dengan logika AND
  const applyFilters = (isReset = false) => {
    const selectedKond = getCheckedValues(kondContainer);
    const selectedPed = getCheckedValues(pedContainer);
    const selectedKelas = getCheckedValues(kelasContainer);
    const selectedJenis = jenisSelect.value;
    const selectedTrans = transSelect.value;

    const filtered = allPointFeatures.filter((feature) => {
      const kond = feature.get('Kond_Jalan');
      const ped = feature.get('Pedestrian');
      const kelas = feature.get('Kelas_Akses');
      const jenis = feature.get('Jenis');
      const trans = feature.get('Trans_Utama');

      if (!selectedKond.has(kond)) return false;
      if (!selectedPed.has(ped)) return false;
      if (!selectedKelas.has(kelas)) return false;
      if (selectedJenis && jenis !== selectedJenis) return false;
      if (selectedTrans && trans !== selectedTrans) return false;

      return true;
    });

    pointSource.clear();
    pointSource.addFeatures(filtered);

    counterEl.textContent = `Menampilkan ${filtered.length} dari ${totalCount} titik`;
    // Animasi bump ringan pada penghitung saat filter berubah
    counterEl.classList.remove('bump');
    void counterEl.offsetWidth;
    counterEl.classList.add('bump');
    setTimeout(() => counterEl.classList.remove('bump'), 200);

    if (typeof onFilterApplied === 'function') {
      onFilterApplied(filtered, isReset);
    }
  };

  // Render grup filter chip
  renderChipCheckboxGroup(kondContainer, 'kond_jalan', KOND_JALAN_OPTIONS, ROAD_COLORS, () => applyFilters(false));
  renderChipCheckboxGroup(pedContainer, 'pedestrian', PEDESTRIAN_OPTIONS, null, () => applyFilters(false));
  renderChipCheckboxGroup(kelasContainer, 'kelas_akses', KELAS_AKSES_OPTIONS, KELAS_DOT_COLORS, () => applyFilters(false));

  // Event listener dropdown
  jenisSelect.addEventListener('change', () => applyFilters(false));
  transSelect.addEventListener('change', () => applyFilters(false));

  // Tombol Reset Filter
  resetBtn.addEventListener('click', () => {
    [kondContainer, pedContainer, kelasContainer].forEach((container) => {
      container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = true;
        cb.closest('.filter-chip')?.classList.add('checked');
      });
    });
    jenisSelect.value = '';
    transSelect.value = '';
    applyFilters(true);
  });

  // Terapkan kondisi awal (semua titik tampil)
  applyFilters(false);
}
