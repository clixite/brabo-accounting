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
  ERROR: 'bg-red-500/10 text-red-300 border-red-500/30',
  WARNING: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  INFO: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
};

const severityIcon = (severity: ValidationIssue['severity']) => {
  if (severity === 'ERROR') return <AlertTriangle className="w-4 h-4 text-red-400" />;
  if (severity === 'WARNING') return <Info className="w-4 h-4 text-amber-400" />;
  return <Info className="w-4 h-4 text-blue-400" />;
};

export const SchematronReportModal: React.FC<SchematronReportModalProps> = ({
  isOpen,
  onClose,
  report,
}) => {
  if (!isOpen || !report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150 text-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-850">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Rapport de Conformité Schematron</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  report.isValid 
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  {report.isValid ? 'EN 16931 CONFORME' : 'NON CONFORME'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Facture {report.invoiceNumber} • {report.rulesEvaluated} règles évaluées • EN 16931 + CIUS-BE + Peppol BIS 3.0
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs">
          
          {/* Score summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Score de conformité</span>
              <span className={`text-2xl font-mono font-black ${
                report.summary.complianceScore >= 90 ? 'text-emerald-400' : report.summary.complianceScore >= 70 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {report.summary.complianceScore}%
              </span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Erreurs bloquantes</span>
              <span className="text-2xl font-mono font-black text-red-400">{report.summary.errorCount}</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Avertissements</span>
              <span className="text-2xl font-mono font-black text-amber-400">{report.summary.warningCount}</span>
            </div>
            <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Notes informatives</span>
              <span className="text-2xl font-mono font-black text-blue-400">{report.summary.infoCount}</span>
            </div>
          </div>

          {/* Customization IDs */}
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 font-mono text-[11px] text-slate-400">
            <div><span className="text-slate-500">CustomizationID:</span> {report.customizationId}</div>
            <div><span className="text-slate-500">ProfileID:</span> {report.profileId}</div>
            <div><span className="text-slate-500">Validé le:</span> {report.validatedAt}</div>
            <div><span className="text-slate-500">Durée:</span> {report.durationMs} ms</div>
          </div>

          {/* Issues list */}
          {report.issues.length === 0 ? (
            <div className="p-6 text-center bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <span className="font-bold text-emerald-300">Aucune anomalie détectée</span>
              <p className="text-emerald-400/80 mt-1">La facture est prête pour transmission via le réseau Peppol BIS 3.0.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {report.issues.map((issue, idx) => (
                <div key={idx} className={`p-3 rounded-xl border flex items-start space-x-3 ${severityStyles[issue.severity]}`}>
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
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-slate-800 bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
          >
            Fermer
          </button>

          <div className="flex items-center space-x-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Validation EN 16931 / CIUS-BE / Peppol BIS 3.0</span>
          </div>
        </div>

      </div>
    </div>
  );
};
