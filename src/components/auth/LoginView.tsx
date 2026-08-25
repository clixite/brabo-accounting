import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Fingerprint,
  Landmark,
  Loader2,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useSession } from '../../state/SessionContext';
import { Button } from '../ui/Button';

/**
 * Authentication & workspace selector.
 * Two clearly separated entrances: the client workspace and the cabinet
 * (firm) portal — the heart of the "secure, well separated" requirement.
 */
export function LoginView() {
  const { loginDemo, loginItsme } = useSession();
  const [busy, setBusy] = useState<'client' | 'cabinet' | 'itsme' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'client' | 'cabinet' | 'itsme') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'itsme') await loginItsme();
      else await loginDemo(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion.');
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-[var(--radius-full)] bg-[var(--accent-soft)] blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] rounded-[var(--radius-full)] bg-[var(--state-critical-bg)] blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="flex items-center justify-center w-16 h-16 rounded-[var(--radius-lg)] bg-[var(--accent-solid)] text-[var(--accent-text)] font-black text-[length:var(--text-3xl)] shadow-[var(--shadow-popover)] ring-2 ring-[var(--accent-soft-border)] mb-4">
            B
          </div>
          <h1 className="text-[length:var(--text-3xl)] font-extrabold tracking-tight text-[var(--text-primary)]">
            BRABO <span className="text-[var(--accent-solid)]">Accounting</span>
          </h1>
          <p className="mt-2 text-[var(--text-tertiary)] max-w-md text-[length:var(--text-sm)]">
            Comptabilité belge intelligente & hub Peppol B2B — un espace sécurisé pour
            l'entreprise, un poste de pilotage pour le cabinet.
          </p>
        </div>

        {/* Workspace selector */}
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => run('client')}
            disabled={busy !== null}
            className="group relative rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-left transition-colors hover:border-[var(--accent-soft-border)] hover:bg-[var(--bg-hover)] shadow-[var(--shadow)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-soft)] text-[var(--accent-solid)] border border-[var(--accent-soft-border)]">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">Espace Client</span>
            </div>
            <p className="text-[length:var(--text-xs)] text-[var(--text-tertiary)] leading-relaxed mb-4">
              Encodage auto, facturation, dépenses, TVA. Connexion en tant que gérant
              d'entreprise (Brabo Digital Solutions).
            </p>
            <span className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] font-semibold text-[var(--accent-solid)]">
              {busy === 'client' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Entrer
            </span>
          </button>

          <button
            onClick={() => run('cabinet')}
            disabled={busy !== null}
            className="group relative rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 text-left transition-colors hover:border-[var(--state-positive-border)] hover:bg-[var(--bg-hover)] shadow-[var(--shadow)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--state-positive-bg)] text-[var(--state-positive-text)] border border-[var(--state-positive-border)]">
                <Landmark className="h-5 w-5" />
              </span>
              <span className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">Espace Cabinet</span>
            </div>
            <p className="text-[length:var(--text-xs)] text-[var(--text-tertiary)] leading-relaxed mb-4">
              Pilotage multi-dossiers, stratégie fiscale, déclarations et droits
              d'accès clients. Connexion en tant qu'expert-comptable ITAA.
            </p>
            <span className="inline-flex items-center gap-1.5 text-[length:var(--text-xs)] font-semibold text-[var(--state-positive-text)]">
              {busy === 'cabinet' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Entrer
            </span>
          </button>
        </div>

        {/* itsme */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-5 w-5 text-[var(--state-info-text)]" />
            <div>
              <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">Connexion itsme®</div>
              <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Identité numérique belge (eIDAS — simulation démo)</div>
            </div>
          </div>
          <Button variant="secondary" onClick={() => run('itsme')} disabled={busy !== null}>
            {busy === 'itsme' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
            S'identifier
          </Button>
        </div>

        {error && (
          <p className="mt-4 text-center text-[length:var(--text-xs)] text-[var(--state-critical-text)] bg-[var(--state-critical-bg)] border border-[var(--state-critical-border)] rounded-[var(--radius-md)] px-4 py-2">
            {error}
          </p>
        )}

        {/* Trust footer */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[length:var(--text-2xs)] text-[var(--text-disabled)]">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[var(--state-positive-text)]" /> Isolation multi-tenant par tenant
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-[var(--accent-solid)]" /> RBAC par rôle & mandat ITAA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5 text-[var(--state-info-text)]" /> Piste d'audit chaînée SHA-256
          </span>
        </div>
      </div>
    </div>
  );
}
