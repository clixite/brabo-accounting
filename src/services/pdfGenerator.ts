import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Invoice, CompanyProfile } from '../types/accounting';
import { generateEpcQrDataUrl } from '../utils/epcQrCode';

export async function generateInvoicePDF(invoice: Invoice, company: CompanyProfile): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const isQuote = invoice.type === 'quote';
  const isCreditNote = invoice.type === 'credit_note';
  const title = isQuote ? 'DEVIS PROFORMA' : isCreditNote ? 'NOTE DE CRÉDIT' : 'FACTURE';

  // Palette
  const primaryColor = [26, 54, 93];
  const textColor = [30, 41, 59];
  const lightBg = [248, 250, 252];

  // 1. Header Banner
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 18, 'F');

  // Belgian tricolor mini bar on top
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, 70, 3, 'F');
  doc.setFillColor(254, 211, 48);
  doc.rect(70, 0, 70, 3, 'F');
  doc.setFillColor(235, 47, 6);
  doc.rect(140, 0, 70, 3, 'F');

  // App / Brand Header text
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('BRABO — BELGIAN SMART ACCOUNTING & PEPPOL HUB', 14, 12);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Conforme Norme e-FFF / Peppol BIS 3.0', 145, 12);

  // 2. Company Info (Left) & Document Title (Right)
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(company.name, 14, 32);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`${company.street} ${company.number}${company.box ? ' ' + company.box : ''}`, 14, 38);
  doc.text(`${company.postalCode} ${company.city} — ${company.country}`, 14, 43);
  doc.text(`BCE / TVA : ${company.bceNumber}`, 14, 48);
  doc.text(`RPM / RPR : ${company.rpmCity}`, 14, 53);
  doc.text(`IBAN : ${company.iban} | BIC : ${company.bic}`, 14, 58);
  doc.text(`Peppol ID : ${company.peppolEndpointId} | Email : ${company.email}`, 14, 63);

  // Right Side - Document Box
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(120, 26, 76, 40, 3, 3, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(120, 26, 76, 40, 3, 3, 'S');

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 125, 35);

  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Numéro :`, 125, 43);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.invoiceNumber, 155, 43);

  doc.setFont('helvetica', 'bold');
  doc.text(`Date d'émission :`, 125, 49);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.date, 155, 49);

  doc.setFont('helvetica', 'bold');
  doc.text(`Échéance :`, 125, 55);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.dueDate, 155, 55);

  doc.setFont('helvetica', 'bold');
  doc.text(`Statut :`, 125, 61);
  doc.setFont('helvetica', 'normal');
  doc.text(invoice.status.toUpperCase(), 155, 61);

  // 3. Client Box (Bill To)
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, 72, 182, 30, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 72, 182, 30, 2, 2, 'S');

  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURÉ À (CLIENT) :', 20, 79);

  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.client.name, 20, 86);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${invoice.client.street} ${invoice.client.number}${invoice.client.box ? ' ' + invoice.client.box : ''}, ${invoice.client.postalCode} ${invoice.client.city}`, 20, 92);
  doc.text(`BCE / TVA : ${invoice.client.bceNumber} | Peppol Endpoint : ${invoice.client.peppolEndpointId || 'Non enregistré'}`, 20, 97);

  // 4. Items Table
  const tableRows = invoice.lines.map((line, idx) => [
    (idx + 1).toString(),
    `${line.description}\n[PCMN ${line.pcmnAccount}]`,
    line.quantity.toString(),
    `${line.unitPrice.toFixed(2)} €`,
    `${line.vatRate}%`,
    `${line.totalExclVat.toFixed(2)} €`
  ]);

  autoTable(doc, {
    startY: 108,
    head: [['#', 'Description des prestations / marchandises', 'Qté', 'Prix Unit. HTVA', 'TVA', 'Total HTVA']],
    body: tableRows,
    theme: 'striped',
    headStyles: {
      fillColor: [26, 54, 93],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [30, 41, 59],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 90 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 27, halign: 'right' },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable.finalY + 8;

  // 5. Payment Box with Belgian Structured Communication (OGM) & EPC QR Code
  doc.setFillColor(254, 243, 199);
  doc.roundedRect(14, finalY, 110, 45, 2, 2, 'F');
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, finalY, 110, 45, 2, 2, 'S');

  doc.setTextColor(180, 83, 9);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('MODALITÉS DE PAIEMENT SEPA (BELGIQUE)', 18, finalY + 6);

  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Bénéficiaire : ${company.name}`, 18, finalY + 12);
  doc.text(`IBAN : ${company.iban}`, 18, finalY + 17);
  doc.text(`BIC : ${company.bic} (${company.bankName})`, 18, finalY + 22);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 54, 93);
  doc.text('Communication structurée (OGM) :', 18, finalY + 28);
  
  doc.setFontSize(10);
  doc.setFont('courier', 'bold');
  doc.setTextColor(180, 83, 9);
  doc.text(invoice.structuredCommunication, 18, finalY + 34);

  // Generate and insert EPC QR Code
  try {
    const qrDataUrl = await generateEpcQrDataUrl({
      bic: company.bic,
      name: company.name,
      iban: company.iban,
      amount: invoice.totalInclVat,
      structuredCommunication: invoice.structuredCommunication,
    });
    doc.addImage(qrDataUrl, 'PNG', 92, finalY + 7, 28, 28);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Scan to Pay (EPC)', 92, finalY + 38);
  } catch (e) {
    console.error('Failed to generate QR code', e);
  }

  // 6. Totals & VAT Breakdown (Right)
  doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
  doc.roundedRect(128, finalY, 68, 45, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(128, finalY, 68, 45, 2, 2, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Sous-total HTVA :', 133, finalY + 8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(`${invoice.subtotalExclVat.toFixed(2)} €`, 191, finalY + 8, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Total TVA belge :', 133, finalY + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(`${invoice.totalVatAmount.toFixed(2)} €`, 191, finalY + 16, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(133, finalY + 22, 191, finalY + 22);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text('TOTAL À PAYER :', 133, finalY + 32);
  doc.setFontSize(12.5);
  doc.setTextColor(217, 119, 6);
  doc.text(`${invoice.totalInclVat.toFixed(2)} €`, 191, finalY + 32, { align: 'right' });

  // 7. Footer / Legal Belgian mentions
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  
  const legalText1 = `Paiement à ${invoice.paymentTermsDays} jours fin de mois. Tout retard de paiement entraîne de plein droit et sans mise en demeure un intérêt au taux légal (loi belge du 2 août 2002) majoré d'une indemnité forfaitaire de 10% (min. 50 €).`;
  const legalText2 = `En cas de litige, seuls les tribunaux de l'arrondissement judiciaire de ${company.rpmCity} sont compétents. Facture transmise électroniquement via le réseau Peppol BIS Billing 3.0.`;
  
  doc.text(legalText1, 14, pageHeight - 12);
  doc.text(legalText2, 14, pageHeight - 8);

  doc.save(`${title.replace(/\s+/g, '_')}_${invoice.invoiceNumber}.pdf`);
}
