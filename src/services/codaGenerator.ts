import { formatOGM, validateOGM } from '../utils/belgianAccounting';
import type { BankTransaction, CompanyProfile } from '../types/accounting';

/**
 * ============================================================================
 *  FEBELFIN CODA FILE BUILDER — "Coded Statement of Account" v2.6
 * ----------------------------------------------------------------------------
 *  Produces official Belgian CODA files: flat text, one record per line, every
 *  record EXACTLY 80 characters wide, space padded.
 *
 *  Record layout implemented (Febelfin standard):
 *    0  — Header               (file / sender / recipient identification)
 *    1  — Old balance          (account, currency, statement number, balance)
 *    21 — Movement part 1      (sequence, amount, valuta date, transaction code)
 *    22 — Movement part 2      (counterparty BIC, category, communication tail)
 *    23 — Movement part 3      (counterparty IBAN + counterparty name)
 *    31 — Information part 1   (optional, structured detail per movement)
 *    8  — New balance          (closing balance and its date)
 *    9  — Trailer              (record count and debit/credit control totals)
 *
 *  Numeric conventions:
 *    - amounts are 15 digits, unsigned, expressed in 1/1000 units (3 decimals)
 *    - sign is a separate 1-char field: '0' = credit, '1' = debit
 *    - dates are DDMMYY
 *    - the structured communication is the 12-digit OGM (type '1', code '101')
 * ============================================================================
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CodaRecordType = '0' | '1' | '21' | '22' | '23' | '31' | '32' | '8' | '9';

export type CodaTransactionDirection = 'credit' | 'debit';

/** Communication type: free text vs Belgian structured communication (OGM). */
export type CodaCommunicationType = 'free' | 'structured';

export interface CodaBankProfile {
  /** Common bank name printed in the header (max 26 chars). */
  name: string;
  bic: string;
  /** 3-digit Febelfin bank identification number. */
  bankIdentificationNumber: string;
  /** First 3 digits of Belgian national account numbers issued by this bank. */
  accountPrefix: string;
}

export interface CodaTransactionInput {
  /** Amount in EUR; positive = credit (money in), negative = debit (money out). */
  amount: number;
  /** Booking / entry date (YYYY-MM-DD). Defaults to the statement date. */
  entryDate?: string;
  /** Value date (YYYY-MM-DD). Defaults to the entry date. */
  valutaDate?: string;
  counterpartyName: string;
  counterpartyIban: string;
  counterpartyBic?: string;
  /** Free communication text, used when no OGM is supplied. */
  communication?: string;
  /** Belgian structured communication `+++123/4567/89012+++`. */
  structuredCommunication?: string;
  /**
   * Febelfin transaction code, 8 digits:
   *   transaction type (1) + family (2) + operation (2) + category (3).
   * Defaults to `00500000` (credit transfer) / `00100000` (payment).
   */
  transactionCode?: string;
  /** Optional free reference of the bank (max 21 chars). */
  bankReference?: string;
  /** Extra `31` information records attached to the movement. */
  additionalInformation?: string[];
}

export interface CodaStatementInput {
  /** Account holder — usually the BRABO company profile. */
  accountHolderName: string;
  /** Belgian IBAN of the account the statement belongs to. */
  iban: string;
  currency?: string;
  /** Bank issuing the statement. */
  bank: CodaBankProfile;
  /** Statement date (YYYY-MM-DD): the day the statement closes. */
  statementDate: string;
  /** Sequential statement number of the year (1..999). */
  statementNumber: number;
  /** Opening balance in EUR (may be negative). */
  oldBalance: number;
  /** Date of the opening balance (YYYY-MM-DD). Defaults to statementDate. */
  oldBalanceDate?: string;
  transactions: CodaTransactionInput[];
  /** BCE/KBO number of the account holder (10 digits). */
  accountHolderBce?: string;
  /** File creation date (YYYY-MM-DD). Defaults to statementDate. */
  creationDate?: string;
  /** CodaBox / Isabel duplicate flag: 'D' marks a re-delivered file. */
  isDuplicate?: boolean;
  /** Free reference of the addressee (max 10 chars, header positions 25-34). */
  addresseeReference?: string;
}

export interface CodaGenerationResult {
  /** The complete CODA file content, `\r\n` separated, 80 chars per record. */
  content: string;
  /** Individual 80-character records, in emission order. */
  records: string[];
  /** Suggested filename, CodaBox convention. */
  fileName: string;
  recordCount: number;
  movementCount: number;
  oldBalance: number;
  newBalance: number;
  totalDebit: number;
  totalCredit: number;
}

export interface CodaValidationIssue {
  lineNumber: number;
  recordType: string;
  message: string;
}

export interface CodaValidationResult {
  isValid: boolean;
  issues: CodaValidationIssue[];
  recordCount: number;
}

// ---------------------------------------------------------------------------
// Belgian bank catalogue (CodaBox-supported institutions)
// ---------------------------------------------------------------------------

export const BELGIAN_BANKS: Record<string, CodaBankProfile> = {
  BNP_PARIBAS_FORTIS: {
    name: 'BNP PARIBAS FORTIS',
    bic: 'GEBABEBB',
    bankIdentificationNumber: '001',
    accountPrefix: '001',
  },
  BELFIUS: {
    name: 'BELFIUS BANK',
    bic: 'GKCCBEBB',
    bankIdentificationNumber: '063',
    accountPrefix: '063',
  },
  KBC: {
    name: 'KBC BANK',
    bic: 'KREDBEBB',
    bankIdentificationNumber: '734',
    accountPrefix: '734',
  },
  CBC: {
    name: 'CBC BANQUE',
    bic: 'CREGBEBB',
    bankIdentificationNumber: '732',
    accountPrefix: '732',
  },
  ING_BELGIUM: {
    name: 'ING BELGIUM',
    bic: 'BBRUBEBB',
    bankIdentificationNumber: '310',
    accountPrefix: '310',
  },
  TRIODOS: {
    name: 'TRIODOS BANK',
    bic: 'TRIOBEBB',
    bankIdentificationNumber: '523',
    accountPrefix: '523',
  },
};

/** Common Febelfin transaction codes used by the sample generator. */
export const CODA_TRANSACTION_CODES = {
  /** Domestic credit transfer received. */
  CREDIT_TRANSFER_IN: '00500000',
  /** Domestic credit transfer issued. */
  CREDIT_TRANSFER_OUT: '00100000',
  /** SEPA direct debit. */
  DIRECT_DEBIT: '00700000',
  /** Bancontact / Payconiq card collection. */
  CARD_PAYMENT: '00300000',
  /** Bank charges (account keeping fees). */
  BANK_CHARGES: '00130000',
  /** Credit interest. */
  INTEREST_CREDIT: '00400000',
} as const;

export const CODA_RECORD_LENGTH = 80;

// ---------------------------------------------------------------------------
// Low-level field formatting helpers
// ---------------------------------------------------------------------------

/** Left-aligned alphanumeric field, space padded / truncated to `length`. */
function alpha(value: string | undefined, length: number): string {
  const raw = (value ?? '')
    .normalize('NFD')
    // strip diacritics: CODA is a strict ASCII upper-case format
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .,\-/&+']/g, ' ');
  return raw.length >= length ? raw.substring(0, length) : raw.padEnd(length, ' ');
}

/** Right-aligned numeric field, zero padded / truncated to `length`. */
function num(value: number | string, length: number): string {
  const digits = String(value).replace(/[^0-9]/g, '');
  return digits.length >= length ? digits.slice(-length) : digits.padStart(length, '0');
}

/** A run of `length` spaces (unused / reserved zones). */
function blank(length: number): string {
  return ' '.repeat(length);
}

/** Converts `YYYY-MM-DD` to the CODA `DDMMYY` date format. */
export function toCodaDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return '000000';
  const [, year, month, day] = match;
  return `${day}${month}${year.substring(2)}`;
}

/** Converts a CODA `DDMMYY` date back to `YYYY-MM-DD` (pivot at 1980). */
export function fromCodaDate(codaDate: string): string {
  const digits = codaDate.replace(/[^0-9]/g, '').padStart(6, '0');
  const day = digits.substring(0, 2);
  const month = digits.substring(2, 4);
  const shortYear = parseInt(digits.substring(4, 6), 10);
  const year = shortYear >= 80 ? 1900 + shortYear : 2000 + shortYear;
  return `${year}-${month}-${day}`;
}

/**
 * Formats an amount as the 15-digit unsigned CODA amount (1/1000 units)
 * together with its separate sign character ('0' credit, '1' debit).
 */
export function toCodaAmount(amount: number): { sign: '0' | '1'; digits: string } {
  const sign: '0' | '1' = amount < 0 ? '1' : '0';
  const thousandths = Math.round(Math.abs(amount) * 1000);
  return { sign, digits: num(thousandths, 15) };
}

/** Parses a CODA sign + 15-digit amount pair back into a signed EUR amount. */
export function fromCodaAmount(sign: string, digits: string): number {
  const value = parseInt(digits.replace(/[^0-9]/g, ''), 10) / 1000;
  return sign === '1' ? -value : value;
}

/** Strips separators from a Belgian IBAN and returns its 12 national digits. */
function ibanToNationalNumber(iban: string): string {
  const clean = iban.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  // BE + 2 check digits + 12 national digits
  return clean.startsWith('BE') ? num(clean.substring(4), 12) : num(clean, 12);
}

/** Ensures every emitted record is exactly 80 characters. */
function fixWidth(record: string): string {
  if (record.length === CODA_RECORD_LENGTH) return record;
  return record.length > CODA_RECORD_LENGTH
    ? record.substring(0, CODA_RECORD_LENGTH)
    : record.padEnd(CODA_RECORD_LENGTH, ' ');
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Record builders (each returns exactly 80 characters)
// ---------------------------------------------------------------------------

/**
 * Record 0 — Header.
 *  1     : '0'
 *  2-6   : blanks
 *  6-11  : creation date DDMMYY
 *  11-14 : bank identification number
 *  14-15 : application code '05'
 *  16    : duplicate flag ('D' or blank)
 *  25-35 : reference of the addressee
 *  35-61 : name of the addressee (account holder)
 *  61-71 : BIC of the sending bank
 *  71-82 : identification number of the account holder (BCE)
 */
export function buildHeaderRecord(input: CodaStatementInput): string {
  const creationDate = toCodaDate(input.creationDate ?? input.statementDate);

  const record =
    '0' +
    blank(4) +
    creationDate +
    num(input.bank.bankIdentificationNumber, 3) +
    '05' +
    (input.isDuplicate ? 'D' : ' ') +
    blank(7) +
    alpha(input.addresseeReference, 10) +
    alpha(input.accountHolderName, 26) +
    alpha(input.bank.bic, 11) +
    num(input.accountHolderBce ?? '0', 11) +
    blank(1) +
    '2' + // version code of the CODA standard
    blank(4);

  return fixWidth(record);
}

/**
 * Record 1 — Old balance.
 *  1     : '1'
 *  2     : account structure ('0' = Belgian account number)
 *  3-6   : statement sequence number
 *  6-43  : account number + currency
 *  43    : sign of the old balance
 *  43-58 : old balance (15 digits, 1/1000)
 *  58-64 : date of the old balance
 *  64-90 : account holder name (truncated to fit 80)
 */
export function buildOldBalanceRecord(input: CodaStatementInput): string {
  const { sign, digits } = toCodaAmount(input.oldBalance);
  const currency = (input.currency ?? 'EUR').toUpperCase();

  const record =
    '1' +
    '0' +
    num(input.statementNumber, 3) +
    ibanToNationalNumber(input.iban) +
    alpha(currency, 3) +
    blank(1) +
    'BE' +
    blank(19) +
    sign +
    digits +
    toCodaDate(input.oldBalanceDate ?? input.statementDate) +
    alpha(input.accountHolderName, 16) +
    num(input.statementNumber, 3);

  return fixWidth(record);
}

/**
 * Record 21 — Movement, part 1.
 *  1-2   : '21'
 *  3-6   : sequence number of the movement
 *  6-10  : detail sequence number ('0000' for the main line)
 *  10-31 : bank reference of the movement
 *  32    : sign ('0' credit, '1' debit)
 *  32-47 : amount (15 digits, 1/1000)
 *  47-53 : valuta date DDMMYY
 *  53-61 : Febelfin transaction code (8 digits)
 *  61    : communication type ('0' free, '1' structured)
 *  62    : communication qualifier ('0' = not continued)
 *  62-115 → truncated at 80: first slice of the communication
 */
export function buildMovementRecord(
  transaction: CodaTransactionInput,
  sequenceNumber: number,
  statementDate: string
): string {
  const { sign, digits } = toCodaAmount(transaction.amount);
  const isStructured = Boolean(transaction.structuredCommunication);

  const defaultCode =
    transaction.amount >= 0
      ? CODA_TRANSACTION_CODES.CREDIT_TRANSFER_IN
      : CODA_TRANSACTION_CODES.CREDIT_TRANSFER_OUT;

  const communication = isStructured
    ? // Structured: '101' code + the 12 OGM digits
      `101${num(transaction.structuredCommunication ?? '', 12)}`
    : alpha(transaction.communication, 15);

  const record =
    '21' +
    num(sequenceNumber, 4) +
    '0000' +
    alpha(transaction.bankReference ?? `REF${num(sequenceNumber, 8)}`, 21) +
    sign +
    digits +
    toCodaDate(transaction.valutaDate ?? transaction.entryDate ?? statementDate) +
    num(transaction.transactionCode ?? defaultCode, 8) +
    (isStructured ? '1' : '0') +
    '0' +
    alpha(communication, 15);

  return fixWidth(record);
}

/**
 * Record 22 — Movement, part 2.
 *  1-2   : '22'
 *  3-6   : sequence number (matches the 21 record)
 *  6-10  : detail sequence number
 *  10-63 : continuation of the communication
 *  63-68 : customer reference
 *  68-79 : BIC of the counterparty's bank
 */
export function buildMovementDetailRecord(
  transaction: CodaTransactionInput,
  sequenceNumber: number
): string {
  const tail = transaction.structuredCommunication
    ? formatOGM(transaction.structuredCommunication)
    : (transaction.communication ?? '').substring(15);

  const record =
    '22' +
    num(sequenceNumber, 4) +
    '0000' +
    alpha(tail, 41) +
    blank(12) +
    alpha(transaction.counterpartyBic ?? '', 11) +
    blank(8) +
    '0' +
    ' ';

  return fixWidth(record);
}

/**
 * Record 23 — Movement, part 3 (counterparty identification).
 *  1-2   : '23'
 *  3-6   : sequence number
 *  6-10  : detail sequence number
 *  10-44 : account number of the counterparty (IBAN)
 *  44-79 : name of the counterparty
 */
export function buildCounterpartyRecord(
  transaction: CodaTransactionInput,
  sequenceNumber: number
): string {
  const record =
    '23' +
    num(sequenceNumber, 4) +
    '0000' +
    alpha(transaction.counterpartyIban.replace(/\s+/g, ''), 34) +
    alpha(transaction.counterpartyName, 34) +
    blank(1) +
    '0' +
    ' ';

  return fixWidth(record);
}

/**
 * Record 31 — Information record attached to a movement.
 *  1-2   : '31'
 *  3-6   : sequence number of the related movement
 *  6-10  : detail sequence number
 *  10-31 : bank reference
 *  31-39 : transaction code
 *  39-40 : communication type
 *  40-113 → truncated at 80: the information text
 */
export function buildInformationRecord(
  text: string,
  sequenceNumber: number,
  detailSequence: number
): string {
  const record =
    '31' +
    num(sequenceNumber, 4) +
    num(detailSequence, 4) +
    blank(21) +
    num(CODA_TRANSACTION_CODES.CREDIT_TRANSFER_IN, 8) +
    '0' +
    alpha(text, 39) +
    '0' +
    ' ';

  return fixWidth(record);
}

/**
 * Record 8 — New balance.
 *  1     : '8'
 *  2-4   : statement sequence number
 *  4-41  : account number + currency
 *  42    : sign of the new balance
 *  42-57 : new balance (15 digits, 1/1000)
 *  57-63 : date of the new balance
 */
export function buildNewBalanceRecord(input: CodaStatementInput, newBalance: number): string {
  const { sign, digits } = toCodaAmount(newBalance);

  const record =
    '8' +
    num(input.statementNumber, 3) +
    ibanToNationalNumber(input.iban) +
    alpha(input.currency ?? 'EUR', 3) +
    blank(22) +
    sign +
    digits +
    toCodaDate(input.statementDate) +
    blank(17) +
    '0';

  return fixWidth(record);
}

/**
 * Record 9 — Trailer.
 *  1     : '9'
 *  2-16  : blanks
 *  16-22 : total number of records 1, 21, 22, 23, 31, 8
 *  22-37 : total debit movements (15 digits, 1/1000)
 *  37-52 : total credit movements (15 digits, 1/1000)
 *  128   : multiple file code (blank when the file is complete)
 */
export function buildTrailerRecord(
  detailRecordCount: number,
  totalDebit: number,
  totalCredit: number
): string {
  const record =
    '9' +
    blank(15) +
    num(detailRecordCount, 6) +
    num(Math.round(Math.abs(totalDebit) * 1000), 15) +
    num(Math.round(Math.abs(totalCredit) * 1000), 15) +
    blank(27) +
    ' ';

  return fixWidth(record);
}

// ---------------------------------------------------------------------------
// Statement assembly
// ---------------------------------------------------------------------------

/**
 * Builds a complete, Febelfin-compliant CODA statement file.
 * Every emitted record is exactly 80 characters and records are CRLF separated,
 * as required by Belgian banks and the CodaBox delivery channel.
 */
export function generateCodaFile(input: CodaStatementInput): CodaGenerationResult {
  const records: string[] = [];

  records.push(buildHeaderRecord(input));
  records.push(buildOldBalanceRecord(input));

  let totalDebit = 0;
  let totalCredit = 0;
  let detailRecordCount = 1; // the '1' old-balance record counts as a detail record

  input.transactions.forEach((transaction, index) => {
    const sequenceNumber = index + 1;

    records.push(buildMovementRecord(transaction, sequenceNumber, input.statementDate));
    records.push(buildMovementDetailRecord(transaction, sequenceNumber));
    records.push(buildCounterpartyRecord(transaction, sequenceNumber));
    detailRecordCount += 3;

    (transaction.additionalInformation ?? []).forEach((info, infoIndex) => {
      records.push(buildInformationRecord(info, sequenceNumber, infoIndex + 1));
      detailRecordCount += 1;
    });

    if (transaction.amount < 0) {
      totalDebit += Math.abs(transaction.amount);
    } else {
      totalCredit += transaction.amount;
    }
  });

  const newBalance = roundCurrency(input.oldBalance + totalCredit - totalDebit);

  records.push(buildNewBalanceRecord(input, newBalance));
  detailRecordCount += 1;

  records.push(buildTrailerRecord(detailRecordCount, totalDebit, totalCredit));

  const statementSeq = String(input.statementNumber).padStart(3, '0');
  const fileName = `CODA_${input.bank.bic}_${input.iban.replace(/\s+/g, '')}_${input.statementDate.replace(/-/g, '')}_${statementSeq}.cod`;

  return {
    content: records.join('\r\n'),
    records,
    fileName,
    recordCount: records.length,
    movementCount: input.transactions.length,
    oldBalance: roundCurrency(input.oldBalance),
    newBalance,
    totalDebit: roundCurrency(totalDebit),
    totalCredit: roundCurrency(totalCredit),
  };
}

/**
 * Builds a CODA file from BRABO `BankTransaction` records — the bridge used by
 * the "export my movements as CODA" feature.
 */
export function generateCodaFromBankTransactions(
  transactions: BankTransaction[],
  company: CompanyProfile,
  options: {
    bank?: CodaBankProfile;
    statementNumber?: number;
    statementDate?: string;
    oldBalance?: number;
    isDuplicate?: boolean;
  } = {}
): CodaGenerationResult {
  const bank = options.bank ?? BELGIAN_BANKS.BNP_PARIBAS_FORTIS;
  const statementDate =
    options.statementDate ??
    transactions.reduce<string>((latest, tx) => (tx.date > latest ? tx.date : latest), '1970-01-01');

  return generateCodaFile({
    accountHolderName: company.name,
    accountHolderBce: company.bceNumber,
    iban: company.iban,
    currency: 'EUR',
    bank,
    statementDate: statementDate === '1970-01-01' ? new Date().toISOString().substring(0, 10) : statementDate,
    statementNumber: options.statementNumber ?? 1,
    oldBalance: options.oldBalance ?? 0,
    isDuplicate: options.isDuplicate,
    transactions: transactions.map<CodaTransactionInput>((tx) => ({
      amount: tx.amount,
      entryDate: tx.date,
      valutaDate: tx.valutaDate,
      counterpartyName: tx.counterpartyName,
      counterpartyIban: tx.counterpartyIban,
      counterpartyBic: tx.counterpartyBic,
      communication: tx.communication,
      structuredCommunication: tx.isStructured ? tx.structuredCommunication : undefined,
      transactionCode:
        tx.amount >= 0
          ? CODA_TRANSACTION_CODES.CREDIT_TRANSFER_IN
          : CODA_TRANSACTION_CODES.CREDIT_TRANSFER_OUT,
      bankReference: tx.id,
    })),
  });
}

// ---------------------------------------------------------------------------
// Sample / training data
// ---------------------------------------------------------------------------

export interface SampleCodaOptions {
  bankKey?: keyof typeof BELGIAN_BANKS;
  statementDate?: string;
  statementNumber?: number;
  oldBalance?: number;
  /** Number of movements to synthesise (1..20). */
  movementCount?: number;
  accountHolderName?: string;
  iban?: string;
  accountHolderBce?: string;
}

const SAMPLE_COUNTERPARTIES: {
  name: string;
  iban: string;
  bic: string;
  amount: number;
  communication: string;
  structured?: string;
  code: string;
}[] = [
  {
    name: 'ODOO BELGIUM SA',
    iban: 'BE42 0015 6789 0123',
    bic: 'GEBABEBB',
    amount: 8409.5,
    communication: 'PAIEMENT FACTURE 2026-001',
    structured: '+++260/0100/10097+++',
    code: CODA_TRANSACTION_CODES.CREDIT_TRANSFER_IN,
  },
  {
    name: 'ANTWERP LOGISTICS HUB BV',
    iban: 'BE89 0018 7654 3210',
    bic: 'KREDBEBB',
    amount: 1754.5,
    communication: 'VIREMENT FACTURE 2026-004 BRABO SUITE',
    code: CODA_TRANSACTION_CODES.CREDIT_TRANSFER_IN,
  },
  {
    name: 'PROXIMUS SA',
    iban: 'BE45 0012 3456 0001',
    bic: 'GEBABEBB',
    amount: -296.45,
    communication: 'ABONNEMENT TELECOM PRO',
    structured: '+++092/1456/78912+++',
    code: CODA_TRANSACTION_CODES.DIRECT_DEBIT,
  },
  {
    name: "D IETEREN LEASE SA",
    iban: 'BE70 0010 9988 7766',
    bic: 'GEBABEBB',
    amount: -992.2,
    communication: 'LOYER LEASING VEHICULE',
    structured: '+++184/5520/99814+++',
    code: CODA_TRANSACTION_CODES.DIRECT_DEBIT,
  },
  {
    name: 'BNP PARIBAS FORTIS',
    iban: 'BE68 0012 3456 7890',
    bic: 'GEBABEBB',
    amount: -45,
    communication: 'FRAIS TENUE DE COMPTE PROFESSIONNEL Q1',
    code: CODA_TRANSACTION_CODES.BANK_CHARGES,
  },
  {
    name: 'ACERTA SOCIAL INSURANCE',
    iban: 'BE31 4300 1234 5678',
    bic: 'KREDBEBB',
    amount: -892.14,
    communication: 'COTISATIONS SOCIALES INDEPENDANT Q1',
    structured: '+++801/9924/77382+++',
    code: CODA_TRANSACTION_CODES.DIRECT_DEBIT,
  },
  {
    name: 'GENT SMART CITY VZW',
    iban: 'BE21 0635 5544 3322',
    bic: 'GKCCBEBB',
    amount: 4235.0,
    communication: 'AUDIT INFRASTRUCTURE CLOUD',
    structured: '+++260/0300/10391+++',
    code: CODA_TRANSACTION_CODES.CREDIT_TRANSFER_IN,
  },
  {
    name: 'PAYCONIQ BY BANCONTACT',
    iban: 'BE07 0017 7788 9900',
    bic: 'PCQBBEBB',
    amount: 189.9,
    communication: 'PAYOUT PAYCONIQ COLLECTE JOURNALIERE',
    code: CODA_TRANSACTION_CODES.CARD_PAYMENT,
  },
];

/**
 * Generates a realistic sample Belgian CODA statement for testing & training.
 * The data set is deterministic, so screenshots and unit tests stay stable.
 */
export function generateSampleCodaFile(options: SampleCodaOptions = {}): CodaGenerationResult {
  const bank = BELGIAN_BANKS[options.bankKey ?? 'BNP_PARIBAS_FORTIS'];
  const statementDate = options.statementDate ?? '2026-02-24';
  const count = Math.min(Math.max(options.movementCount ?? 5, 1), SAMPLE_COUNTERPARTIES.length);

  const transactions: CodaTransactionInput[] = SAMPLE_COUNTERPARTIES.slice(0, count).map(
    (sample, index) => {
      const day = new Date(`${statementDate}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - (count - index - 1));
      const entryDate = day.toISOString().substring(0, 10);

      return {
        amount: sample.amount,
        entryDate,
        valutaDate: entryDate,
        counterpartyName: sample.name,
        counterpartyIban: sample.iban,
        counterpartyBic: sample.bic,
        communication: sample.communication,
        structuredCommunication: sample.structured,
        transactionCode: sample.code,
        bankReference: `${bank.bankIdentificationNumber}${statementDate.replace(/-/g, '')}${String(index + 1).padStart(4, '0')}`,
      };
    }
  );

  return generateCodaFile({
    accountHolderName: options.accountHolderName ?? 'BRABO DIGITAL SOLUTIONS SRL',
    accountHolderBce: options.accountHolderBce ?? '0789456123',
    iban: options.iban ?? 'BE68 0012 3456 7890',
    currency: 'EUR',
    bank,
    statementDate,
    statementNumber: options.statementNumber ?? 44,
    oldBalance: options.oldBalance ?? 28450.12,
    creationDate: statementDate,
    addresseeReference: 'BRABO',
    transactions,
  });
}

// ---------------------------------------------------------------------------
// Validation & inspection helpers
// ---------------------------------------------------------------------------

/**
 * Validates a CODA file: record widths, mandatory record sequence and the
 * trailer control totals. Used by the CODA sandbox screen.
 */
export function validateCodaFile(content: string): CodaValidationResult {
  const issues: CodaValidationIssue[] = [];
  const lines = content.split(/\r?\n/).filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      isValid: false,
      issues: [{ lineNumber: 0, recordType: '-', message: 'Fichier CODA vide.' }],
      recordCount: 0,
    };
  }

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const recordType = line.startsWith('2') || line.startsWith('3') ? line.substring(0, 2) : line.charAt(0);

    if (line.length !== CODA_RECORD_LENGTH) {
      issues.push({
        lineNumber,
        recordType,
        message: `Longueur d'enregistrement invalide : ${line.length} caractères au lieu de ${CODA_RECORD_LENGTH}.`,
      });
    }

    if (!/^[0-9]/.test(line)) {
      issues.push({
        lineNumber,
        recordType,
        message: `Type d'enregistrement inconnu : "${line.charAt(0)}".`,
      });
    }
  });

  if (!lines[0]?.startsWith('0')) {
    issues.push({ lineNumber: 1, recordType: '0', message: 'Enregistrement 0 (header) manquant.' });
  }

  if (!lines.some((line) => line.startsWith('1') && !line.startsWith('1', 1))) {
    if (!lines.some((line) => line.charAt(0) === '1')) {
      issues.push({ lineNumber: 2, recordType: '1', message: 'Enregistrement 1 (ancien solde) manquant.' });
    }
  }

  if (!lines.some((line) => line.charAt(0) === '8')) {
    issues.push({
      lineNumber: lines.length,
      recordType: '8',
      message: 'Enregistrement 8 (nouveau solde) manquant.',
    });
  }

  const last = lines[lines.length - 1];
  if (!last?.startsWith('9')) {
    issues.push({
      lineNumber: lines.length,
      recordType: '9',
      message: 'Enregistrement 9 (trailer) manquant ou mal positionné.',
    });
  }

  return { isValid: issues.length === 0, issues, recordCount: lines.length };
}

/**
 * Produces an annotated, human-readable dump of a CODA file — one line per
 * record with its Febelfin meaning. Powers the "explain this CODA" trainer.
 */
export function explainCodaFile(content: string): string[] {
  const labels: Record<string, string> = {
    '0': 'Header — identification du fichier, de la banque et du destinataire',
    '1': 'Ancien solde — compte, devise, n° d’extrait et solde d’ouverture',
    '21': 'Mouvement (partie 1) — séquence, montant, date valeur, code opération',
    '22': 'Mouvement (partie 2) — suite de la communication et BIC contrepartie',
    '23': 'Mouvement (partie 3) — IBAN et nom de la contrepartie',
    '31': 'Information — détail complémentaire lié au mouvement',
    '32': 'Information (suite) — complément de détail',
    '8': 'Nouveau solde — solde de clôture et sa date',
    '9': 'Trailer — nombre d’enregistrements et totaux débit / crédit',
  };

  return content
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line, index) => {
      const twoChar = line.substring(0, 2);
      const key = labels[twoChar] ? twoChar : line.charAt(0);
      const label = labels[key] ?? 'Enregistrement inconnu';
      return `${String(index + 1).padStart(3, '0')} │ ${key.padEnd(2, ' ')} │ ${label}`;
    });
}

/**
 * Extracts the structured communications (OGM) present in a CODA file and
 * validates their modulo-97 key — a quick pre-reconciliation sanity check.
 */
export function extractStructuredCommunications(content: string): {
  raw: string;
  formatted: string;
  isValid: boolean;
}[] {
  const results: { raw: string; formatted: string; isValid: boolean }[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (!line.startsWith('21')) continue;
    // communication type flag sits at index 61 in the 21 record
    if (line.charAt(61) !== '1') continue;

    const commZone = line.substring(63, 78).replace(/[^0-9]/g, '');
    if (commZone.length < 15) continue;

    // '101' prefix + 12 OGM digits
    const digits = commZone.substring(3, 15);
    const formatted = formatOGM(digits);
    results.push({ raw: digits, formatted, isValid: validateOGM(formatted).isValid });
  }

  return results;
}

/** Triggers a browser download of a generated CODA file. */
export function downloadCodaFile(result: CodaGenerationResult): void {
  const blob = new Blob([result.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
