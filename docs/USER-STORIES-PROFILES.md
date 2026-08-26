# BRABO — User stories des 4 profils (situations réelles)

> Source de vérité pour les tests E2E Playwright et le plan de remédiation.
> Les 4 profils correspondent au RBAC 3 niveaux du socle SaaS :

| # | Profil | Rôle métier | Rôle(s) technique(s) |
|---|--------|-------------|----------------------|
| 1 | **Admin fiduciaire** | Administrateur du cabinet (expert-comptable ITAA) | `FIRM_ADMIN` + `ACCOUNTANT_ITAA` |
| 2 | **Membre fiduciaire** | Collaborateur du cabinet (comptable senior/junior) | `SENIOR` (ou `JUNIOR`/`BOOKKEEPER`/`PARTNER`/`READONLY`) + `ACCOUNTANT_ITAA` |
| 3 | **Client Admin** | Gérant d'entreprise | `OWNER` |
| 4 | **Client membre** | Employé de l'entreprise cliente | `EMPLOYEE` |

---

## 1. Admin fiduciaire (FIRM_ADMIN)

**Persona** : Marie Flagey, expert-comptable certifiée ITAA, administratrice de la
« Fiduciaire Flagey & Associés ». Elle pilote tous les dossiers clients et gère
l'équipe du cabinet.

### US-1.1 — Piloter l'ensemble des dossiers clients
**En tant qu'** admin fiduciaire, **je veux** voir le tableau de bord consolidé de
tous mes dossiers clients (CA, TVA nette, impayés, nombre de pièces), **afin de**
prioriser mon travail sans ouvrir chaque dossier.

- **Critères d'acceptation**
  - Le portail liste les 3 tenants rattachés à la firme (Brabo Digital Solutions, Atelier Bois & Design, Antwerp Logistics Hub).
  - Les KPI agrégés (clients actifs, CA, TVA nette, impayés) sont corrects.
  - Le P&L consolidé et le classement « Top clients par CA » sont affichés.

### US-1.2 — Gérer l'équipe du cabinet
**En tant qu'** admin fiduciaire, **je veux** voir la liste des membres de la firme,
leur rôle (`FIRM_ADMIN`, `PARTNER`, `SENIOR`, `JUNIOR`, `BOOKKEEPER`, `READONLY`) et
leur statut, **afin de** maîtriser qui peut accéder aux dossiers.

- **Critères d'acceptation**
  - L'admin voit un panneau « Équipe » listant les membres et leurs rôles.
  - Ce panneau est **réservé à l'admin fiduciaire** (non visible pour un membre non-admin).

### US-1.3 — Autoriser / bloquer la déclaration TVA autonome d'un client
**En tant qu'** admin fiduciaire, **je veux** accorder ou retirer le droit de
dépôt TVA autonome (`vat:submit`) à un client, **afin de** garder la main sur le
dépôt Intervat quand le cabinet s'en charge.

- **Critères d'acceptation**
  - Le bouton « Déclaration client active / bloquée » bascule le droit sur le tenant visé.
  - Le droit est retiré par défaut ; l'octroi réactive `vat:submit` côté client.
  - L'action est journalisée dans la piste d'audit (PERMISSION_CHANGE).

### US-1.4 — Ouvrir l'espace client d'un dossier (inspection)
**En tant qu'** admin fiduciaire, **je veux** ouvrir l'espace client complet d'un
dossier pour inspecter les encodages, **afin de** vérifier le travail du client
sans changer d'identité.

- **Critères d'acceptation**
  - Un bandeau « Inspection cabinet » + bouton « Retour au cabinet » s'affichent.
  - L'admin ne peut pas modifier/persister les données du client via cette vue (lecture).

---

## 2. Membre fiduciaire (SENIOR / collaborateur)

**Persona** : un comptable senior de la fiduciaire, membre de l'équipe mais **non
administrateur**. Il prépare et révise des dossiers, mais ne gère ni l'équipe ni
la facturation de la firme.

### US-2.1 — Consulter les dossiers qui lui sont confiés
**En tant que** membre fiduciaire, **je veux** consulter les dossiers clients et
leurs KPI, **afin de** préparer les déclarations et les révisions.

- **Critères d'acceptation**
  - Le membre voit les dossiers (lecture des KPI, factures, achats).
  - Il voit son rôle de firme (`SENIOR`) dans l'en-tête.

### US-2.2 — Ne pas accéder à l'administration de la firme
**En tant que** membre fiduciaire non-admin, **je veux** ne **pas** voir les
actions d'administration (gestion de l'équipe, facturation, modification des
rôles), **afin que** la séparation des privilèges soit respectée.

- **Critères d'acceptation**
  - Le panneau « Équipe » et les actions d'administration sont **absents**.
  - Toute tentative d'accès est refusée (pas de bouton, pas d'action).

### US-2.3 — Préparer sans déposer à la place de l'admin
**En tant que** membre fiduciaire, **je veux** préparer les grilles TVA et
simulations fiscales d'un dossier, **afin de** soumettre le travail à l'admin
pour validation et dépôt final.

- **Critères d'acceptation**
  - Les panels de déclaration/stratégie/recommandations sont consultables.
  - Le membre ne peut pas modifier les droits d'accès clients (pas de toggle si sa firme-role ne l'autorise pas).

---

## 3. Client Admin (OWNER / gérant)

**Persona** : Nicolas Simon, gérant de « Brabo Digital Solutions ». Il encode,
facture, suit sa trésorerie et sa TVA ; le cabinet dépose sa TVA tant qu'il n'a
pas reçu le droit de dépôt autonome.

### US-3.1 — Encodeur sa facturation et ses dépenses
**En tant que** gérant, **je veux** créer des factures, devis, notes de crédit et
encoder mes dépenses (OCR), **afin de** tenir ma comptabilité au jour le jour.

- **Critères d'acceptation**
  - Création/modification/suppression de factures et dépenses disponibles.
  - L'encodage est persisté (write-through vers le store du tenant).

### US-3.2 — Suivre sa TVA et déposer si autorisé
**En tant que** gérant, **je veux** voir mes grilles Intervat et déposer ma TVA
**seulement si** le cabinet m'y autorise, **afin de** respecter le mandat de
déclaration.

- **Critères d'acceptation**
  - Le badge « TVA déposée par le cabinet » s'affiche tant que le droit est retiré.
  - Le dépôt est actif uniquement après octroi par le cabinet (`canSelfDeclare`).
  - La suppression du droit par le cabinet désactive le dépôt côté client.

### US-3.3 — Gérer sa société et ses accès
**En tant que** gérant, **je veux** paramétrer ma société, la GED, la paie, les
rapports et la piste d'audit, **afin de** piloter mon entreprise.

- **Critères d'acceptation**
  - Accès aux onglets Rapports, Banque/CODA, Peppol, Documents, Paie, Paramètres, Audit.

### US-3.4 — Isoler ses données (aucune fuite inter-tenant)
**En tant que** gérant, **je veux** n'accéder **qu'à** mon propre tenant, **afin
que** les données des autres clients ne soient jamais visibles.

- **Critères d'acceptation**
  - Le workspace ne montre que le tenant de l'utilisateur connecté.
  - Aucun accès croisé (`CROSS_TENANT_ACCESS` → « introuvable »).

---

## 4. Client membre (EMPLOYEE)

**Persona** : un employé de « Brabo Digital Solutions ». Il déclare ses notes de
frais et consulte les factures, mais ne doit ni gérer la société ni voir les
données sensibles (audit, banque, TVA, paramètres).

### US-4.1 — Déclarer ses notes de frais
**En tant qu'** employé, **je veux** encoder mes dépenses (notes de frais),
**afin de** les soumettre au gérant/comptable pour validation.

- **Critères d'acceptation**
  - L'employé peut créer une dépense (droit `expense:write`).
  - Il ne peut pas supprimer les dépenses des autres ni approuver.

### US-4.2 — Consulter les factures (lecture)
**En tant qu'** employé, **je veux** consulter les factures clients, **afin de**
répondre aux clients sans devoir demander le gérant.

- **Critères d'acceptation**
  - L'employé voit les factures (droit `invoice:read`).

### US-4.3 — Ne pas accéder aux fonctions sensibles
**En tant qu'** employé, **je veux** ne **pas** voir les onglets/fonctions
Banque, TVA, Audit, Paramètres, GED ni modifier/supprimer des données,
**afin de** respecter le principe du moindre privilège.

- **Critères d'acceptation**
  - La navigation ne montre que les onglets autorisés par ses permissions.
  - Les actions d'écriture/suppression sont désactivées (ou refusées avec message).

---

## Matrice des permissions (rappel)

| Permission | OWNER (Client Admin) | EMPLOYEE (Client membre) | ACCOUNTANT_ITAA (firme) |
|---|---|---|---|
| `tenant:read/update/delete` | ✅ read/update/delete | ✅ read | ✅ read |
| `invoice:read/write/delete/send_peppol` | ✅ tous | ✅ read | ✅ read/write/send |
| `expense:read/write/delete/approve` | ✅ tous | ✅ read/write | ✅ read/write/approve |
| `bank:read/write/reconcile` | ✅ tous | ❌ | ✅ tous |
| `vat:read/submit` | ✅ read (+ submit si accordé) | ❌ | ✅ tous |
| `audit:read` | ✅ | ❌ | ✅ |
| `document:read/write` | ✅ | ❌ | ✅ |
| `fiduciary:read/manage` | ✅ | ❌ | ✅ |
| `member:read/manage/grant_declaration` | ✅ | ❌ | ✅ (grant) |

> Règle : **deny-wins** — un droit retiré via `deniedPermissions` (ex. `vat:submit`
> du gérant) l'emporte toujours sur les permissions du rôle.
