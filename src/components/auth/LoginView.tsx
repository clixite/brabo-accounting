import { useState } from 'react';
import {
  ArrowRight,
  Building2,
  Fingerprint,
  Landmark,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useSession } from '../../state/SessionContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { validateBCE } from '../../utils/belgianAccounting';

/**
 * Authentication & workspace selector.
 * Two clearly separated entrances: the client workspace and the cabinet
 * (firm) portal — the heart of the "secure, well separated" requirement.
 */
export function LoginView() {
  const { loginDemo, loginItsme, loginWithPassword, registerWithPassword } = useSession();
  const [busy, setBusy] = useState<'client' | 'cabinet' | 'itsme' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [bce, setBce] = useState('');

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

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError('Email et mot de passe requis.');
      return;
    }
    if (mode === 'register') {
      if (password.length < 10) {
        setError('Le mot de passe doit contenir au moins 10 caractères.');
        return;
      }
      if (password !== confirm) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }
      if (!validateBCE(bce.replace(/\s/g, '')).isValid) {
        setError('Numéro BCE invalide (vérifiez le numéro à 10 chiffres).');
        return;
      }
    }
    setBusy('password');
    try {
      if (mode === 'login') await loginWithPassword(cleanEmail, password);
      else
        await registerWithPassword({
          email: cleanEmail,
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          company: {
            name: companyName.trim() || 'Nouvelle société',
            bceNumber: bce.replace(/\s/g, ''),
          },
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de connexion.');
      setBusy(null);
    }
  };

  const switchMode = (m: 'login' | 'register') => {
    setMode(m);
    setError(null);
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

        {/* Password auth */}
        <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <button
            type="button"
            onClick={() => setShowForm((s) => !s)}
            className="w-full flex items-center justify-between gap-4 p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-[var(--state-info-text)]" />
              <div>
                <div className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">
                  Connexion par email
                </div>
                <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                  Compte BRABO sécurisé (base PostgreSQL sur le serveur)
                </div>
              </div>
            </div>
            <span className="text-[length:var(--text-xs)] text-[var(--accent-solid)] font-semibold">
              {showForm ? 'Masquer' : 'Ouvrir'}
            </span>
          </button>

          {showForm && (
            <form onSubmit={submitPassword} className="border-t border-[var(--border-subtle)] p-4 space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`flex-1 h-[var(--control-height)] rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-semibold transition-colors ${
                    mode === 'login'
                      ? 'bg-[var(--accent-solid)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className={`flex-1 h-[var(--control-height)] rounded-[var(--radius-md)] text-[length:var(--text-xs)] font-semibold transition-colors ${
                    mode === 'register'
                      ? 'bg-[var(--accent-solid)] text-[var(--accent-text)]'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  Créer un compte
                </button>
              </div>

              {mode === 'register' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <Input
                      placeholder="Prénom"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="pl-7"
                    />
                    <UserPlus className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  </div>
                  <Input
                    placeholder="Nom"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Nom de la société"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                  <Input
                    className="col-span-2"
                    placeholder="Numéro BCE (ex. 0789.456.175)"
                    value={bce}
                    onChange={(e) => setBce(e.target.value)}
                  />
                </div>
              )}

              <div className="relative">
                <Mail className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-7"
                  autoComplete="email"
                />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                <Input
                  type="password"
                  placeholder={mode === 'register' ? 'Mot de passe (min. 10 caractères)' : 'Mot de passe'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-7"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
              {mode === 'register' && (
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  <Input
                    type="password"
                    placeholder="Confirmer le mot de passe"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pl-7"
                    autoComplete="new-password"
                  />
                </div>
              )}

              <Button type="submit" disabled={busy === 'password'} className="w-full">
                {busy === 'password' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : mode === 'login' ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <UserPlus className="h-3.5 w-3.5" />
                )}
                {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
              </Button>
            </form>
          )}
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
