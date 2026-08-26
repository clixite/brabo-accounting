# BRABO — Plan de remédiation / amélioration (4 profils)

> Résultat de la campagne E2E Playwright sur les 4 profils + analyse du code.
> Suite exécutée : `npm run test:e2e` (4 specs, chromium). **4/4 échouent** sur l'état actuel.

---

## 1. Constat — ce qui ne va pas

### D1. Deux des quatre profils n'existent pas côté authentification (CRITIQUE)
Le sélecteur d'espace (`LoginView`) ne propose que **Super Admin**, **Espace Client**
(gérant = OWNER) et **Espace Cabinet** (expert-comptable = FIRM_ADMIN). Les rôles
`SENIOR`/`JUNIOR`/`BOOKKEEPER`/`PARTNER`/`READONLY` (firme) et `EMPLOYEE`/`MANAGER`
(client) sont **déclarés dans le modèle de données mais non seedés ni joignables**.

- **Impact** : impossible de tester/parcourir les situations réelles « membre
  fiduciaire » et « client membre » ; le RBAC 3 niveaux est inatteignable en démo.
- **Preuve E2E** : `login-membre-fiduciaire` et `login-client-membre` introuvables
  (timeout Playwright sur les 4 profils).

### D2. Le workspace client n'applique pas le RBAC à l'interface (CRITIQUE)
`ClientWorkspace` rend **tous les onglets** et **toutes les actions** quel que soit
le rôle ; seul le write-through vers le store est limité à `OWNER`/`MANAGER`. Un
employé (ou un inspecteur cabinet) verrait donc Banque, TVA, Audit, Paramètres et
pourrait cliquer « Nouvelle facture / Supprimer » (mutation locale trompeuse).

- **Impact** : fuite de fonctions sensibles, non-respect du moindre privilège,
  expérience incohérente (boutons cliquables sans effet persistant).
- **Preuve** : la navigation (`Sidebar`) expose 12 onglets sans filtre de permission.

### D3. Le portail cabinet ignore le rôle de firme (MAJEUR)
`FirmPortalView` traite tout membre comme un admin : aucun panneau « Équipe »,
aucune distinction `FIRM_ADMIN` vs `SENIOR`, le toggle de déclaration TVA client
est visible pour tous.

- **Impact** : un collaborateur non-admin pourrait (visuellement) piloter les
  droits d'accès clients ; pas de gestion d'équipe pour l'admin fiduciaire.

### D4. Inspection cabinet non read-only (MAJEUR)
« Espace client » ouvert depuis le cabinet (`enterClientWorkspace`) ne force pas la
lecture : les vues d'écriture restent affichées (mutations locales possibles).

### D5. Données non filtrées par rôle dans le workspace client (MAJEUR)
`ClientWorkspace` charge `INITIAL_*` (factures, achats, transactions, profil) dans
l'état React et les passe à **toutes** les vues, sans filtrage par `permissions`.

---

## 2. Plan de remédiation (ordre d'implémentation)

| # | Action | Fichiers | Corrige |
|---|--------|----------|---------|
| 1 | Seed des 2 profils manquants (firme `SENIOR`, client `EMPLOYEE`) + identités idempotentes | `src/server/services/demoBootstrap.ts` | D1 |
| 2 | Exposer `firmRole` dans la session + `loginDemo(profile)` 4 profils | `src/state/SessionContext.tsx` | D1 |
| 3 | Sélecteur de workspace : 4 cartes profils (+ Super Admin conservé) | `src/components/auth/LoginView.tsx` | D1 |
| 4 | Filtrage de la navigation par permission + onglet par défaut adapté | `src/ClientWorkspace.tsx`, `src/components/shell/AppShell.tsx`, `src/components/shell/Sidebar.tsx` | D2, D5 |
| 5 | Garde des actions d'écriture (deny + toast) et `readOnly` sur Facturation/Dépenses | `src/ClientWorkspace.tsx`, `src/components/InvoicingView.tsx`, `src/components/ExpensesView.tsx` | D2, D4, D5 |
| 6 | Portail cabinet : badge de rôle firme, panneau « Équipe » (admin seul), toggle déclaration réservé à l'admin | `src/components/portal/FirmPortalView.tsx`, `src/components/portal/FirmTeamPanel.tsx`, `src/components/portal/SessionBar.tsx` | D3 |
| 7 | `data-testid` stables pour les E2E (login, nav, rôle, équipe, toggle) | divers | testabilité |
| 8 | Re-exécuter `npm run test:e2e` → vert ; `npm run build` / lint / tests unitaires verts | — | validation |

---

## 3. Définition du succès (acceptation)

1. Les 4 profils sont joignables depuis le sélecteur et atterrissent sur le bon espace.
2. Le **client membre (EMPLOYEE)** ne voit que Facturation (lecture) + Dépenses ;
   Banque, TVA, Audit, Paramètres, GED sont masqués ; aucune écriture/suppression.
3. L'**admin fiduciaire** voit le panneau « Équipe » et peut basculer la déclaration
   TVA d'un client ; le **membre fiduciaire** voit les dossiers mais ni l'équipe ni
   le toggle.
4. Le **client admin (OWNER)** conserve l'espace complet (encodage, TVA, paramètres).
5. `npm run test:e2e` passe (4/4), et la chaîne d'audit / l'isolation multi-tenant
   restent intactes (`npm run test:run`).
