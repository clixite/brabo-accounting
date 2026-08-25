import React from 'react';
import { 
  X, 
  ShieldCheck, 
  AlertTriangle, 
  Info, 
  CheckCircle2, 
  ClipboardCheck
} from 'lucide-react';
import type { ValidationReport, ValidationIssue } from '../services/schematronValidator';

interface SchematronReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ValidationReport | null;
}

const severityStyles: Record<ValidationIssue['severity'], string> = {
  ERROR: 'bg-[var(--state-critical-bg)] text-[var(--state-critical-text)] border-[var(--state-critical-border)]',
  WARNING: 'bg-[var(--accent-soft)] text-[var(--state-warning-text)] border-[var(--state-warning-border)]',
  INFO: 'bg-blue-500/10 text-[var(--state-info-text)] border-blue-500/30',
};

const severityIcon = (severity: ValidationIssue['severity']) => {
  if (severity === 'ERROR') return <AlertTriangle className="w-4 h-4 text-[var(--state-critical-text)]" />;
  if (severity === 'WARNING') return <Info className="w-4 h-4 text-[var(--accent-solid)]" />;
  return <Info className="w-4 h-4 text-[var(--state-info-text)]" />;
};

export const SchematronReportModal: React.FC<SchematronReportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!isOpen || !report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] max-w-3xl w-full shadow-[var(--shadow-modal)] overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-[var(--text-primary)]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-hover)]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[var(--state-positive-bg)] text-[var(--state-positive-text)] rounded-[var(--radius-md)] border border-[var(--state-positive-border)]">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-[var(--text-primary)]">Rapport de Conformité Schematron</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  report.isValid 
                    ? 'bg-[var(--state-positive-bg)] text-[var(--state-positive-text)] border border-[var(--state-positive-border)]' 
                    : 'bg-[var(--state-critical-bg)] text-[var(--state-critical-text)] border border-[var(--state-critical-border)]'
                }`}>
                  {report.isValid ? 'EN 16931 CONFORME' : 'NON CONFORME'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                Facture {report.invoiceNumber} • {report.rulesEvaluated} règles évaluées • EN 16931 + CIUS-BE + Peppol BIS 3.0
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-[var(--radius-md)] hover:bg-[var(--bg-subtle)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs">
          
          {/* Score summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[var(--bg-subtle)] p-3 rounded-[var(--radius-md)] border border-[var(--border-default)] text-center">
              <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-bold">Score de conformité</span>
              <span className={`text-2xl font-mono font-black ${
                report.summary.complianceScore >= 90 ? 'text-[var(--state-positive-text)]' : report.summary.complianceScore >= 70 ? 'text-[var(--accent-solid)]' : 'text-[var(--state-critical-text)]'
              }`}>
                {report.summary.complianceScore}%
              </span>
            </div>
            <div className="bg-[var(--bg-subtle)] p-3 rounded-[var(--radius-md)] border border-[var(--border-default)] text-center">
              <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-bold">Erreurs bloquantes</span>
              <span className="text-2xl font-mono font-black text-[var(--state-critical-text)]">{report.summary.errorCount}</span>
            </div>
            <div className="bg-[var(--bg-subtle)] p-3 rounded-[var(--radius-md)] border border-[var(--border-default)] text-center">
              <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-bold">Avertissements</span>
              <span className="text-2xl font-mono font-black text-[var(--accent-solid)]">{report.summary.warningCount}</span>
            </div>
            <div className="bg-[var(--bg-subtle)] p-3 rounded-[var(--radius-md)] border border-[var(--border-default)] text-center">
              <span className="text-[var(--text-tertiary)] block text-[10px] uppercase font-bold">Notes informatives</span>
              <span className="text-2xl font-mono font-black text-[var(--state-info-text)]">{report.summary.infoCount}</span>
            </div>
          </div>

          {/* Customization IDs */}
          <div className="bg-[var(--bg-sunken)] p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] space-y-1 font-mono text-[11px] text-[var(--text-tertiary)]">
            <div><span className="text-[var(--text-disabled)]">CustomizationID:</span> {report.customizationId}</div>
            <div><span className="text-[var(--text-disabled)]">ProfileID:</span> {report.profileId}</div>
            <div><span className="text-[var(--text-disabled)]">Validé le:</span> {report.validatedAt}</div>
            <div><span className="text-[var(--text-disabled)]">Durée:</span> {report.durationMs} ms</div>
          </div>

          {/* Issues list */}
          {report.issues.length === 0 ? (
            <div className="p-6 text-center bg-[var(--state-positive-bg)] border border-[var(--state-positive-border)] rounded-[var(--radius-md)]">
              <CheckCircle2 className="w-10 h-10 text-[var(--state-positive-text)] mx-auto mb-2" />
              <span className="font-bold text-[var(--state-positive-text)]">Aucune anomalie détectée</span>
              <p className="text-[var(--state-positive-text)]/80 mt-1">La facture est prête pour transmission via le réseau Peppol BIS 3.0.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {report.issues.map((issue, idx) => (
                <div key={idx} className={`p-3 rounded-[var(--radius-md)] border flex items-start space-x-3 ${severityStyles[issue.severity]}`}>
                  <div className="shrink-0 mt-0.5">{severityIcon(issue.severity)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[11px]">{issue.ruleId}</span>
                      <span className="text-[10px] opacity-70">{issue.origin}</span>
                    </div>
                    <p className="mt-0.5 leading-relaxed">{issue.message}</p>
                    {issue.targetField && (
                      <span className="text-[10px] font-mono opacity-70 block mt-0.5">Champ : {issue.targetField}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--bg-surface)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            Fermer
          </button>

          <div className="flex items-center space-x-2 text-[11px] text-[var(--text-tertiary)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--state-positive-text)]" />
            <span>Validation EN 16931 / CIUS-BE / Peppol BIS 3.0</span>
          </div>
        </div>

      </div>
    </div>
  );
};
