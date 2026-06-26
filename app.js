const MAP_CENTER = [47.55, -0.90];
const MAP_ZOOM = 8;

const DEPT_LABELS = { '44': 'Loire-Atl.', '49': 'Maine-et-L.', '53': 'Mayenne', '72': 'Sarthe', '85': 'Vendée' };
const DEPT_COLORS = { '44': '#353089', '49': '#8b3a8b', '53': '#db2922', '72': '#1a8a4a', '85': '#d97706' };

let map, markersLayer, clubs = [], filtered = [];
let activeDept = '', activePractice = '';
let currentClub = null;
let satelliteMode = false;
let layerClassic, layerSatellite, layerSatLabels;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function makeLogoPlaceholder(nom, color) {
    const initiales = nom.split(/\s+/).filter(Boolean).slice(0,2).map(w => w[0]).join('').toUpperCase();
    return `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56">
        <rect width="56" height="56" rx="10" fill="${color}33"/>
        <text x="28" y="37" text-anchor="middle" font-family="Montserrat,sans-serif" font-weight="800" font-size="22" fill="${color}">${initiales}</text>
    </svg>`;
}

function logoError(img, code) {
    const c = clubs.find(x => x.code_structure === code);
    if (c) img.parentElement.innerHTML = makeLogoPlaceholder(c.nom, getDeptColor(c.cp));
}

function logoLoad(img, code) {
    // Image chargée — rien à faire, on l'affiche telle quelle
}

function getDeptColor(cp) {
    return DEPT_COLORS[String(cp).substring(0, 2)] || '#64748b';
}

/** Crée une icône marqueur SVG aux couleurs de la charte **/
function makeMarkerIcon(color) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
        <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 26 16 26S32 26 32 16C32 7.163 24.837 0 16 0z"
              fill="${color}" stroke="white" stroke-width="2"/>
        <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>`;
    return L.divIcon({
        html: svg,
        className: '',
        iconSize: [32, 42],
        iconAnchor: [16, 42],
        popupAnchor: [0, -44]
    });
}

/** HTML du panel latéral pour un club **/
function renderPanel(c) {
    const color = getDeptColor(c.cp);
    const logoPlaceholder = makeLogoPlaceholder(c.nom, color);

    const labelBadge = (c.label_club && c.label_club !== 'Non' && c.label_club !== 'Aucun')
        ? `<div class="panel-label-badge"><img src="assets/label_${c.label_club.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')}.png" alt="${esc(c.label_club)}" onerror="this.parentElement.style.display='none'"></div>`
        : '';

    const practiques = c.pratiques?.length
        ? c.pratiques.map(p => `<span class="pratique-tag">${esc(p)}</span>`).join('')
        : '<span style="color:var(--gray-400);font-size:13px">Non renseigné</span>';

    const adresseLine = [c.adresse, c.cp, c.ville].filter(Boolean).join(', ');

    const contactItems = [];
    if (adresseLine) {
        const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(adresseLine)}`;
        contactItems.push(`
            <a class="contact-item" href="${mapsUrl}" target="_blank" rel="noopener">
                <span class="contact-icon"><i class="fas fa-map-marker-alt"></i></span>
                <span class="contact-text">${esc(adresseLine)}</span>
            </a>`);
    }
    const email = c.email && c.email.includes('@') ? c.email : null;
    if (email) {
        contactItems.push(`
            <a class="contact-item" href="mailto:${esc(email)}">
                <span class="contact-icon"><i class="fas fa-envelope"></i></span>
                <span class="contact-text">${esc(email)}</span>
            </a>`);
    }
    if (c.site) {
        const displayUrl = c.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        contactItems.push(`
            <a class="contact-item" href="${esc(c.site)}" target="_blank" rel="noopener">
                <span class="contact-icon"><i class="fas fa-globe"></i></span>
                <span class="contact-text">${esc(displayUrl)}</span>
            </a>`);
    }

    const president = c.president
        ? `<div class="contact-item">
               <span class="contact-icon"><i class="fas fa-user-tie"></i></span>
               <span class="contact-text">${esc(c.president)}</span>
           </div>`
        : '';

    return `
    <div class="panel-hero" style="background: linear-gradient(135deg, ${color} 0%, ${color}cc 100%);">
        <div class="panel-logo-wrap">
            ${c.logo_url
                ? `<img src="${esc(c.logo_url)}" alt="${esc(c.nom)}"
                     onload="logoLoad(this,${c.code_structure})"
                     onerror="logoError(this,${c.code_structure})">`
                : logoPlaceholder}
        </div>
        <div class="panel-club-name">${esc(c.nom)}</div>
        <div class="panel-club-city"><i class="fas fa-map-marker-alt" style="margin-right:5px;opacity:0.8"></i>${esc(c.ville)} — ${esc(c.departement || '')}</div>
        ${labelBadge}
    </div>

    <div class="panel-body">

        ${c.licences_total ? `
        <div class="panel-section">
            <div class="membres-badge">
                <span class="nb">${c.licences_total}</span>
                <span class="label">licencié${c.licences_total > 1 ? 's' : ''}</span>
            </div>
        </div>` : ''}

        <div class="panel-section">
            <div class="panel-section-title">Disciplines pratiquées</div>
            <div class="pratiques-grid">${practiques}</div>
        </div>

        ${president ? `
        <div class="panel-section">
            <div class="panel-section-title">Responsable</div>
            <div class="contact-list">${president}</div>
        </div>` : ''}

        ${contactItems.length ? `
        <div class="panel-section">
            <div class="panel-section-title">Contact & Accès</div>
            <div class="contact-list">${contactItems.join('')}</div>
        </div>` : ''}

    </div>`;
}

/** Filtre et affichage des marqueurs **/
function applyFilters() {
    const q = document.getElementById('search').value.toLowerCase().trim();

    filtered = clubs.filter(c => {
        const okSearch = !q || `${c.nom} ${c.ville} ${c.cp}`.toLowerCase().includes(q);
        const okDept = !activeDept || c.departement === activeDept;
        const okPrac = !activePractice || (c.pratiques && c.pratiques.includes(activePractice));
        return okSearch && okDept && okPrac;
    });

    renderMarkers(q !== '' || activeDept !== '');
    updateCount();
}

function renderMarkers(shouldZoom = false) {
    markersLayer.clearLayers();

    filtered.forEach(c => {
        const color = getDeptColor(c.cp);
        const marker = L.marker([c.lat, c.lng], { icon: makeMarkerIcon(color) });
        marker.on('click', () => openPanel(c));
        markersLayer.addLayer(marker);
    });

    if (shouldZoom && filtered.length > 0) {
        const group = new L.featureGroup(markersLayer.getLayers());
        if (group.getBounds().isValid()) {
            map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 13 });
        }
    }
}

function updateCount() {
    document.getElementById('clubCount').textContent = filtered.length;
}

/** Panel latéral **/
function openPanel(c) {
    currentClub = c;
    document.getElementById('panelContent').innerHTML = renderPanel(c);
    document.getElementById('clubPanel').classList.add('open');
    document.getElementById('panelOverlay').classList.add('show');
    map.setView([c.lat, c.lng], Math.max(map.getZoom(), 12));
}

function closePanel() {
    document.getElementById('clubPanel').classList.remove('open');
    document.getElementById('panelOverlay').classList.remove('show');
    currentClub = null;
}

/** Chips département **/
function buildDeptChips(clubs) {
    const depts = [...new Set(clubs.map(c => String(c.cp).substring(0, 2)))].sort();
    const container = document.getElementById('deptChips');
    depts.forEach(dept => {
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.dataset.dept = dept;
        btn.textContent = DEPT_LABELS[dept] || dept;
        btn.style.setProperty('--chip-color', DEPT_COLORS[dept] || '#353089');
        btn.onclick = () => selectDept(dept, btn);
        container.appendChild(btn);
    });
}

function selectDept(dept, clickedBtn) {
    const isActive = activeDept === dept;
    activeDept = isActive ? '' : dept;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    if (!isActive) {
        clickedBtn.classList.add('active');
    } else {
        document.querySelector('.chip[data-dept=""]').classList.add('active');
    }
    applyFilters();
}

/** Initialisation **/
async function init() {
    map = L.map('map', {
        zoomControl: false,
        attributionControl: true
    }).setView(MAP_CENTER, MAP_ZOOM);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Fond plan — OSM France (étiquettes en français)
    layerClassic = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap France',
        maxZoom: 20
    });

    // Fond satellite — ESRI World Imagery
    layerSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri — Source: Esri, Maxar, GeoEye, Earthstar Geographics',
        maxZoom: 19
    });

    // Labels satellite (noms de villes par-dessus)
    layerSatLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        opacity: 0.9
    });

    layerClassic.addTo(map);

    // Bouton bascule satellite / plan
    document.getElementById('btnSatellite').onclick = () => {
        satelliteMode = !satelliteMode;
        const btn = document.getElementById('btnSatellite');
        if (satelliteMode) {
            map.removeLayer(layerClassic);
            layerSatellite.addTo(map);
            layerSatLabels.addTo(map);
            btn.classList.add('active');
            btn.querySelector('span').textContent = 'Plan';
        } else {
            map.removeLayer(layerSatellite);
            map.removeLayer(layerSatLabels);
            layerClassic.addTo(map);
            btn.classList.remove('active');
            btn.querySelector('span').textContent = 'Satellite';
        }
    };

    // Frontières PDL
    try {
        const geoRes = await fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements.geojson');
        const geoData = await geoRes.json();
        L.geoJSON(geoData, {
            filter: f => ['44','49','53','72','85'].includes(f.properties.code),
            style: f => ({
                color: DEPT_COLORS[f.properties.code] || '#353089',
                weight: 2,
                fillOpacity: 0.04,
                dashArray: '6, 8'
            })
        }).addTo(map);
    } catch (e) { /* silencieux si hors ligne */ }

    markersLayer = L.layerGroup().addTo(map);

    // Fermeture panel
    document.getElementById('panelClose').onclick = closePanel;
    document.getElementById('panelOverlay').onclick = closePanel;

    // Recherche
    const searchInput = document.getElementById('search');
    const btnClear = document.getElementById('btnClearSearch');

    searchInput.addEventListener('input', () => {
        btnClear.classList.toggle('visible', searchInput.value.length > 0);
        applyFilters();
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') { searchInput.value = ''; btnClear.classList.remove('visible'); applyFilters(); }
    });

    btnClear.onclick = () => {
        searchInput.value = '';
        btnClear.classList.remove('visible');
        applyFilters();
    };

    // Filtre discipline
    document.getElementById('practice').onchange = e => {
        activePractice = e.target.value;
        applyFilters();
    };

    // Chip "Tous"
    document.querySelector('.chip[data-dept=""]').onclick = () => {
        activeDept = '';
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        document.querySelector('.chip[data-dept=""]').classList.add('active');
        applyFilters();
    };

    // Chargement données
    try {
        const res = await fetch('./clubs.json');
        clubs = (await res.json()).map(c => ({
            ...c,
            lat: Number(c.lat),
            lng: Number(c.lon || c.lng),
            licences_total: Number(c.licences_total || 0),
            pratiques: Array.isArray(c.pratiques) ? c.pratiques : [],
            entraineurs: Array.isArray(c.entraineurs) ? c.entraineurs : [],
            arbitres: Array.isArray(c.arbitres) ? c.arbitres : []
        }));

        buildDeptChips(clubs);
        filtered = [...clubs];
        renderMarkers(false);
        updateCount();
    } catch (e) {
        console.error('Erreur chargement clubs.json', e);
    }
}

document.addEventListener('DOMContentLoaded', init);
