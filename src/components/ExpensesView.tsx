import React, { useState } from 'react';
import {
  Receipt,
  UploadCloud,
  Sparkles,
  Search,
  Trash2,
} from 'lucide-react';
import { SplitView } from './ui/SplitView';
import { Segmented } from './ui/Segmented';
import { Card, CardBody, CardHeader } from './ui/Card';
import { Badge, CodeChip, StatusDot } from './ui/Badge';
import { Button, IconButton } from './ui/Button';
import { DataTable, Td, Th, Tr } from './ui/DataTable';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Money } from './ui/Money';
import { formatDate } from '../utils/format';
import type { PurchaseExpense } from '../types/accounting';
import type { Language } from '../i18n/translations';
import { translations } from '../i18n/translations';

interface ExpensesViewProps {
  purchases: PurchaseExpense[];
  lang: Language;
  readOnly?: boolean;
  onScanExpense: () => void;
  onDeleteExpense: (id: string) => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  purchases,
  lang,
  readOnly = false,
  onScanExpense,
  onDeleteExpense,
}) => {
  const t = translations[lang].expenses;
  const [queue, setQueue] = useState<'todo' | 'all' | 'paid'>('todo');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredPurchases = purchases.filter((exp) => {
    const matchesSearch =
      exp.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.supplierBce.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      exp.pcmnAccount.includes(searchTerm);

    const matchesCategory = categoryFilter === 'all' || exp.category.includes(categoryFilter);

    const matchesQueue =
      queue === 'all'
        ? true
        : queue === 'paid'
          ? exp.status === 'paid'
          : // todo
            exp.status === 'pending' || exp.status === 'approved';

    return matchesSearch && matchesCategory && matchesQueue;
  });

  const selectedExpense =
    (selectedId ? purchases.find((p) => p.id === selectedId) : null) ||
    (filteredPurchases.length > 0 ? filteredPurchases[0] : null);

  const pendingCount = purchases.filter((p) => p.status === 'pending' || p.status === 'approved').length;
  const paidCount = purchases.filter((p) => p.status === 'paid').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
            <Badge tone="neutral">OCR + PCMN + Déductibilité</Badge>
            <span>Achats & dépenses</span>
          </div>
          <h1 className="mt-1 text-[length:var(--text-lg)] font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[var(--text-tertiary)]" />
            {t.title}
          </h1>
        </div>

        {!readOnly && (
          <Button variant="primary" onClick={onScanExpense}>
            <Sparkles className="w-4 h-4" />
            {t.scanButton}
          </Button>
        )}
      </div>

      <SplitView
        left={
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Segmented
                value={queue}
                onChange={setQueue}
                items={[
                  { value: 'todo', label: 'À valider', count: pendingCount },
                  { value: 'paid', label: 'Payées', count: paidCount },
                  { value: 'all', label: 'Toutes', count: purchases.length },
                ]}
              />

              <Badge tone="neutral">{filteredPurchases.length}</Badge>
            </div>

            <Card>
              <CardBody className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--text-tertiary)] absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Recherche (fournisseur, BCE, PCMN, libellé…)"
                    className="pl-8"
                  />
                </div>
                <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  <option value="all">Toutes les catégories</option>
                  <option value="Télécom">Télécom</option>
                  <option value="Véhicule">Véhicule</option>
                  <option value="représentation">Restaurant</option>
                  <option value="Matériel">Matériel</option>
                  <option value="Sociales">Sociales</option>
                </Select>
              </CardBody>
            </Card>

            {!readOnly && (
              <Card>
                <CardBody>
                  <button
                    type="button"
                    onClick={onScanExpense}
                    className="w-full text-left border border-dashed rounded-[var(--radius-lg)] px-3 py-3 bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] border-[var(--border-default)] transition"
                  >
                    <div className="flex items-center gap-2">
                      <UploadCloud className="w-4 h-4 text-[var(--text-tertiary)]" />
                      <div>
                        <div className="text-[length:var(--text-xs)] font-medium text-[var(--text-primary)]">
                          {t.dropzoneTitle}
                        </div>
                        <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                          {t.dropzoneSubtitle}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                      <StatusDot tone="info">OCR FR/NL</StatusDot>
                      <StatusDot tone="info">BCE Mod97</StatusDot>
                      <StatusDot tone="info">Déductibilité</StatusDot>
                    </div>
                  </button>
                </CardBody>
              </Card>
            )}

            <Card flush>
              <CardHeader title="Dépenses" description={`${filteredPurchases.length} élément(s)`} />
              <DataTable stickyHeader>
                <thead>
                  <tr>
                    <Th>{t.thSupplier}</Th>
                    <Th>{t.thPcmn}</Th>
                    <Th>Date / Réf.</Th>
                    <Th align="right">{t.thBase}</Th>
                    <Th align="right">{t.thVat}</Th>
                    <Th align="right">{t.thDeductibleAmount}</Th>
                    <Th>{t.thStatus}</Th>
                    <Th align="right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((exp) => {
                    const active = selectedExpense?.id === exp.id;
                    const tone =
                      exp.status === 'paid'
                        ? 'positive'
                        : exp.status === 'pending'
                          ? 'warning'
                          : exp.status === 'approved'
                            ? 'info'
                            : 'neutral';

                    return (
                      <Tr
                        key={exp.id}
                        interactive
                        onClick={() => setSelectedId(exp.id)}
                        className={active ? 'bg-[var(--accent-soft)]' : undefined}
                      >
                  
                        <Td>
                          <div className="min-w-0">
                            <div className="font-medium text-[var(--text-primary)] truncate">{exp.supplierName}</div>
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">{exp.supplierBce}</div>
                          </div>
                        </Td>
                        <Td>
                          <div className="space-y-0.5">
                            <div className="font-mono tnum text-[var(--text-primary)]">{exp.pcmnAccount}</div>
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] truncate max-w-[180px]">{exp.category}</div>
                          </div>
                        </Td>
                        <Td>
                          <div className="space-y-0.5">
                            <div>{formatDate(exp.date)}</div>
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)] font-mono tnum">{exp.invoiceNumber}</div>
                          </div>
                        </Td>
                        <Td align="right"><Money value={exp.amountExclVat} /></Td>
                        <Td align="right">
                          <div className="space-y-0.5">
                            <Money value={exp.vatAmount} tone="muted" />
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">{exp.vatRate}%</div>
                          </div>
                        </Td>
                        <Td align="right">
                          <div className="space-y-0.5">
                            <Money value={exp.deductibleAmount} />
                            <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                              Déduct. {exp.deductibilityRate}%
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <StatusDot tone={tone as any}>{exp.status.toUpperCase()}</StatusDot>
                        </Td>
                        <Td align="right">
                          {!readOnly && (
                            <IconButton
                              label="Supprimer"
                              tone="danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteExpense(exp.id);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </IconButton>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </Card>
          </div>
        }
        right={
          <Card>
            <CardHeader
              title={selectedExpense ? selectedExpense.supplierName : 'Sélection'}
              description={selectedExpense ? selectedExpense.description : 'Sélectionne une dépense'}
              actions={
                selectedExpense ? (
                  <div className="flex items-center gap-1">
                    {!readOnly && (
                      <Button
                        variant="secondary"
                        className="h-[var(--control-height-sm)] px-2"
                        onClick={() => onScanExpense()}
                        title="Scanner/ajouter une autre dépense"
                      >
                        <UploadCloud className="w-3.5 h-3.5" />
                        Scanner
                      </Button>
                    )}
                  </div>
                ) : null
              }
            />
            <CardBody className="space-y-3">
              {!selectedExpense ? (
                <div className="text-[length:var(--text-xs)] text-[var(--text-tertiary)]">Aucune dépense.</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-[length:var(--text-xs)]">
                    <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Date</div>
                      <div className="mt-0.5">{formatDate(selectedExpense.date)}</div>
                    </div>
                    <div className="p-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Échéance</div>
                      <div className="mt-0.5">{formatDate(selectedExpense.dueDate)}</div>
                    </div>
                    <div className="col-span-2 p-2 rounded-[var(--radius-md)] bg-[var(--bg-subtle)] border border-[var(--border-subtle)]">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">BCE</div>
                      <div className="mt-0.5"><CodeChip>{selectedExpense.supplierBce}</CodeChip></div>
                    </div>
                  </div>

                  <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-1.5">
                    <div className="flex items-baseline justify-between">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">TVAC</div>
                      <Money value={selectedExpense.amountInclVat} />
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">HTVA</div>
                      <span className="font-mono tnum text-[length:var(--text-xs)] text-[var(--text-secondary)]">
                        {selectedExpense.amountExclVat.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">TVA</div>
                      <span className="font-mono tnum text-[length:var(--text-xs)] text-[var(--text-secondary)]">
                        {selectedExpense.vatAmount.toFixed(2)} ({selectedExpense.vatRate}%)
                      </span>
                    </div>
                    <div className="mt-2">
                      <StatusDot tone={selectedExpense.deductibilityRate === 0 ? 'critical' : selectedExpense.deductibilityRate < 100 ? 'warning' : 'positive'}>
                        Déductibilité {selectedExpense.deductibilityRate}%
                      </StatusDot>
                    </div>
                  </div>

                  {selectedExpense.ocrExtractedData && (
                    <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                      <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">Qualité OCR</div>
                      <div className="mt-1 space-y-1 text-[length:var(--text-xs)]">
                        <div className="flex items-center justify-between">
                          <span>Données fournisseur</span>
                          <StatusDot tone={selectedExpense.ocrExtractedData.supplierRecognized ? 'positive' : 'warning'}>
                            {selectedExpense.ocrExtractedData.supplierRecognized ? 'OK' : 'À vérifier'}
                          </StatusDot>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>BCE validée</span>
                          <StatusDot tone={selectedExpense.ocrExtractedData.bceValidated ? 'positive' : 'critical'}>
                            {selectedExpense.ocrExtractedData.bceValidated ? 'OK' : 'KO'}
                          </StatusDot>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>TVA détectée</span>
                          <span className="font-mono tnum">{selectedExpense.ocrExtractedData.vatDetected.toFixed(2)}</span>
                        </div>
                        {typeof selectedExpense.ocrConfidence === 'number' && (
                          <div className="flex items-center justify-between">
                            <span>Confiance</span>
                            <span className="font-mono tnum">{Math.round(selectedExpense.ocrConfidence * 100)}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="text-[length:var(--text-2xs)] text-[var(--text-tertiary)]">
                    Next : ajout d'une action “Valider / Approuver” + export fiduciaire.
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        }
      />
    </div>
  );
};
