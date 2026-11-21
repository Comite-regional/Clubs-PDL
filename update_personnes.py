#!/usr/bin/env python3 -I
import csv, json
from collections import defaultdict

CSV_DIPLOMES = '/Users/cyrilvanhamme/Downloads/extraction_diplomes_20261121145624.csv'
JSON_FILE = '/Users/cyrilvanhamme/Desktop/APPS CR/app clubs v2/clubs.json'

# Priorité des diplômes d'entraîneur (du plus haut au plus bas)
COACH_PRIORITY = [
    'DEJEPS', 'DESJEPS',
    'Entraîneur Fédéral', '1998 - Entraîneur Fédéral',
    'Encadrant Fédéral',
    'Entraîneur 2',
    'Entraîneur 1',
    'Entraîneur Club', 'Encadrant Club', 'Encadrant Club - Allègement',
    'BF Initiateur',
    "CQP Animateur Tir à l'Arc",
    'BEES 1', 'BEES 2',
    'Assistant Entraîneur',
    'Initiateur',
]

# Mapping vers les clés du DIPLOME_CONFIG dans app.js
DIPLOME_MAP = {
    'DEJEPS':                       'DEJEPS',
    'DESJEPS':                      'DESJEPS',
    'Entraîneur Fédéral':           'Entraîneur Fédéral',
    '1998 - Entraîneur Fédéral':    'Entraîneur Fédéral',
    'Encadrant Fédéral':            'Encadrant Fédéral',
    'Entraîneur 2':                 'Entraîneur 2',
    'Entraîneur 1':                 'Entraîneur 1',
    'Entraîneur Club':              'Encadrant Club',
    'Encadrant Club':               'Encadrant Club',
    'Encadrant Club - Allègement':  'Encadrant Club',
    'BF Initiateur':                'BFI',
    "CQP Animateur Tir à l'Arc":   'CQP Animateur',
    'BEES 1':                       'BEES 1',
    'BEES 2':                       'BEES 2',
    'Assistant Entraîneur':         'Assistant Entraîneur',
    'Initiateur':                   'Initiateur',
}
COACH_LABELS = set(COACH_PRIORITY)

# Libellés qui identifient un arbitre formateur (priorité 1)
ARB_FORMATEUR_LABELS = {
    'Arbitre Formateur - Initiale',
    'Arbitre Formateur - Continue',
}
# Libellés qui identifient un arbitre fédéral (priorité 2)
ARB_FEDERAL_LABELS = {
    'Arbitre Fédéral - Examen - Tronc Commun',
    'Arbitre Fédéral - Examen - Cibles anglaises',
    'Arbitre Fédéral - Examen - Cibles',
    'Arbitre Fédéral - Examen - Tir en Campagne',
    'Arbitre Fédéral - Examen - Tir nature / 3D',
    'Arbitre Fédéral - Examen - Beursault',
    'Arbitre Fédéral - Examen - Compétence Run Archery',
    'Arbitre Fédéral - Cibles',
    'Arbitre Fédéral - Campagne',
    'Arbitre Fédéral - Nature/3D',
}
# Libellés qui identifient un jeune arbitre (priorité 3)
ARB_JEUNE_LABELS = {
    'Arbitre Fédéral Jeune - Cibles',
    'Arbitre Fédéral Jeune - Campagne',
    'Arbitre Fédéral Jeune - Nature/3D',
    'Jeune Arbitre - Examen - Tronc Commun',
    'Jeune Arbitre - Examen - Toutes options',
    'Jeune Arbitre - Examen - Cibles',
    'Jeune Arbitre - Examen - Cibles anglaises',
}

# --- Lecture du CSV diplômes ---
# Structure par personne : code_adh -> {nom, club, coach_diplomes: set, arb_niveau: str|None}
personnes = {}  # code_adh -> {nom, structure, coach_diplomes, arb_formateur, arb_federal, arb_jeune}

with open(CSV_DIPLOMES, encoding='utf-8-sig') as f:
    reader = csv.DictReader(f, delimiter=';')
    for row in reader:
        # Filtre : licencié actif cette saison
        if row.get('Saison dernière licence active', '').strip() != '2027':
            continue
        # Filtre : diplôme actif uniquement
        if row.get('Etat', '').strip() != 'Actif':
            continue
        # Filtre : ignorer VSS
        libelle = row.get('Libellé', '').strip()
        if libelle == 'VSS':
            continue

        code_adh = row.get('Code Adhérent', '').strip()
        nom = f"{row.get('Nom','').strip()} {row.get('Prénom','').strip()}".strip()
        code_struct = row.get('Code structure actuelle', '').strip()

        if not code_adh or not code_struct:
            continue

        if code_adh not in personnes:
            personnes[code_adh] = {
                'nom': nom,
                'structure': code_struct,
                'coach_diplomes': set(),
                'arb_formateur': False,
                'arb_federal': False,
                'arb_jeune': False,
            }
        p = personnes[code_adh]

        if libelle in COACH_LABELS:
            p['coach_diplomes'].add(libelle)
        if libelle in ARB_FORMATEUR_LABELS:
            p['arb_formateur'] = True
        if libelle in ARB_FEDERAL_LABELS:
            p['arb_federal'] = True
        if libelle in ARB_JEUNE_LABELS:
            p['arb_jeune'] = True

# --- Construire les listes par club ---
club_entraineurs = defaultdict(list)
club_arbitres = defaultdict(list)

for p in personnes.values():
    code = p['structure']
    nom = p['nom']

    # Meilleur diplôme entraîneur (selon priorité)
    if p['coach_diplomes']:
        best = None
        for dip in COACH_PRIORITY:
            if dip in p['coach_diplomes']:
                best = dip
                break
        if best:
            mapped = DIPLOME_MAP.get(best, best)
            club_entraineurs[code].append({'nom': nom, 'diplome': mapped})

    # Niveau arbitre (priorité : Formateur > Fédéral > Jeune)
    if p['arb_formateur']:
        club_arbitres[code].append({'nom': nom, 'niveau': 'Formateur'})
    elif p['arb_federal']:
        club_arbitres[code].append({'nom': nom, 'niveau': 'Fédéral'})
    elif p['arb_jeune']:
        club_arbitres[code].append({'nom': nom, 'niveau': 'Jeune'})

# --- Mise à jour clubs.json ---
with open(JSON_FILE, encoding='utf-8') as f:
    clubs = json.load(f)

for club in clubs:
    code = str(club.get('code_structure', ''))
    entraineurs = club_entraineurs.get(code, [])
    arbitres = club_arbitres.get(code, [])

    club['entraineurs'] = entraineurs
    club['nb_entraineurs'] = len(entraineurs)
    club['niveaux_entraineurs'] = list({e['diplome'] for e in entraineurs})
    club['arbitres'] = arbitres
    club['nb_arbitres'] = len(arbitres)
    club['a_arbitre'] = len(arbitres) > 0

with open(JSON_FILE, 'w', encoding='utf-8') as f:
    json.dump(clubs, f, ensure_ascii=False, indent=2)

print(f"Clubs avec encadrants : {sum(1 for c in clubs if c['nb_entraineurs'] > 0)}")
print(f"Clubs avec arbitres   : {sum(1 for c in clubs if c['nb_arbitres'] > 0)}")

diplomes = set()
for c in clubs:
    for e in c.get('entraineurs', []):
        diplomes.add(e.get('diplome'))
print(f"\nDiplômes présents : {sorted(diplomes)}")

print(f"\nClubs sans encadrant ni arbitre :")
for c in sorted(clubs, key=lambda x: (x['departement'], x['nom'])):
    if c['nb_entraineurs'] == 0 and c['nb_arbitres'] == 0:
        print(f"  {c['departement']} - {c['nom']}")
