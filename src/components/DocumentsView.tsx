import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { dbStore } from '../server/services/dbStore';
import { useSession } from '../state/SessionContext';
import type { SharedDocument } from '../server/types/db';

const CATEGORIES = ['Déclarations', 'Contrats', 'Reçus', 'Pièces bancaires', 'Correspondance', 'Autre'];

const fmtSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

/**
 * Shared document register (GED) — the company and its ITAA firm exchange
 * documents through a single tenant-scoped store. Upload is metadata-only in
 * the demo (binary → object storage in production).
 */
export function DocumentsView() {
  const { activeTenant, user } = useSession();
  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [mimeType, setMimeType] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!activeTenant || !user) return;
    setLoading(true);
    try {
      const ctx = await dbStore.createContext(user.id, activeTenant.id);
      const page = await dbStore.documents.list(ctx, { limit: 500 });
      setDocuments(page.items);
    } finally {
      setLoading(false);
    }
  }, [activeTenant, user]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileSize(file.size);
    setMimeType(file.type || 'application/octet-stream');
  };

  const handleAdd = async () => {
    if (!activeTenant || !user || !fileName) return;
    const ctx = await dbStore.createContext(user.id, activeTenant.id);
    await dbStore.documents.create(ctx, {
      fileName,
      mimeType,
      fileSize,
      category,
      note: note || undefined,
      uploadedByUserId: user.id,
      storageKey: `demo://${encodeURIComponent(fileName)}`,
    });
    setFileName(null);
    setFileSize(0);
    setMimeType('');
    setNote('');
    if (fileRef.current) fileRef.current.value = '';
    await load();
  };

  const handleRemove = async (id: string) => {
    if (!activeTenant || !user) return;
    const ctx = await dbStore.createContext(user.id, activeTenant.id);
    await dbStore.documents.remove(ctx, id, 'Document retiré');
    await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold tracking-wider uppercase mb-1">
          <FolderOpen className="h-4 w-4" /> GED partagée
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Pièces & documents</h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Registre partagé entre votre société et votre cabinet comptable (séparé par tenant).
        </p>
      </div>

      {/* Add form */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            Fichier
            <input
              ref={fileRef}
              type="file"
              onChange={handlePickFile}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 file:mr-3 file:rounded file:border-0 file:bg-amber-500 file:px-2 file:py-1 file:text-xs file:font-bold file:text-slate-950"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            Catégorie
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400 sm:col-span-2">
            Note (optionnel)
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex. Déclaration TVA T1 2026 signée"
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-500"
            />
          </label>
        </div>
        <button
          onClick={handleAdd}
          disabled={!fileName}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {fileName ? <Upload className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {fileName ? `Ajouter ${fileName} (${fmtSize(fileSize)})` : 'Ajouter un document'}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Chargement…
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-850 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-3 pl-5">Document</th>
                  <th className="p-3">Catégorie</th>
                  <th className="p-3">Taille</th>
                  <th className="p-3">Note</th>
                  <th className="p-3 pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-500">
                      Aucun document partagé pour l'instant.
                    </td>
                  </tr>
                )}
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 pl-5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-400 shrink-0" />
                        <span className="font-semibold text-slate-200">{doc.fileName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 pl-6">{doc.mimeType}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        {doc.category}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-400">{fmtSize(doc.fileSize)}</td>
                    <td className="p-3 text-slate-400">{doc.note ?? '—'}</td>
                    <td className="p-3 pr-5 text-right">
                      <button
                        onClick={() => handleRemove(doc.id)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                        title="Retirer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
