import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, Loader2, Plus, Trash2, Upload } from 'lucide-react';
import { dbStore } from '../server/services/dbStore';
import { useSession } from '../state/SessionContext';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';
import type { SharedDocument } from '../server/types/db';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { Badge } from './ui/Badge';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Field } from './ui/Field';
import { DataTable, Th, Td, Tr } from './ui/DataTable';
import { TableEmptyRow } from './ui/EmptyState';

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
export function DocumentsView({ lang }: { lang: Language }) {
  const { activeTenant, user } = useSession();
  const t = translations[lang].documents;
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
    <div className="space-y-4">
      {/* ── Hero header ───────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
          <Badge tone="accent" dot>GED partagée</Badge>
          <span>Registre documentaire séparé par tenant</span>
        </div>
        <h1 className="text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-[var(--text-tertiary)]" />
          {t.title}
        </h1>
        <p className="text-[length:var(--text-xs)] text-[var(--text-secondary)]">
          {t.subtitle} (séparé par tenant).
        </p>
      </div>

      {/* ── Add form ──────────────────────────────────────────────────────── */}
      <Card flush>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--text-tertiary)]" />
              Déposer un document
            </span>
          }
          description="Métadonnées enregistrées dans le registre partagé du tenant"
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Fichier">
              <input
                ref={fileRef}
                type="file"
                onChange={handlePickFile}
                className="w-full h-[var(--control-height)] px-2.5 rounded-[var(--radius-md)] bg-[var(--bg-surface)] border border-[var(--border-default)] text-[length:var(--text-xs)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-focus)] file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--accent-solid)] file:px-2 file:py-1 file:text-[length:var(--text-2xs)] file:font-semibold file:text-[var(--accent-text)]"
              />
            </Field>
            <Field label="Catégorie">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Note (optionnel)" className="sm:col-span-2">
              <Input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex. Déclaration TVA T1 2026 signée"
              />
            </Field>
          </div>
          <Button variant="primary" onClick={handleAdd} disabled={!fileName}>
            {fileName ? <Upload className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {fileName ? `Ajouter ${fileName} (${fmtSize(fileSize)})` : 'Ajouter un document'}
          </Button>
        </CardBody>
      </Card>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[length:var(--text-xs)] text-[var(--text-tertiary)]">
          <Loader2 className="w-5 h-5 animate-spin" /> Chargement…
        </div>
      ) : (
        <Card flush>
          <CardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--text-tertiary)]" />
                Documents partagés
              </span>
            }
            description={`${documents.length} document${documents.length > 1 ? 's' : ''} au registre`}
          />
          <DataTable>
            <thead>
              <tr>
                <Th className="pl-4">Document</Th>
                <Th>Catégorie</Th>
                <Th align="right">Taille</Th>
                <Th>Note</Th>
                <Th align="right" className="pr-4">Action</Th>
              </tr>
            </thead>
            <tbody>
              {documents.length === 0 && (
                <TableEmptyRow colSpan={5}>Aucun document partagé pour l'instant.</TableEmptyRow>
              )}
              {documents.map((doc) => (
                <Tr key={doc.id} interactive>
                  <Td className="pl-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[var(--accent-solid)] shrink-0" />
                      <span className="font-semibold text-[var(--text-primary)]">{doc.fileName}</span>
                    </div>
                    <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] pl-6">
                      {doc.mimeType}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone="neutral">{doc.category}</Badge>
                  </Td>
                  <Td align="right" mono className="text-[var(--text-tertiary)]">
                    {fmtSize(doc.fileSize)}
                  </Td>
                  <Td className="text-[var(--text-tertiary)]">{doc.note ?? '—'}</Td>
                  <Td align="right" className="pr-4">
                    <IconButton label="Retirer" tone="danger" onClick={() => handleRemove(doc.id)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      )}
    </div>
  );
}
