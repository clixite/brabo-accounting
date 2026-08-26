import { useEffect, useState } from 'react';
import { Building2, Loader2, Sparkles } from 'lucide-react';
import { dbStore } from '../../server/services/dbStore';
import { useSession } from '../../state/SessionContext';
import type { Plan } from '../../server/types/db';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Badge } from '../ui/Badge';
import { validateBCE } from '../../utils/belgianAccounting';

interface FirmWizardProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Super Admin → "Nouvelle fiduciaire". Provisions a firm (identity ITAA + BCE),
 * its white-label brand, a subscription plan and its FIRM_ADMIN user in one
 * guided flow — the platform's core value: create a firm in ~2 minutes.
 */
export function FirmWizard({ open, onClose, onCreated }: FirmWizardProps) {
  const { user } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [itaaFirmNumber, setItaaFirmNumber] = useState('');
  const [bceDigits, setBceDigits] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [slug, setSlug] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#0ea5e9');
  const [planId, setPlanId] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');

  useEffect(() => {
    if (!open) return;
    dbStore.platform.listPlans().then((list) => {
      setPlans(list.filter((p) => p.isActive));
      if (list.length > 0 && !planId) setPlanId(list.find((p) => p.slug === 'pro')?.id ?? list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bceValid = validateBCE(bceDigits.replace(/\s/g, '')).isValid;

  const reset = () => {
    setName('');
    setItaaFirmNumber('');
    setBceDigits('');
    setVatNumber('');
    setCity('');
    setPostalCode('');
    setSlug('');
    setPrimaryColor('#0ea5e9');
    setPlanId('');
    setAdminEmail('');
    setAdminFirstName('');
    setAdminLastName('');
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!user) return;
    const digits = bceDigits.replace(/[^0-9]/g, '');
    if (!name.trim()) return setError('Le nom de la fiduciaire est requis.');
    if (digits.length !== 10 || !bceValid) return setError('Numéro BCE invalide (10 chiffres, modulo 97).');
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const email = adminEmail.trim() || `${cleanSlug}@brabo.app`;

    setBusy(true);
    try {
      const firm = await dbStore.platform.createFirm(
        {
          name: name.trim(),
          itaaFirmNumber: itaaFirmNumber.trim() || undefined,
          bceDigits: digits,
          vatNumber: vatNumber.trim() || `BE${digits}`,
          address: {
            street: '',
            number: '',
            postalCode: postalCode.trim(),
            city: city.trim(),
            countryCode: 'BE',
            country: 'Belgique',
          },
          brand: { slug: cleanSlug, primaryColor: primaryColor.trim() || undefined },
          status: 'active',
          planId: planId || undefined,
          createdByPlatformAdminId: user.id,
        },
        user.id,
      );

      if (planId) {
        await dbStore.platform.createFirmSubscription(
          { firmId: firm.id, planId, status: 'active', dossierCount: 0, overageDossiers: 0 },
          user.id,
        );
      }

      // Provision the FIRM_ADMIN user so the platform can impersonate the firm.
      let adminUser = await dbStore.users.findByEmail(email);
      if (!adminUser) {
        adminUser = await dbStore.users.create({
          email,
          emailVerified: true,
          firstName: adminFirstName.trim() || 'Admin',
          lastName: adminLastName.trim() || name.trim(),
          displayName: `${adminFirstName.trim() || 'Admin'} ${adminLastName.trim() || name.trim()}`.trim(),
          locale: 'fr-BE',
          authProvider: 'password',
          itaaMemberNumber: itaaFirmNumber.trim() || undefined,
          mfaEnabled: false,
          status: 'active',
        });
      }
      await dbStore.platform.createFirmMembership(
        {
          firmId: firm.id,
          userId: adminUser.id,
          role: 'FIRM_ADMIN',
          status: 'active',
          extraPermissions: [],
          deniedPermissions: [],
        },
        user.id,
      );

      reset();
      onClose();
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création de la fiduciaire.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="inline-flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[var(--accent-solid)]" /> Nouvelle fiduciaire
        </span>
      }
      description="Créez une firme ITAA, son white-label, son plan et son administrateur en une seule étape."
      width="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <Badge tone="info" uppercase dot>
            <Sparkles className="h-3 w-3" /> Provisioning complet
          </Badge>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
              Créer la fiduciaire
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de la fiduciaire" required className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Fiduciaire Flagey & Associés" />
          </Field>
          <Field label="N° agrément ITAA">
            <Input value={itaaFirmNumber} onChange={(e) => setItaaFirmNumber(e.target.value)} placeholder="11.234.567" />
          </Field>
          <Field label="Numéro BCE" required error={bceDigits && !bceValid ? 'BCE invalide (modulo 97)' : undefined}>
            <Input value={bceDigits} onChange={(e) => setBceDigits(e.target.value)} placeholder="0470.123.456" />
          </Field>
          <Field label="Numéro TVA">
            <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="BE0470123456" />
          </Field>
          <Field label="Ville">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bruxelles" />
          </Field>
          <Field label="Code postal">
            <Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="1050" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Slug (white-label)" hint="sous-domaine">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="flagey" />
          </Field>
          <Field label="Couleur de marque">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-[var(--control-height)] w-10 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)]"
              />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
            </div>
          </Field>
          <Field label="Plan d'abonnement">
            <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Aucun (essai)</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.priceMonthlyEur === 0 ? 'Gratuit' : `${p.priceMonthlyEur} €/mois`}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="pt-3 border-t border-[var(--border-subtle)]">
          <div className="text-[length:var(--text-2xs)] uppercase tracking-wide text-[var(--text-tertiary)] mb-2">
            Administrateur de la firme (invitation)
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Email" className="sm:col-span-1">
              <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@firme.be" />
            </Field>
            <Field label="Prénom">
              <Input value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} placeholder="Marie" />
            </Field>
            <Field label="Nom">
              <Input value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} placeholder="Flagey" />
            </Field>
          </div>
        </div>

        {error && (
          <p className="text-[length:var(--text-xs)] text-[var(--state-critical-text)] bg-[var(--state-critical-bg)] border border-[var(--state-critical-border)] rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
