# 🇧🇪 BRABO — Belgian Smart Accounting & Peppol Hub

> **Alternative moderne à Falco (Horus Software) pour le contexte fiscal et juridique belge.**
> Conforme à la loi belge du 20 février 2024 et à l'obligation B2B Peppol 2026.

![BRABO Banner](https://img.shields.io/badge/Belgium_Tax_2026-Ready-amber.svg)
![Peppol](https://img.shields.io/badge/Peppol_BIS_3.0-EN_16931-emerald.svg)
![React](https://img.shields.io/badge/React_19-TypeScript_Tailwind-blue.svg)

---

## 🌟 Fonctionnalités Clés (Règles Comptables Belges)

### 1. 🏢 Identification & Numéros d'Entreprise (`BCE / KBO`)
- Algorithme de vérification officiel **Modulo 97** : `97 - (premiers 8 chiffres % 97) === 2 derniers chiffres`.
- Prise en charge des formats 10 chiffres (`BE 0123.456.789`) et 9 chiffres anciens.

### 2. 🔢 Communication Structurée Belge (`OGM / VCS`)
- Format officiel Febelfin : `+++123/4567/89012+++` avec vérification Modulo 97 (si reste = 0 $\rightarrow$ 97).
- Générateur et validateur interactif intégré avec copie en 1 clic.

### 3. 🌐 Passerelle Peppol B2B Obligatoire 2026
- Générateur et inspecteur XML **Peppol BIS Billing 3.0 (UBL 2.1)** conforme à la norme européenne **EN 16931**.
- Identifiant de participant belge EAS `0208` (`iso6523-actorid-upis::0208:...`).
- Recherche en direct dans l'**Annuaire Peppol belge** (Vérification SMP / Access Point).
- Passerelle de secours **Hermès** (SPF Finances).

### 4. 📑 Déclaration Périodique TVA Belge (Grilles 00 à 72)
Calcul en temps réel des grilles officielles :
- **Cadre II (Ventes)** : Grilles `00` (0%), `01` (6%), `02` (12%), `03` (21%), `44` (Services UE Art. 21 §2), `45` (Cocontractant Art. 20), `46` (Livraisons intracommunautaires Art. 39bis), `47` (Exemptions).
- **Cadre III (Taxes dues)** : Grilles `54`, `55`, `56`, `57`.
- **Cadre IV (Achats & Déductibilité)** : Grilles `81` (Marchandises), `82` (Services & Biens divers), `83` (Investissements), `59` (TVA Déductible).
- **Cadre V (Solde)** : Grille `71` (TVA due à l'État) ou Grille `72` (Crédit TVA à récupérer).

### 5. 👥 Listing Annuel des Clients Assujettis
- Filtre automatique des clients assujettis avec un chiffre d'affaires `> 250,00 € HTVA`.
- Export en 1 clic du fichier officiel **XML Intervat** pour téléversement direct sur le portail du SPF Finances.

### 6. 📱 QR Code de Paiement SEPA / EPC (`EPC069-12`)
- Génération du QR Code officiel européen de virement bancaire avec IBAN belge, montant et OGM intégrés.
- Inclusion directe sur la facture PDF imprimée / téléchargée pour paiement instantané via app bancaire belge (Belfius, BNP Paribas Fortis, KBC, ING).

### 7. ⚖️ Recouvrement Légal & Calculateur de Retard
- Conforme à la **loi belge du 2 août 2002** (Lutte contre le retard de paiement dans les transactions commerciales B2B) et à la **loi du 4 mai 2023** (Livre XIX CDE).
- Calcul automatique des **intérêts légaux de retard** (taux officiel de **12,50%** l'an).
- Application de l'**indemnité forfaitaire légale de 40,00 €** pour frais de recouvrement.
- Génération de lettres de rappel (Rappel amical, Rappel formel, Mise en demeure avant citation).

### 8. 🏦 Rapprochement Bancaire CODA Febelfin & CAMT.053
- Glisser-déposer de fichiers réels `.cod` (standard Febelfin 80 caractères) ou `.xml` (CAMT.053).
- Rapprochement automatique à 100% de confiance grâce aux communications structurées (OGM).

### 9. 🚗 ATN Voiture de Société & Simulateur ISOC (Impôt des Sociétés)
- Simulateur officiel de l'**Avantage de Toute Nature (ATN)** pour voiture de société (100% électrique vs thermique, coefficient d'âge, minimum légal 1.600 €).
- Simulateur **ISOC** : Taux réduit PME à **20%** sur la 1ère tranche de 100.000 € (Art. 215 CIR 92) vs taux ordinaire 25%.
- Comparatif des régimes de dividendes : **VVPR-bis (15%)**, **Réserve de liquidation (10% + 5%)**, **Dividende ordinaire (30%)**.

### 10. 🏛️ Simulateur Cotisations Sociales INASTI / RSVZ & PLCI (VAPZ)
- Barèmes officiels trimestriels (20,50% jusqu'au 1er plafond, 14,16% jusqu'au 2ème plafond).
- Optimisation fiscale de la **Pension Libre Complémentaire pour Indépendants (PLCI / VAPZ)** (max 8,17% du revenu net imposable).

### 11. 🤝 Espace Fiduciaire / Expert-Comptable ITAA
- Export direct vers les logiciels comptables leaders en Belgique :
  - **Sage BOB 50 / Expert** (Fichiers ASCII)
  - **WinBooks** (XML / WBF)
  - **Horus Office / Horus Cloud** (XML Bridge)
  - **Exact Online** (CSV)
- Messagerie collaborative en direct avec votre cabinet comptable agréé ITAA.

---

## 🛠️ Stack Technique

- **Framework** : React 19 + TypeScript + Vite
- **Styling** : Tailwind CSS v4
- **PDF Engine** : jsPDF + jspdf-autotable
- **QR Code** : QRCode (EPC SEPA standard)
- **Icons & UI** : Lucide React + Canvas Confetti
- **Multilingue** : Français (BE), Nederlands (BE), English (BE)

---

## 🚀 Installation & Lancement

```bash
# Cloner le dépôt
git clone https://github.com/clixite/brabo-accounting.git
cd brabo-accounting

# Installer les dépendances
npm install

# Démarrer en développement
npm run dev

# Compiler pour la production
npm run build
```

---

## 📄 Licence

Propriété de [Clixite](https://github.com/clixite). Développé pour les indépendants, PME et fiduciaires belges.
