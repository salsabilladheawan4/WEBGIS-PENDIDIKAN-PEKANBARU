/**
 * Skrip halaman Home (src/js/home.js)
 * - Menu hamburger responsif & sorotan tautan aktif saat scroll
 * - Fetch statistik dari public/data/*.json + animasi angka berjalan (count-up)
 *   dengan angka bawaan 30 / 5 / 5 / 5 bila gagal tanpa error
 * - Mockup pratinjau interaktif (filter kondisi jalan & pindah lingkaran buffer)
 * - Penjelasan interaktif kelas aksesibilitas (Tinggi / Sedang / Rendah)
 * - Animasi scroll-reveal bertahap & tombol kembali ke atas
 * Catatan: Tidak memakai localStorage/sessionStorage maupun layanan eksternal.
 */

const DEFAULT_STATS = {
  points: 30,
  routes: 5,
  zones: 5,
  layers: 5,
};

/**
 * Mengambil jumlah fitur dari satu berkas JSON (EsriJSON maupun GeoJSON).
 */
async function fetchFeatureCount(url) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    const raw = await response.text();
    const json = JSON.parse(raw);
    if (json && Array.isArray(json.features)) {
      return json.features.length;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Animasi angka berjalan halus dari 0 menuju angka target.
 */
function animateCountUp(el, targetValue, durationMs = 650) {
  if (!el) return;
  const target = Number(targetValue) || 0;
  const startTime = performance.now();

  const step = (now) => {
    const progress = Math.min(1, (now - startTime) / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = String(Math.round(eased * target));
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = String(target);
    }
  };

  requestAnimationFrame(step);
}

/**
 * Memuat angka statistik ringkas dari berkas data di public/data/.
 */
async function loadHomeStats() {
  const pointsEl = document.getElementById('stat-points');
  const routesEl = document.getElementById('stat-routes');
  const zonesEl = document.getElementById('stat-zones');
  const layersEl = document.getElementById('stat-layers');

  const [pointsCount, routesCount, zonesCount, analysisCount, bufferCount] = await Promise.all([
    fetchFeatureCount('./data/01_data_point.json'),
    fetchFeatureCount('./data/02_data_polyline.json'),
    fetchFeatureCount('./data/03_data_polygon.json'),
    fetchFeatureCount('./data/04_data_hasil_analisis.json'),
    fetchFeatureCount('./data/05_buffer_sekolah.json'),
  ]);

  const availableCount = [pointsCount, routesCount, zonesCount, analysisCount, bufferCount].filter(
    (n) => n !== null
  ).length;

  animateCountUp(pointsEl, pointsCount ?? DEFAULT_STATS.points, 750);
  animateCountUp(routesEl, routesCount ?? DEFAULT_STATS.routes, 550);
  animateCountUp(zonesEl, zonesCount ?? DEFAULT_STATS.zones, 600);
  animateCountUp(layersEl, availableCount === 5 ? 5 : DEFAULT_STATS.layers, 650);
}

/**
 * Mengatur interaksi mockup pratinjau PlainGIS di bagian Hero:
 * - Klik chip filter untuk menyaring sekolah & menyorot titik pada SVG
 * - Klik item sekolah untuk memindahkan lingkaran buffer SVG secara halus
 */
function initInteractiveMockup() {
  const filterButtons = document.querySelectorAll('[data-mock-filter]');
  const schoolItems = document.querySelectorAll('#mockup-list .mockup-item');
  const svgPoints = document.querySelectorAll('.mock-pt');
  const bufferCircle = document.getElementById('mockup-buffer');

  if (!bufferCircle) return;

  const moveBufferToItem = (item) => {
    schoolItems.forEach((el) => el.classList.toggle('active', el === item));
    const cx = item.dataset.cx;
    const cy = item.dataset.cy;
    if (cx && cy) {
      bufferCircle.setAttribute('cx', cx);
      bufferCircle.setAttribute('cy', cy);
    }
  };

  schoolItems.forEach((item) => {
    item.addEventListener('click', () => moveBufferToItem(item));
  });

  filterButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mockFilter;
      filterButtons.forEach((b) => b.classList.toggle('active', b === btn));

      let firstMatch = null;
      schoolItems.forEach((item) => {
        const match = mode === 'all' || item.dataset.status === mode;
        item.classList.toggle('dimmed', !match);
        if (match && !firstMatch) firstMatch = item;
      });

      svgPoints.forEach((pt) => {
        const match = mode === 'all' || pt.dataset.status === mode;
        pt.classList.toggle('dimmed', !match);
      });

      if (firstMatch) {
        moveBufferToItem(firstMatch);
      }
    });
  });
}

/**
 * Mengatur pil interaktif kelas aksesibilitas (Tinggi / Sedang / Rendah) pada bagian Data & Metode.
 */
function initClassInfoPills() {
  const pills = document.querySelectorAll('[data-class-info]');
  const infoText = document.getElementById('class-info-text');
  if (!infoText || pills.length === 0) return;

  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.toggle('active', p === pill));
      infoText.style.opacity = '0.35';
      setTimeout(() => {
        infoText.textContent = pill.dataset.classInfo;
        infoText.style.opacity = '1';
      }, 110);
    });
  });
}

/**
 * Mengatur animasi scroll-reveal bertahap, bayangan navbar, sorotan tautan aktif, & tombol kembali ke atas.
 */
function initScrollEffects() {
  const navbar = document.querySelector('.navbar');
  const backTopBtn = document.getElementById('btn-back-top');
  const navLinks = document.querySelectorAll('.nav-links a[href^="#"]');
  const sections = Array.from(navLinks)
    .map((a) => document.querySelector(a.getAttribute('href')))
    .filter(Boolean);

  // Scroll-reveal bertahap pada kartu-kartu konten
  const revealTargets = document.querySelectorAll('.stat-card, .section .card, .notice-box');
  revealTargets.forEach((el, idx) => {
    el.classList.add('reveal');
    el.style.transitionDelay = `${(idx % 4) * 70}ms`;
  });

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealTargets.forEach((el) => observer.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('visible'));
  }

  // Update status navbar & tombol kembali ke atas saat halaman digulir
  const onScroll = () => {
    const y = window.scrollY;
    navbar?.classList.toggle('scrolled', y > 12);
    backTopBtn?.classList.toggle('hidden', y < 320);

    let activeId = 'beranda';
    sections.forEach((sec) => {
      if (y >= sec.offsetTop - 120) {
        activeId = sec.id;
      }
    });

    navLinks.forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  backTopBtn?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

/**
 * Mengatur menu hamburger responsif dan penutupan otomatis saat tautan diklik.
 */
function initMobileNavigation() {
  const toggleBtn = document.getElementById('btn-nav-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (!toggleBtn || !navMenu) return;

  const setOpen = (isOpen) => {
    navMenu.classList.toggle('open', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(isOpen));
  };

  toggleBtn.addEventListener('click', () => {
    setOpen(!navMenu.classList.contains('open'));
  });

  navMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setOpen(false));
  });

  document.addEventListener('click', (evt) => {
    if (!evt.target.closest('.navbar')) {
      setOpen(false);
    }
  });
}

// Jalankan seluruh inisialisasi halaman Home
initMobileNavigation();
initInteractiveMockup();
initClassInfoPills();
initScrollEffects();
loadHomeStats();
