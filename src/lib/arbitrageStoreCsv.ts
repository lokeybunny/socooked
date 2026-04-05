export interface ParsedArbitrageStore {
  store_name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
}

const AREA_CODE_REGEX = /^\(?\d{3}\)?$/;
const LOCAL_PHONE_REGEX = /^\d{3}[-.\s]?\d{4}$/;
const URL_REGEX = /^(https?:\/\/|www\.)/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeText = (value: string) =>
  normalizeSpaces(
    value
      .toLowerCase()
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\bboulevard\b/g, 'blvd')
      .replace(/\bstreet\b/g, 'st')
      .replace(/\broad\b/g, 'rd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\blane\b/g, 'ln')
      .replace(/\bcourt\b/g, 'ct')
      .replace(/\bplace\b/g, 'pl')
      .replace(/\bcircle\b/g, 'cir')
      .replace(/\bsuite\b/g, 'ste')
      .replace(/[^a-z0-9]+/g, ' ')
  );

export const normalizeArbitrageAddress = (value: string | null | undefined) => normalizeText(value ?? '');

export const normalizeArbitrageStoreKey = (storeName: string, address: string | null | undefined) =>
  `${normalizeText(storeName)}|||${normalizeArbitrageAddress(address)}`;

const detectDelimiter = (line: string) => ((line.match(/;/g)?.length ?? 0) > (line.match(/,/g)?.length ?? 0) ? ';' : ',');

const parseDelimitedLine = (line: string, delimiter: string): string[] => {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
};

const formatPhone = (areaCode: string | null | undefined, localNumber: string | null | undefined) => {
  const digits = `${areaCode ?? ''}${localNumber ?? ''}`.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  const fallback = normalizeSpaces([areaCode, localNumber].filter(Boolean).join(' '));
  return fallback || null;
};

const cleanStoreName = (value: string) =>
  normalizeSpaces(
    value
      .replace(/\s*-0\s*/g, ' - ')
      .replace(/\s*&\s*/g, ' & ')
      .replace(/\s*\/\s*/g, ' / ')
  );

const parseSemicolonStoreRow = (columns: string[]): ParsedArbitrageStore | null => {
  const cells = columns.map(cell => cell.trim()).filter(Boolean);
  if (!cells.length) return null;

  const areaCodeIndex = cells.findIndex(cell => AREA_CODE_REGEX.test(cell));
  if (areaCodeIndex <= 0) return null;

  const phoneIndex = cells.findIndex((cell, index) => index > areaCodeIndex && LOCAL_PHONE_REGEX.test(cell));
  const websiteIndex = cells.findIndex((cell, index) => index > areaCodeIndex && URL_REGEX.test(cell));
  const emailIndex = cells.findIndex((cell, index) => index > areaCodeIndex && EMAIL_REGEX.test(cell));
  const addressStartIndex = Math.max(areaCodeIndex, phoneIndex, websiteIndex, emailIndex) + 1;
  const address = cells.slice(addressStartIndex).find(cell => !URL_REGEX.test(cell) && !EMAIL_REGEX.test(cell)) ?? null;
  const storeName = cleanStoreName(cells.slice(0, areaCodeIndex).join(' '));

  if (!storeName) return null;

  return {
    store_name: storeName,
    address,
    contact_name: null,
    contact_phone: formatPhone(cells[areaCodeIndex], phoneIndex >= 0 ? cells[phoneIndex] : null),
    email: emailIndex >= 0 ? cells[emailIndex] : null,
    website: websiteIndex >= 0 ? cells[websiteIndex] : null,
    notes: null,
  };
};

const findHeaderIndex = (headers: string[], patterns: RegExp[]) =>
  headers.findIndex(header => patterns.some(pattern => pattern.test(header)));

const parseHeaderMappedRows = (lines: string[], delimiter: string): ParsedArbitrageStore[] => {
  const headers = parseDelimitedLine(lines[0], delimiter).map(header => header.toLowerCase());
  const nameIndex = findHeaderIndex(headers, [/business.?name/i, /store.?name/i, /^name$/i, /company/i, /shop/i]);
  const addressIndex = findHeaderIndex(headers, [/physical.?address/i, /address/i, /street/i, /location/i]);
  const contactIndex = findHeaderIndex(headers, [/contact.?name/i, /owner/i, /person/i]);
  const areaCodeIndex = findHeaderIndex(headers, [/area.?code/i]);
  const phoneIndex = findHeaderIndex(headers, [/phone.?number/i, /phone/i, /tel/i, /mobile/i]);
  const emailIndex = findHeaderIndex(headers, [/email/i, /e-?mail/i]);
  const websiteIndex = findHeaderIndex(headers, [/website/i, /web/i, /url/i, /site/i]);
  const notesIndex = findHeaderIndex(headers, [/notes?/i, /description/i, /comments?/i]);

  if (nameIndex === -1 && addressIndex === -1) return [];

  return lines
    .slice(1)
    .map(line => parseDelimitedLine(line, delimiter))
    .map(columns => {
      const storeName = cleanStoreName((nameIndex >= 0 ? columns[nameIndex] : '') || (addressIndex >= 0 ? columns[addressIndex] : '') || '');
      if (!storeName) return null;

      return {
        store_name: storeName,
        address: addressIndex >= 0 ? columns[addressIndex] || null : null,
        contact_name: contactIndex >= 0 ? columns[contactIndex] || null : null,
        contact_phone: formatPhone(areaCodeIndex >= 0 ? columns[areaCodeIndex] : null, phoneIndex >= 0 ? columns[phoneIndex] : null),
        email: emailIndex >= 0 ? columns[emailIndex] || null : null,
        website: websiteIndex >= 0 ? columns[websiteIndex] || null : null,
        notes: notesIndex >= 0 ? columns[notesIndex] || null : null,
      } satisfies ParsedArbitrageStore;
    })
    .filter((row): row is ParsedArbitrageStore => Boolean(row));
};

const mergeParsedStores = (current: ParsedArbitrageStore, incoming: ParsedArbitrageStore): ParsedArbitrageStore => ({
  store_name: current.store_name || incoming.store_name,
  address: current.address || incoming.address,
  contact_name: current.contact_name || incoming.contact_name,
  contact_phone: current.contact_phone || incoming.contact_phone,
  email: current.email || incoming.email,
  website: current.website || incoming.website,
  notes: current.notes || incoming.notes,
});

export const parseArbitrageStoresCsv = (text: string): ParsedArbitrageStore[] => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const parsedRows = delimiter === ';'
    ? lines.slice(1)
        .map(line => parseSemicolonStoreRow(parseDelimitedLine(line, delimiter)))
        .filter((row): row is ParsedArbitrageStore => Boolean(row))
    : parseHeaderMappedRows(lines, delimiter);

  const deduped = new Map<string, ParsedArbitrageStore>();

  for (const row of parsedRows) {
    const key = normalizeArbitrageStoreKey(row.store_name, row.address);
    const existing = deduped.get(key);
    deduped.set(key, existing ? mergeParsedStores(existing, row) : row);
  }

  return Array.from(deduped.values());
};
