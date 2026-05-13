import { Cite } from 'citation-js';

export type CitationType = 'article-journal' | 'book' | 'paper-conference' | 'webpage' | 'unknown';

export interface ParsedCitation {
  original: string;
  type: CitationType;
  authors: string[];
  year: string;
  title: string;
  journal?: string;
  publisher?: string;
  city?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  url?: string;
  accessDate?: string;
  proceedingName?: string;
  date?: string;
  country?: string;
  isValid: boolean;
}

export function parseRawCitation(line: string): ParsedCitation {
  const trimmed = line.trim();
  let type: CitationType = 'unknown';

  if (!trimmed) {
    return { original: line, type, authors: [], year: '', title: '', isValid: false };
  }

  try {
    new Cite(trimmed);
  } catch (e) {
    // ignore
  }

  let authorsRaw = '';
  let year = '';
  let rest = '';

  // Tangani format APA: (2024) maupun (2024, October) atau (2024, Oktober 12)
  const yearMatch = trimmed.match(/(.*?)\s*\(\s*(\d{4}[a-z]?)\b[^)]*\)[.,]?\s*(.*)/i) ||
    trimmed.match(/(.*?)\s*\.\s+\[?(19\d{2}|20\d{2})[a-z]?\]?\.?\s+(.*)/i);

  if (yearMatch) {
    authorsRaw = yearMatch[1].trim();
    year = yearMatch[2].trim();
    // Clear placeholders like [tahun] or ? or empty so the main logic handles it as missing
    if (!/\d{4}/.test(year)) {
      year = '';
    }
    rest = yearMatch[3].trim();
  } else {
    // Fallback: No year found, try to extract authors and title by the first period
    // that isn't part of an author's initial (e.g. "A.") or followed by "dan", etc.
    const splitMatch = trimmed.match(/^(.*?)\.\s+(?!,|[A-Z]\.|dan\b|and\b|&\b)(.*)$/i);
    if (splitMatch) {
      authorsRaw = splitMatch[1].trim();
      year = '';
      rest = splitMatch[2].trim();
    } else {
      return { original: line, type, authors: [], year: '', title: '', isValid: false };
    }
  }

  let authors: string[] = [];
  if (authorsRaw.toLowerCase().includes('anonim')) {
    authors = ['Anonim'];
  } else {
    const splitRegex = /\s+(?:&|and|dan)\s+|;\s*/i;
    let parts = authorsRaw.split(splitRegex).map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      if (part.split(',').length > 2) {
        const subparts = part.split(/\.,\s*/);
        for (let i = 0; i < subparts.length; i++) {
          let sp = subparts[i].trim();
          if (!sp.endsWith('.') && i !== subparts.length - 1) sp += '.';
          authors.push(sp);
        }
      } else {
        authors.push(part);
      }
    }

    authors = authors.map(a => {
      let clean = a.replace(/^[A-Z]\.,\s*/, '').replace(/,\s*$/, '').trim();
      return clean;
    });
  }

  let title = '';

  // Website
  const urlMatch = rest.match(/(https?:\/\/[^\s]+)/);
  if (urlMatch || rest.toLowerCase().includes('diakses') || rest.toLowerCase().includes('accessed') || rest.toLowerCase().includes('www.')) {
    type = 'webpage';
    let url = urlMatch ? urlMatch[1] : '';
    let accessMatch = rest.match(/diakses\s+([^)]+)/i) || rest.match(/accessed\s+([^)]+)/i) || rest.match(/\(([^)]+)\)\.?$/i);
    let accessDate = accessMatch ? accessMatch[1].trim().replace(/diakses\s+/i, '') : '';

    // Fix: jika URL menelan tanda kurung pembuka (tanggal menempel ke URL tanpa spasi)
    // Contoh: https://...sensor(29 September 2020) → hapus "(29" dari URL
    const incompleteParenInUrl = url.match(/\([^)]*$/);
    if (incompleteParenInUrl) {
      url = url.slice(0, url.lastIndexOf(incompleteParenInUrl[0]));
    }
    // Fallback: jika URL masih mengandung tanda kurung lengkap (akses date terserap)
    if (url && rest.match(/\(([^)]+)\)\.?$/i)) {
      const matchParens = rest.match(/\(([^)]+)\)\.?$/i)!;
      if (url.includes(matchParens[0])) {
        url = url.replace(matchParens[0], '');
      }
    }

    const titleEnd = urlMatch ? rest.indexOf(urlMatch[0]) : rest.length;
    title = rest.substring(0, titleEnd).trim().replace(/[.,]$/, '');

    return { original: line, type, authors, year, title, url, accessDate, isValid: true };
  }

  // Proceeding
  // Pola 1: "Dalam:" atau "In:" (dengan titik dua) – cegah "Indonesian" ikut cocok via \bIn\b
  // Pola 2: "In Prosiding/Proceeding" tanpa titik dua (format APA)
  // Pola 3: langsung dimulai dengan "Prosiding" atau "Proceeding"
  const confMatch = rest.match(/^(.*?)\.\s+(?:Dalam\s*:?\s*|\bIn\b\s*:\s*)(.*)$/i) ||
    rest.match(/^(.*?)\.\s+\bIn\b\s+(Prosiding\b.*|Proceeding\b.*)$/i) ||
    rest.match(/^(.*?)\.\s+(Prosiding\b.*|Proceeding\b.*)$/i);

  if (confMatch) {
    type = 'paper-conference';
    title = confMatch[1].trim();
    let remainder = confMatch[2].trim();

    let proceedingName = remainder;
    let city = '';
    let pages = '';

    const pageMatch = remainder.match(/(?:\(\s*pp\.\s*|,\s*p\.\s*|,\s*|,\s*pp\.\s*|:\s*|,\s*hlm\.\s*|\b)(\d+\s*-\s*\d+)\)?\.?$/i);
    if (pageMatch) {
      pages = pageMatch[1];
      proceedingName = remainder.substring(0, remainder.lastIndexOf(pageMatch[0])).trim().replace(/[.,(]$/, '');
    }
    // Bersihkan sisa volume APA seperti "Kusuma (2" → "Kusuma"
    proceedingName = proceedingName.replace(/\s*\(\s*\d+\s*$/, '').trim();

    let date = '';
    let country = '';

    // Try to extract date and city from proceedingName
    // e.g., "Proceeding Seminar Nasional Teknik dan Manajemen Industri. 12 Februari 2015. Malang, Indonesia"
    const parts = proceedingName.split(/\.\s+/);
    if (parts.length >= 3 && /\d{4}/.test(parts[parts.length - 2])) {
      city = parts.pop()!.trim();
      date = parts.pop()!.trim();
      proceedingName = parts.join('. ').trim();
    } else if (parts.length >= 2 && /\d{4}/.test(parts[parts.length - 1])) {
      date = parts.pop()!.trim();
      proceedingName = parts.join('. ').trim();
    }

    // Pisahkan kota dan negara jika city mengandung koma
    // Contoh: "Malang, Indonesia" → city="Malang", country="Indonesia"
    if (city && city.includes(',')) {
      const cityParts = city.split(/,\s*/);
      city = cityParts[0].trim();
      country = cityParts.slice(1).join(', ').trim();
    }

    // Capitalize proceeding name
    proceedingName = toTitleCase(proceedingName);

    return { original: line, type, authors, year, title, proceedingName, city, country, date, pages, isValid: true };
  }

  // Journal
  const journalEndMatch = rest.match(/(?:(\d+)\s*)?\(\s*([\w\-–\/]+)\s*\)\s*[:,]?\s*([\d\sA-Za-z-–]+)?\.?$/) ||
    rest.match(/vol(?:ume|\.)?\s*(\d+).*?(?:no(?:mor|\.)?\s*([\w\-–\/]+))?.*?([\d\sA-Za-z-–]+)?\.?$/i) ||
    rest.match(/(?:\b(\d+)\b\s*(?:[:,]\s*|\s+))?(\d+\s*-\s*\d+)\.?$/) || // volume, pages (range)
    rest.match(/(?:,\s*|:\s*|\bvol(?:ume|\.)?\s*)(\d+)\.?$/i); // just volume at the end

  if (journalEndMatch && !rest.toLowerCase().includes('press') && !rest.toLowerCase().includes('penerbit')) {
    type = 'article-journal';
    let volume = journalEndMatch[1] || '';
    let issue = '';
    let pages = '';

    if (journalEndMatch[0].includes('(') || (rest.match(/vol/i) && journalEndMatch.length >= 3 && journalEndMatch[2])) {
      issue = journalEndMatch[2] || '';
      pages = journalEndMatch[3] ? journalEndMatch[3].trim() : '';
    } else if (journalEndMatch[0].includes('-')) {
      // Third match case: volume and pages, or just pages
      pages = journalEndMatch[2] ? journalEndMatch[2].trim() : '';
    } else if (journalEndMatch.length >= 2 && journalEndMatch[1]) {
      // Fourth match case: just volume
      volume = journalEndMatch[1];
    }

    let beforeEnd = rest.substring(0, rest.length - journalEndMatch[0].length).trim();
    const splitIndex = Math.max(beforeEnd.lastIndexOf('. '), beforeEnd.lastIndexOf('? '), beforeEnd.lastIndexOf('! '));
    let journalName = '';

    if (splitIndex !== -1) {
      title = beforeEnd.substring(0, splitIndex + 1).trim();
      journalName = beforeEnd.substring(splitIndex + 1).trim();
    } else {
      title = beforeEnd;
    }

    title = title.replace(/\.$/, '');
    journalName = journalName.replace(/[.,]$/, '');

    return { original: line, type, authors, year, title, journal: journalName, volume, issue, pages, isValid: true };
  }

  // Book
  type = 'book';
  let publisher = '';
  let city = '';
  let pages = '';
  let country = '';

  const explicitBookMatch = rest.match(/([^.]+)\.\s*([^,]+),\s*([^,]+),\s*(\d+)\s*(?:hlm|pages|p)\.?/i);

  if (explicitBookMatch) {
    title = explicitBookMatch[1].trim();
    publisher = explicitBookMatch[2].trim();
    city = explicitBookMatch[3].trim();
    pages = explicitBookMatch[4].trim();
  } else {
    let cleanRest = rest.replace(/\.$/, '');
    const dotParts = cleanRest.split(/\.\s+/);

    if (dotParts.length >= 2) {
      let lastPart = dotParts.pop() || '';
      title = dotParts.join('. ').trim();

      if (lastPart.includes(':')) {
        const colonSplit = lastPart.split(/:\s*/);
        city = colonSplit[0].trim();
        publisher = colonSplit[1].trim();

        const pagesMatch = publisher.match(/,\s*(\d+)\s*(?:hlm|pages|p)\.?$/i);
        if (pagesMatch) {
          pages = pagesMatch[1];
          publisher = publisher.replace(pagesMatch[0], '').trim();
        }
      } else {
        const commaSplit = lastPart.split(/,\s*/);
        publisher = commaSplit[0].trim();
        if (commaSplit.length > 1) {
          city = commaSplit[1].trim();
        }

        let areaToExtractPagesFrom = city || publisher;
        const pagesMatch = areaToExtractPagesFrom.match(/(?:,\s*|\s+)(\d+)\s*(?:hlm|pages|p)\.?$/i);
        if (pagesMatch) {
          pages = pagesMatch[1];
          if (city) city = city.replace(pagesMatch[0], '').trim();
          else publisher = publisher.replace(pagesMatch[0], '').trim();
        }
      }
    } else {
      title = cleanRest.trim();
    }
  }

  if (city && city.includes(',')) {
    const cParts = city.split(/,\s*/);
    city = cParts[0].trim();
    country = cParts.slice(1).join(', ').trim();
  }

  return { original: line, type, authors, year, title, city, publisher, pages, country, isValid: true };
}

export function formatAuthorsIndonesian(authors: string[]): string {
  if (!authors || authors.length === 0) return "Anonim.";

  if (authors.length === 1) {
    return authors[0].endsWith('.') ? authors[0] : `${authors[0]}.`;
  }

  if (authors.length === 2) {
    let a1 = authors[0];
    let a2 = authors[1].replace(/\.$/, '');
    return `${a1} dan ${a2}.`;
  }

  const allButLast = authors.slice(0, -1);
  const last = authors[authors.length - 1].replace(/\.$/, '');

  return `${allButLast.join(', ')} dan ${last}.`;
}

function cleanPunctuation(str: string): string {
  return str
    .replace(/\s+/g, ' ')
    .replace(/\.\./g, '.')
    .replace(/,\s*\./g, '.')
    .replace(/:\s*\./g, '.')
    .trim();
}

export function toTitleCase(title: string): string {
  if (!title) return title;
  const exceptions = new Set([
    // Indonesian
    'dan', 'atau', 'tetapi', 'melainkan', 'sedangkan', 'serta', 'lalu', 'kemudian',
    'dengan', 'secara', 'sebagai', 'kepada', 'dari', 'ke', 'oleh', 'pada', 'untuk',
    'tentang', 'bagi', 'dalam', 'antara', 'di', 'yang', 'terhadap',
    // English
    'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'a', 'an', 'the',
    'as', 'at', 'by', 'down', 'in', 'of', 'on', 'to', 'with', 'over', 'into',
    // Singkatan taksonomi — harus tetap lowercase
    'sp', 'spp',
  ]);

  // Split on <i>...</i> blocks agar nama ilmiah tidak ikut di-capitalize
  let isFirstWord = true;
  const segments = title.split(/(<i>.*?<\/i>)/g);
  return segments.map((seg) => {
    if (seg.startsWith('<i>')) return seg; // pertahankan italic apa adanya
    return seg.replace(/[a-zA-Z]+/g, (match) => {
      const isFirst = isFirstWord;
      isFirstWord = false;
      const lowerMatch = match.toLowerCase();
      if (isFirst || !exceptions.has(lowerMatch)) {
        return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
      } else {
        return lowerMatch;
      }
    });
  }).join('');
}

// Kata-kata umum (Indonesia & Inggris) yang tidak boleh dianggap nama ilmiah
const COMMON_WORDS = new Set([
  // Kata hubung & preposisi Indonesia
  'terhadap', 'dengan', 'dalam', 'antara', 'sebagai', 'secara', 'kepada', 'tentang',
  'melalui', 'selama', 'setelah', 'sebelum', 'karena', 'sehingga', 'namun', 'tetapi',
  'bahwa', 'ketika', 'dimana', 'digunakan', 'dilakukan', 'dihasilkan', 'maupun',
  // Kata umum akademik Indonesia
  'penelitian', 'perlakuan', 'kelompok', 'metode', 'analisis', 'sampel', 'parameter',
  'pengamatan', 'penggunaan', 'pemberian', 'pertumbuhan', 'produksi', 'budidaya',
  'peningkatan', 'pengaruh', 'perbandingan', 'evaluasi', 'identifikasi', 'potensi',
  'pengendalian', 'pemeliharaan', 'penambahan', 'pemijahan', 'penetasan', 'perkembangan',
  'pemanfaatan', 'pengembangan', 'penerapan', 'pencegahan', 'penanggulangan',
  'kandungan', 'kualitas', 'kinerja', 'konsumsi', 'konsentrasi', 'kepadatan',
  'kesehatan', 'kecernaan', 'kelangsungan', 'keberlanjutan', 'ketahanan', 'keragaman',
  'perikanan', 'perairan', 'pembenihan', 'pembesaran', 'performa', 'efisiensi',
  'kelulushidupan', 'kelangsunganhidup', 'sintasan', 'mortalitas', 'fekunditas',
  'pendapatan', 'keuntungan', 'kelayakan', 'keberlanjutan', 'produktivitas',
  'suplementasi', 'fermentasi', 'probiotik', 'prebiotik', 'suplemen', 'ekstrak',
  'protein', 'vitamin', 'mineral', 'nutrisi', 'lemak', 'karbohidrat', 'serat',
  'bobot', 'berat', 'kadar', 'tingkat', 'jumlah', 'ukuran', 'panjang', 'lebar',
  'salinitas', 'temperatur', 'oksigen', 'nitrogen', 'amonia', 'nitrit', 'nitrat',
  'kolam', 'tambak', 'keramba', 'tangki', 'akuarium', 'wadah', 'sistem', 'media',
  'pakan', 'pemberian', 'ransum', 'suplemen', 'probiotik', 'mikroba', 'bakteri',
  // Kata umum Inggris akademik
  'analysis', 'growth', 'production', 'effect', 'effects', 'influence', 'impact',
  'quality', 'quantity', 'content', 'method', 'methods', 'results', 'study',
  'review', 'performance', 'treatment', 'control', 'water', 'feed', 'culture',
  'system', 'using', 'based', 'during', 'between', 'among', 'distribution',
  'density', 'protein', 'vitamin', 'mineral', 'survival', 'mortality', 'fecundity',
  'salinity', 'temperature', 'oxygen', 'nitrogen', 'ammonia', 'nitrite', 'nitrate',
  'feeding', 'stocking', 'harvesting', 'management', 'monitoring', 'assessment',
]);

/**
 * Mendeteksi dan membungkus nama ilmiah dengan tag <i>.
 *
 * Pola 1: Genus sp. / Genus spp. (singkatan spesies)
 *   → hanya genus yang italic, "sp."/"spp." tetap biasa
 *   Contoh: Clarias sp.  →  <i>Clarias</i> sp.
 *
 * Pola 2: Binomial nomenclature lengkap (Genus species)
 *   → keduanya italic sebagai satu unit
 *   Contoh: Clarias gariepinus  →  <i>Clarias gariepinus</i>
 *
 * Diterapkan SEBELUM toTitleCase agar case asli terjaga.
 */
export function formatScientificNames(text: string): string {
  if (!text) return text;

  // Pola 1: Genus diikuti sp. / spp. / Sp. / Spp. (case-insensitive pada sp bagian)
  // Hanya genus yang di-italic; "sp."/"spp." dibiarkan apa adanya
  let result = text.replace(
    /\b([A-Z][a-z]{2,})\s+([Ss][Pp][Pp]?\.)/g,
    (_match, genus, sp) => `<i>${genus}</i> ${sp.toLowerCase()}`
  );

  // Pola 2: Binomial nomenclature lengkap
  // (?<!>) mencegah genus yang sudah di dalam <i>...</i> (diawali >) diproses ulang
  result = result.replace(
    /(?<!>)\b([A-Z][a-z]{3,})\s+([a-z]{6,})\b/g,
    (match, genus, species) => {
      if (COMMON_WORDS.has(species)) return match;
      return `<i>${genus} ${species}</i>`;
    }
  );

  return result;
}

export function transformCitation(parsed: ParsedCitation): string {
  if (!parsed.isValid) return parsed.original;

  const authGroup = formatAuthorsIndonesian(parsed.authors);
  // Italic nama ilmiah dulu, baru toTitleCase (agar spesies tidak ikut di-capitalize)
  const formattedTitle = toTitleCase(formatScientificNames(parsed.title));

  if (parsed.type === 'article-journal') {
    const title = formattedTitle ? `${formattedTitle}.` : '[judul].';
    const journal = parsed.journal ? `${parsed.journal}.,` : '[jurnal].,';

    const v = parsed.volume || '[volume]';
    const i = parsed.issue ? `(${parsed.issue})` : '';
    const p = parsed.pages || '[halaman]';
    const volIssuePages = `${v}${i}: ${p}.`;

    return cleanPunctuation(`${authGroup} ${parsed.year || '[tahun]'}. ${title} ${journal} ${volIssuePages}`);
  }

  if (parsed.type === 'book') {
    const title = formattedTitle ? `${formattedTitle}.` : '[judul].';
    let pub = parsed.publisher || '';
    let city = parsed.city || '';

    if (!city && pub) {
      const indonesianCities = ['Jakarta', 'Yogyakarta', 'Bandung', 'Surabaya', 'Semarang', 'Malang', 'Cilacap', 'Medan', 'Makassar', 'Bali', 'Denpasar', 'Surakarta', 'Solo', 'Bogor', 'Depok', 'Tangerang', 'Bekasi'];
      for (const c of indonesianCities) {
        if (pub.toLowerCase().includes(c.toLowerCase())) {
          city = c;
          pub = pub.replace(new RegExp(c, 'i'), '').trim();
          break;
        }
      }
    }

    pub = pub ? pub.replace(/,$/, '').trim() : '[penerbit]';
    city = city ? city.replace(/,$/, '').trim() : '[kota]';
    const pages = parsed.pages ? `${parsed.pages} hlm.` : '[halaman] hlm.';

    return cleanPunctuation(`${authGroup} ${parsed.year || '[tahun]'}. ${title} ${pub}, ${city}, ${pages}`);
  }

  if (parsed.type === 'paper-conference') {
    const title = formattedTitle ? `${formattedTitle}.` : '[judul].';
    const proc = parsed.proceedingName ? `${parsed.proceedingName}.` : '[nama prosiding].';
    const date = parsed.date ? `${parsed.date}.` : '[tanggal prosiding].';
    const cityCountry = [parsed.city, parsed.country].filter(Boolean).join(', ') || '[kota, negara]';
    const pages = parsed.pages ? `pp. ${parsed.pages}` : 'pp. [halaman]';

    return cleanPunctuation(`${authGroup} ${parsed.year || '[tahun]'}. ${title} Dalam: ${proc} ${date} ${cityCountry}, ${pages}.`);
  }

  if (parsed.type === 'webpage') {
    const title = formattedTitle ? `${formattedTitle}.` : '[judul].';
    const url = parsed.url ? parsed.url : '[url]';
    // Pedoman: tidak ada spasi antara URL dan (tanggal akses)
    const access = parsed.accessDate ? `(${parsed.accessDate}).` : '([tanggal akses]).';

    return cleanPunctuation(`${authGroup} ${parsed.year || '[tahun]'}. ${title} ${url}${access}`);
  }

  return parsed.original;
}

export function transformWithTemplate(parsed: ParsedCitation, template: string): string {
  if (!parsed.isValid) return parsed.original;

  const authGroup = formatAuthorsIndonesian(parsed.authors);
  // Italic nama ilmiah dulu, baru toTitleCase (agar spesies tidak ikut di-capitalize)
  const formattedTitle = toTitleCase(formatScientificNames(parsed.title));

  let result = template;
  result = result.replace(/\{authors\}/g, authGroup);
  result = result.replace(/\{year\}/g, parsed.year || '[tahun]');
  result = result.replace(/\{title\}/g, formattedTitle || '[judul]');
  result = result.replace(/\{journal\}/g, formatScientificNames(parsed.journal || '') || '[jurnal]');
  result = result.replace(/\{volume\}/g, parsed.volume || '[volume]');
  result = result.replace(/\{issue\}/g, parsed.issue || '[issue]');
  result = result.replace(/\{pages\}/g, parsed.pages || '[halaman]');

  // book city extraction logic (same as transformCitation logic)
  let pub = parsed.publisher || '';
  let city = parsed.city || '';
  let country = parsed.country || '';
  if (!city && pub) {
    const indonesianCities = ['Jakarta', 'Yogyakarta', 'Bandung', 'Surabaya', 'Semarang', 'Malang', 'Cilacap', 'Medan', 'Makassar', 'Bali', 'Denpasar', 'Surakarta', 'Solo', 'Bogor', 'Depok', 'Tangerang', 'Bekasi'];
    for (const c of indonesianCities) {
      if (pub.toLowerCase().includes(c.toLowerCase())) {
        city = c;
        pub = pub.replace(new RegExp(c, 'i'), '').trim();
        break;
      }
    }
  }

  result = result.replace(/\{publisher\}/g, pub || '[penerbit]');
  result = result.replace(/\{city\}/g, city || '[kota]');
  result = result.replace(/\{country\}/g, country || '[negara]');
  result = result.replace(/\{url\}/g, parsed.url || '[url]');
  result = result.replace(/\{accessDate\}/g, parsed.accessDate || '[tanggal akses]');
  result = result.replace(/\{proceedingName\}/g, formatScientificNames(parsed.proceedingName || '') || '[nama prosiding]');
  result = result.replace(/\{date\}/g, parsed.date || '[tanggal prosiding]');

  // Clean empty issue parentheses if it has [?] within
  result = result.replace(/\(\[\?\]\)/g, '');
  // Clean double commas/dots etc if any left over by empty ? replacements (optional)
  // Actually, we use cleanPunctuation to help with that.
  return cleanPunctuation(result);
}
