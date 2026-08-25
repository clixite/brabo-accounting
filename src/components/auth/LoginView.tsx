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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center px-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[42rem] h-[42rem] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[30rem] h-[30rem] rounded-full bg-red-600/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl">
        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-red-600 text-white font-black text-3xl shadow-xl shadow-amber-500/20 ring-2 ring-amber-400/30 mb-4">
            B
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            BRABO <span className="text-amber-400">Accounting</span>
          </h1>
          <p className="mt-2 text-slate-400 max-w-md text-sm">
            Comptabilité belge intelligente & hub Peppol B2B — un espace sécurisé pour
            l'entreprise, un poste de pilotage pour le cabinet.
          </p>
        </div>

        {/* Workspace selector */}
        <div className="grid sm:grid-cols-2 gap-4">
          <button
            onClick={() => run('client')}
            disabled={busy !== null}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-left transition hover:border-amber-500/50 hover:bg-slate-900 shadow-lg"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/25">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-slate-200">Espace Client</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Encodage auto, facturation, dépenses, TVA. Connexion en tant que gérant
              d'entreprise (Brabo Digital Solutions).
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
              {busy === 'client' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Entrer
            </span>
          </button>

          <button
            onClick={() => run('cabinet')}
            disabled={busy !== null}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-left transition hover:border-emerald-500/50 hover:bg-slate-900 shadow-lg"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                <Landmark className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-slate-200">Espace Cabinet</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Pilotage multi-dossiers, stratégie fiscale, déclarations et droits
              d'accès clients. Connexion en tant qu'expert-comptable ITAA.
            </p>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              {busy === 'cabinet' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              Entrer
            </span>
          </button>
        </div>

        {/* itsme */}
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="flex items-center gap-3">
            <Fingerprint className="h-5 w-5 text-sky-400" />
            <div>
              <div className="text-sm font-semibold text-slate-200">Connexion itsme®</div>
              <div className="text-[11px] text-slate-400">Identité numérique belge (eIDAS — simulation démo)</div>
            </div>
          </div>
          <button
            onClick={() => run('itsme')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30 text-xs font-semibold hover:bg-sky-500/25 transition"
          >
            {busy === 'itsme' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
            S'identifier
          </button>
        </div>

        {error && (
          <p className="mt-4 text-center text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* Trust footer */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Isolation multi-tenant par tenant
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-amber-400" /> RBAC par rôle & mandat ITAA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Fingerprint className="h-3.5 w-3.5 text-sky-400" /> Piste d'audit chaînée SHA-256
          </span>
        </div>
      </div>
    </div>
  );
}
