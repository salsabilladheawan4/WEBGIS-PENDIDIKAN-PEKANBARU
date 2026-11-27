# WebGIS Aksesibilitas Fasilitas Pendidikan Kota Pekanbaru

Aplikasi WebGIS interaktif untuk memetakan, menyaring, dan menganalisis aksesibilitas fasilitas pendidikan di Kota Pekanbaru berdasarkan data survei lapangan (Avenza Maps, 30 titik). Dibangun menggunakan **Vite (Vanilla JS)**, **OpenLayers (`ol`)**, dan **Turf.js (`@turf/turf`)**.

## Cara Menjalankan

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Jalankan server pengembangan:
   ```bash
   npm start
   ```
   Lalu buka URL lokal yang ditampilkan di terminal (default `http://localhost:5173`).
3. Build versi produksi (multi-page `index.html` & `peta.html`):
   ```bash
   npm run build
   ```
4. Pratinjau hasil build:
   ```bash
   npm run preview
   ```

## Struktur Folder

```text
GIS-KEL3_3TIE/
├── index.html                    # Halaman Home (profil, latar belakang, fitur, cara pakai, sumber data)
├── peta.html                     # Halaman Peta Interaktif OpenLayers
├── package.json                  # Dependensi versi tetap (vite, ol, @turf/turf)
├── vite.config.js                # Konfigurasi multi-page build Vite
├── README.md                     # Dokumentasi singkat proyek
├── public/
│   ├── data/
│   │   ├── 01_data_point.json          # 30 titik fasilitas pendidikan & halte
│   │   ├── 02_data_polyline.json       # 5 rute akses estimasi
│   │   ├── 03_data_polygon.json        # 5 zona pendidikan estimasi
│   │   ├── 04_data_hasil_analisis.json # 5 zona dengan skor & klasifikasi
│   │   └── (05_buffer_sekolah.json)    # Opsional — dilewati otomatis jika belum tersedia
│   ├── icon/                     # Tempat ikon opsional (school.png)
│   └── images/                   # Tempat foto lapangan (P14_01.jpg, dst.)
└── src/
    ├── styles/
    │   ├── home.css              # Gaya halaman Home
    │   └── map.css               # Gaya halaman Peta
    └── js/
        ├── data.js               # Pemuatan data EsriJSON/GeoJSON (EPSG:4326 -> EPSG:3857)
        ├── style.js              # Simbologi layer titik, rute, zona, analisis, dan buffer
        ├── filter.js             # Filter gabungan AND (checkbox & dropdown)
        ├── analysis.js           # Buffer interaktif Turf.js, spatial query, & ringkasan zona
        └── main.js               # Inisialisasi peta OpenLayers, kontrol UI, legenda, & popup
```

## Catatan Data
- Data rute (`02_data_polyline.json`) dan zona (`03_data_polygon.json`, `04_data_hasil_analisis.json`) merupakan estimasi dari titik-titik survei lapangan.
- Jika file `public/data/05_buffer_sekolah.json` ditambahkan di kemudian hari (format EsriJSON maupun GeoJSON), layer **Buffer Sekolah** akan otomatis aktif di peta.
