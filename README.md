# 🇧🇪 BRABO — Belgian Smart Accounting & Peppol Hub

> **SaaS comptable belge multi-tenant : un espace pour le client, un poste de pilotage pour le cabinet.**
> Conforme à la loi belge du 20 février 2024 et à l'obligation B2B Peppol 2026.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fclixite%2Fbrabo-accounting)

![Belgium Tax 2026](https://img.shields.io/badge/Belgium_Tax_2026-Ready-amber.svg)
![Peppol](https://img.shields.io/badge/Peppol_BIS_3.0-EN_16931-emerald.svg)
![React](https://img.shields.io/badge/React_19-TypeScript_Tailwind-blue.svg)
![Tests](https://img.shields.io/badge/tests-111-green.svg)

---

## 🎯 Vision produit

BRABO sert **deux publics** dans un même socle, **strictement séparé et sécurisé** :

| Espace | Rôle | Ce qu'il fait |
|---|---|---|
| **Client** | Gérant d'entreprise | Encode facilement (OCR, auto-encodage bancaire), consulte ses rapports, dépose sa TVA **si le cabinet l'y autorise**. |
| **Cabinet** | Expert-comptable ITAA | Pilote tous ses dossiers, **optimise** la stratégie fiscale, **déclare** (TVA, listing), gère les droits d'accès clients. |

La partie encodage + optimisation basique est **automatique** ; le fiscaliste **améliore, optimise et déclare** ; le client peut **s'auto-déclarer** si le comptable lui a donné l'accès.

---

## 🏗️ Architecture (multi-tenant, sécurisée)

```
┌─────────────────────────────────────────────────────────────┐
│                      UI (React 19)                          │
│  ClientWorkspace  ·  FirmPortalView (cabinet)  ·  Login     │
└───────────────┬─────────────────────────────────────────────┘
                │ SessionContext (identité + tenant actif + RBAC)
┌───────────────▼─────────────────────────────────────────────┐
│  authService (itsme®/password) · tenantWorkspace (pont)     │
└───────────────┬─────────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────────┐
│  dbStore — multi-tenant, isolé par tenant, persistant       │
│  (IndexedDB / localStorage / memory)                        │
│  • RBAC par rôle + permissions · deny-wins                  │
│  • Piste d'audit append-only, chaînée SHA-256               │
│  • Soft-delete (rétention légale 10 ans)                    │
└─────────────────────────────────────────────────────────────┘
```

- **Isolation par tenant** : toute lecture/écriture est filtrée par `tenantId` ; un accès croisé lève `CROSS_TENANT_ACCESS` et renvoie « introuvable » (pas de fuite d'existence).
- **RBAC** : `OWNER`, `MANAGER`, `ACCOUNTANT_ITAA`, `AUDITOR`, `EMPLOYEE` + matrice de permissions (deny-wins, permissions additionnelles par membership).
- **Piste d'audit** : chaque mutation financière est horodatée, attribuée, et son hash chaîne sur le précédent (`SHA-256(précédent ‖ séquence ‖ … ‖ avant ‖ après)`). `verifyChain()` détecte toute falsification.
- **Auto-déclaration** : le droit `vat:submit` du client est **retiré par défaut** quand un cabinet gère la TVA ; le comptable l'octroie via `member:grant_declaration`.

---

## 🌟 Modules (15)

### Espace Client
1. **Tableau de bord** — KPIs, impayés, TVA, encours.
2. **Ventes & Facturation** — devis, factures, notes de crédit, OGM, QR SEPA, recouvrement, PDF.
3. **Achats & Dépenses** — encodage, OCR, déductibilité (CIR 92), TVA récupérable.
4. **Hub Peppol 2026** — annuaire SMP, **envoi UBL 2.1** (validation Schematron + statut ACCEPTED/PENDING/REJECTED), VIES.
5. **TVA & Fiscalité** — grilles Intervat 00–72, listing annuel clients, Belcotax, ISOC, ATN, audit fiscal ; **dépôt TVA conditionné** par l'auto-déclaration.
6. **Banque & CODA** — import CODA/CAMT.053, rapprochement OGM, **auto-encodage** des dépenses (PCMN/TVA/déductibilité).
7. **Rapports** — P&L, cash-flow, vieillissement des créances, CA mensuel.
8. **Paie** — simulateur brut → net + coût employeur (ONSS, précompte progressif).
9. **Documents (GED)** — registre partagé avec le cabinet (métadonnées, par tenant).
10. **Piste d'audit** — journal immuable + intégrité de chaîne vérifiée en direct.

### Espace Cabinet (portail)
11. **Pilotage multi-dossiers** — KPIs par client, impayés, TVA nette.
12. **Rapports consolidés** — P&L agrégé + top clients par CA.
13. **Déclarations** — dépôt TVA Intervat + listing annuel par dossier.
14. **Stratégie fiscale** — simulateurs ISOC/dividendes/ATN/social par dossier.
15. **Recommandations fiscales** — moteur data-driven, priorisé et chiffré (recouvrement, ISOC, PLCI/VAPZ, franchise, déclaration).

### Règles belges intégrées
- **BCE/KBO** Modulo 97 · **OGM/VCS** Modulo 97 · **Peppol BIS 3.0 / EN 16931 / CIUS-BE** · **TVA** grilles 00–72 · **ISOC** 20 %/25 % · **Dividendes** VVPR-bis / réserve de liquidation / ordinaire · **ATN** CO₂ × 6/7 · **Cotisations** INASTI/RSVZ + PLCI/VAPZ · **ONSS/précompte**.

---

## 🔐 Modèle de sécurité

- Authentification **itsme®** (simulée, eIDAS) + mot de passe.
- **RBAC** par rôle + permissions granulaires (deny-wins).
- **Isolation multi-tenant** stricte (aucune lecture croisée).
- **Audit chaîné SHA-256** immuable, vérifiable.
- **Soft-delete** (rétention légale de 10 ans — Livre III C.D.E., art. 315 CIR 92).
- **Séparation client ↔ cabinet** : le client ne voit que son tenant ; le cabinet ne voit que ses mandats.

---

## 🛠️ Stack technique

- **Frontend** : React 19 + TypeScript + Vite + Tailwind CSS v4.
- **État & données** : store multi-tenant maison (IndexedDB/localStorage/memory) + session React.
- **Docs** : jsPDF + autotable (PDF), QRCode (SEPA), canvas-confetti.
- **Icons** : Lucide React.
- **Langues** : Français (BE), Nederlands (BE), English.

---

## 🚀 Installation & Lancement

```bash
npm install

# Développement
npm run dev

# Production
npm run build

# Tests
npm run test:run
```

> **Démo** : l'écran de connexion propose deux entrées — « Espace Client » (gérant Brabo) et « Espace Cabinet » (expert-comptable ITAA). Le store se peuple automatiquement (3 dossiers clients, mandats fiduciaires).

---

## 📄 Licence

Propriété de [Clixite](https://github.com/clixite). Développé pour les indépendants, PME et fiduciaires belges.
