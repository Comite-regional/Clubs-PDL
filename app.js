const MAP_CENTER = [47.55, -0.90];
const MAP_ZOOM = 8;

const DEPT_LABELS = { '44': 'Loire-Atl.', '49': 'Maine-et-L.', '53': 'Mayenne', '72': 'Sarthe', '85': 'Vendée' };
const DEPT_COLORS = { '44': '#353089', '49': '#8b3a8b', '53': '#db2922', '72': '#1a8a4a', '85': '#d97706' };

let map, clustersLayer, clubs = [], filtered = [];
let activeDept = '', activePractice = '';
let currentClub = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

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
    const logoSrc = c.logo_url || 'assets/logo_cr_pdl.png';

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
    const tel = c.telephone && String(c.telephone).replace(/[^0-9]/g,'').length >= 7 ? c.telephone : null;
    if (tel) {
        contactItems.push(`
            <a class="contact-item" href="tel:${esc(tel)}">
                <span class="contact-icon"><i class="fas fa-phone"></i></span>
                <span class="contact-text">${esc(tel)}</span>
            </a>`);
    }
    if (c.email) {
        contactItems.push(`
            <a class="contact-item" href="mailto:${esc(c.email)}">
                <span class="contact-icon"><i class="fas fa-envelope"></i></span>
                <span class="contact-text">${esc(c.email)}</span>
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
            <img src="${esc(logoSrc)}" alt="${esc(c.nom)}" onerror="this.src='assets/logo_cr_pdl.png'">
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
    clustersLayer.clearLayers();

    filtered.forEach(c => {
        const color = getDeptColor(c.cp);
        const marker = L.marker([c.lat, c.lng], { icon: makeMarkerIcon(color) });
        marker.on('click', () => openPanel(c));
        clustersLayer.addLayer(marker);
    });

    if (shouldZoom && filtered.length > 0) {
        const group = new L.featureGroup(clustersLayer.getLayers());
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

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19
    }).addTo(map);

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

    clustersLayer = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        iconCreateFunction: cluster => {
            const count = cluster.getChildCount();
            return L.divIcon({
                html: `<div style="
                    width:40px;height:40px;border-radius:50%;
                    background:var(--blue);color:white;
                    display:flex;align-items:center;justify-content:center;
                    font-family:'Montserrat',sans-serif;font-weight:800;font-size:13px;
                    border:3px solid white;box-shadow:0 2px 10px rgba(53,48,137,0.35);
                ">${count}</div>`,
                className: '',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
            });
        }
    });
    clustersLayer.addTo(map);

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
