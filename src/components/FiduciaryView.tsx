import React, { useState } from 'react';
import { 
  UserCheck, 
  ShieldCheck, 
  Download, 
  Send, 
  MessageSquare, 
  CheckCircle2,
  Scale
} from 'lucide-react';
import type { CompanyProfile, Invoice, PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import { exportFiduciaryPackage, downloadFiduciaryPackage } from '../services/fiduciaryBridge';
import type { FiduciaryFormat } from '../services/fiduciaryBridge';
import confetti from 'canvas-confetti';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { cn } from './ui/cn';

interface FiduciaryViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseExpense[];
  lang: Language;
}

export const FiduciaryView: React.FC<FiduciaryViewProps> = ({
  company,
  invoices,
  purchases,
  lang,
}) => {
  const t = translations[lang].fiduciary;
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [messages, setMessages] = useState<{
    id: string;
    sender: 'accountant' | 'client';
    senderName: string;
    text: string;
    time: string;
  }[]>([
    {
      id: 'm-1',
      sender: 'accountant',
      senderName: 'Fiduciaire Flagey (Marc Vandevelde, ITAA)',
      text: 'Bonjour ! J\'ai bien validé vos écritures de ventes de janvier 2026. N\'oubliez pas d\'imputer le ticket de restaurant Le Cirio en 50% déductible.',
      time: 'Hier, 16:45',
    },
    {
      id: 'm-2',
      sender: 'client',
      senderName: 'Vous (Brabo Solutions)',
      text: 'Bonjour Marc, c\'est fait ! Le compte PCMN 615100 a été correctement renseigné avec la TVA non récupérable.',
      time: 'Aujourd\'hui, 09:12',
    }
  ]);
  const [newMessage, setNewMessage] = useState('');

  const handleExportSoftware = (format: 'bob' | 'winbooks' | 'horus' | 'exact' | 'full') => {
    const formatMap: Record<typeof format, FiduciaryFormat> = {
      bob: 'sage_bob50',
      winbooks: 'winbooks',
      horus: 'horus',
      exact: 'exact_online',
      full: 'full_bundle',
    };

    try {
      const pkg = exportFiduciaryPackage(invoices, purchases, company, formatMap[format], {
        fiscalYear: new Date().getFullYear(),
        includeMasterData: true,
      });

      downloadFiduciaryPackage(pkg);
      setExportSuccess(`Dossier fiduciaire ${pkg.files.length} fichier(s) généré(s) et vérifié(s) (partie double équilibrée) !`);
      confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      setExportSuccess(`⚠️ Export bloqué : ${message}`);
    }
    setTimeout(() => setExportSuccess(null), 5000);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const msg = {
      id: 'm-' + Date.now(),
      sender: 'client' as const,
      senderName: 'Vous',
      text: newMessage,
      time: 'À l\'instant',
    };

    setMessages([...messages, msg]);
    setNewMessage('');
  };

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge tone="info">Institut des Conseillers Fiscaux et Experts-Comptables (ITAA)</Badge>
          </div>
          <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[var(--accent-solid)]" />
            {t.title}
          </h1>
          <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">
            {t.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[length:var(--text-xs)] text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-[var(--state-positive-text)]" />
            <span>N° Agrément ITAA : <strong className="text-[var(--accent-solid)] font-mono tnum">{company.fiduciaryItaaNumber}</strong></span>
          </div>
        </div>
      </div>

      {/* Fiduciary Profile Card */}
      <Card>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 shrink-0 rounded-[var(--radius-lg)] bg-[var(--state-info-bg)] border border-[var(--state-info-border)] flex items-center justify-center text-[var(--state-info-text)] font-semibold text-[length:var(--text-lg)]">
              FF
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-[length:var(--text-sm)] font-semibold text-[var(--text-primary)]">{company.fiduciaryName}</h2>
                <Badge tone="positive" dot>Connecté en direct</Badge>
              </div>
              <p className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                Contact référent : <strong className="font-medium text-[var(--text-secondary)]">expert@fiduciaire-flagey.be</strong> · Révision trimestrielle TVA &amp; Clôture annuelle
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => handleExportSoftware('bob')}>
              {t.exportBob}
            </Button>
            <Button variant="secondary" onClick={() => handleExportSoftware('winbooks')}>
              {t.exportWinbooks}
            </Button>
            <Button variant="primary" onClick={() => handleExportSoftware('horus')}>
              {t.exportHorus}
            </Button>
            <Button variant="secondary" onClick={() => handleExportSoftware('full')}>
              Bundle complet (tous formats)
            </Button>
          </div>
        </div>
      </Card>

      {exportSuccess && (
        <div className="flex items-center gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] text-[length:var(--text-xs)] text-[var(--state-positive-text)]">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{exportSuccess}</span>
        </div>
      )}

      {/* Collaboration Chat & Document Exchange */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Chat / Queries */}
        <Card flush className="lg:col-span-2 flex flex-col h-[460px]">
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[var(--accent-solid)]" />
                Fil de discussion direct &amp; Questions Pièces Comptables
              </span>
            }
            actions={<Badge tone="positive" dot>En ligne</Badge>}
          />

          <div className="flex-1 overflow-y-auto space-y-3 p-4">
            {messages.map((m) => {
              const isClient = m.sender === 'client';
              return (
                <div key={m.id} className={cn('flex flex-col', isClient ? 'items-end' : 'items-start')}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[length:var(--text-2xs)] font-semibold text-[var(--text-secondary)]">{m.senderName}</span>
                    <span className="text-[length:var(--text-2xs)] text-[var(--text-disabled)]">{m.time}</span>
                  </div>
                  <div
                    className={cn(
                      'p-3 max-w-md text-[length:var(--text-xs)] leading-relaxed rounded-[var(--radius-lg)]',
                      isClient
                        ? 'bg-[var(--accent-solid)] text-[var(--accent-text)] font-medium rounded-tr-none'
                        : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-tl-none',
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2 p-4 border-t border-[var(--border-subtle)]">
            <Input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Poser une question à votre expert-comptable ITAA..."
              className="flex-1"
            />
            <Button type="submit" variant="primary" className="shrink-0">
              <Send className="w-3.5 h-3.5" />
              Envoyer
            </Button>
          </form>
        </Card>

        {/* Fiduciary Tools & Verification Checklist */}
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[var(--state-positive-text)]" />
                Checklist Clôture Trimestrielle Q1
              </span>
            }
          />
          <CardBody className="space-y-4">
            <div className="space-y-1.5">
              {[
                'Toutes les factures de ventes transmises en Peppol UBL',
                'Dépenses catégorisées selon le PCMN belge',
                'Extraits CODA réconciliés par OGM Modulo 97',
                'Calcul prévisionnel grille 71 TVA validé',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 p-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-[length:var(--text-xs)] text-[var(--text-secondary)]"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-[var(--state-positive-text)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[var(--border-subtle)] space-y-2">
              <Button variant="secondary" onClick={() => handleExportSoftware('exact')} className="w-full">
                <Download className="w-3.5 h-3.5 text-[var(--accent-solid)]" />
                Exporter Exact Online (CSV/XML)
              </Button>

              <Button variant="secondary" onClick={() => handleExportSoftware('full')} className="w-full">
                <Scale className="w-3.5 h-3.5 text-[var(--state-positive-text)]" />
                Dossier Fiduciaire Complet (Vérifié Partie Double)
              </Button>
            </div>
          </CardBody>
        </Card>

      </div>

    </div>
  );
};
