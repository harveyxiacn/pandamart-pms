import type { OcrDocument, OcrLine, OcrPage, OcrWord } from './types';

const CJK = /[㐀-鿿豈-﫿]/;

function isCjkChar(char: string | undefined): boolean {
  return !!char && CJK.test(char);
}

/** 中文 OCR 常把每个字当成一个 word，直接空格拼接会得到「生 姜」；按字符类型决定是否加空格。 */
export function joinOcrWords(words: OcrWord[]): string {
  let result = '';
  for (const word of words) {
    const token = (word.text || '').trim();
    if (!token) continue;
    if (!result) {
      result = token;
      continue;
    }
    const prev = result[result.length - 1];
    const next = token[0];
    result += isCjkChar(prev) && isCjkChar(next) ? token : ` ${token}`;
  }
  return result;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function finalizePage(pageNumber: number, words: OcrWord[]): OcrPage {
  const lines = new Map<string, OcrWord[]>();
  // parseTesseractTsv 会按 Tesseract 的 line 分组先排好序，这里保持插入顺序
  for (const word of words) {
    const key = (word as OcrWord & { groupKey?: string }).groupKey || '0';
    const bucket = lines.get(key);
    if (bucket) bucket.push(word);
    else lines.set(key, [word]);
  }

  const built: OcrLine[] = [];
  for (const group of lines.values()) {
    const text = joinOcrWords(group);
    if (!text) continue;
    const left = Math.min(...group.map((word) => word.left));
    const top = Math.min(...group.map((word) => word.top));
    const right = Math.max(...group.map((word) => word.left + word.width));
    const bottom = Math.max(...group.map((word) => word.top + word.height));
    const validConf = group.filter((word) => word.confidence > 0);
    const confidence =
      validConf.length > 0
        ? validConf.reduce((sum, word) => sum + word.confidence, 0) / validConf.length
        : 0;
    built.push({ text, top, bottom, left, right, confidence, words: group });
  }

  built.sort((a, b) => a.top - b.top || a.left - b.left);

  const width = built.reduce((max, line) => Math.max(max, line.right), 0);
  const height = built.reduce((max, line) => Math.max(max, line.bottom), 0);
  const validLines = built.filter((line) => line.confidence > 0);
  const confidence =
    validLines.length > 0
      ? validLines.reduce((sum, line) => sum + line.confidence, 0) / validLines.length
      : 0;

  return {
    pageNumber,
    width,
    height,
    confidence,
    lines: built,
    text: built.map((line) => line.text).join('\n'),
  };
}

/**
 * 解析 `tesseract image stdout ... tsv` 的输出。
 * 只用 level=5（word）行，按 page/block/par/line 重组，保留坐标供表格列识别。
 */
export function parseTesseractTsv(tsv: string): OcrDocument {
  const rows = tsv.split(/\r?\n/);
  if (rows.length < 2) {
    return { pages: [], text: '', confidence: 0 };
  }

  const header = rows[0].split('\t');
  const index = (name: string) => header.indexOf(name);
  const col = {
    level: index('level'),
    page: index('page_num'),
    block: index('block_num'),
    par: index('par_num'),
    line: index('line_num'),
    word: index('word_num'),
    left: index('left'),
    top: index('top'),
    width: index('width'),
    height: index('height'),
    conf: index('conf'),
    text: index('text'),
  };

  if (col.level < 0 || col.text < 0) {
    return { pages: [], text: '', confidence: 0 };
  }

  const byPage = new Map<number, OcrWord[]>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i].split('\t');
    if (cells.length <= col.text) continue;
    if (cells[col.level] !== '5') continue;

    const text = decodeEntities(cells.slice(col.text).join('\t')).trim();
    if (!text) continue;

    const confidence = Number(cells[col.conf]);
    const word: OcrWord & { groupKey?: string } = {
      text,
      left: Number(cells[col.left]) || 0,
      top: Number(cells[col.top]) || 0,
      width: Number(cells[col.width]) || 0,
      height: Number(cells[col.height]) || 0,
      confidence: Number.isFinite(confidence) && confidence > 0 ? confidence : 0,
      groupKey: `${cells[col.page] || '1'}:${cells[col.block] || '0'}:${cells[col.par] || '0'}:${cells[col.line] || '0'}`,
    };

    const pageNumber = Number(cells[col.page]) || 1;
    const pageWords = byPage.get(pageNumber);
    if (pageWords) pageWords.push(word);
    else byPage.set(pageNumber, [word]);
  }

  const pages = [...byPage.entries()]
    .sort(([a], [b]) => a - b)
    .map(([pageNumber, words]) => finalizePage(pageNumber, words));

  const text = pages.map((page) => page.text).join('\n\n');
  const validPages = pages.filter((page) => page.confidence > 0);
  const confidence =
    validPages.length > 0
      ? validPages.reduce((sum, page) => sum + page.confidence, 0) / validPages.length
      : 0;

  return { pages, text, confidence };
}

/**
 * 文本型 PDF 没有坐标。这里按字符位置伪造轻量坐标：
 * 提取工具通常会保留空格，因此「列位置」仍然有意义，可复用表格解析器。
 */
export function documentFromText(text: string): OcrDocument {
  const rawLines = text.split(/\r?\n/);
  const lines: OcrLine[] = [];
  let top = 0;

  for (const rawLine of rawLines) {
    const line = rawLine.replace(/\t/g, '    ').trimEnd();
    if (!line.trim()) continue;

    const words: OcrWord[] = [];
    const tokenRegex = /\S+/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(line))) {
      words.push({
        text: match[0],
        left: match.index * 8,
        top,
        width: match[0].length * 8,
        height: 16,
        confidence: 100,
      });
    }

    if (words.length === 0) continue;
    const textValue = joinOcrWords(words);
    lines.push({
      text: textValue,
      top,
      bottom: top + 16,
      left: Math.min(...words.map((word) => word.left)),
      right: Math.max(...words.map((word) => word.left + word.width)),
      confidence: 100,
      words,
    });
    top += 22;
  }

  const page: OcrPage = {
    pageNumber: 1,
    width: lines.reduce((max, line) => Math.max(max, line.right), 0),
    height: lines.reduce((max, line) => Math.max(max, line.bottom), 0),
    confidence: 100,
    lines,
    text: lines.map((line) => line.text).join('\n'),
  };

  return { pages: [page], text: page.text, confidence: 100 };
}

/** 按竖直方向把相邻 line 合并成视觉行，用于处理 Tesseract 把一行表格切成多个 line 的情况。 */
export function mergeVisualLines(lines: OcrLine[]): OcrLine[] {
  if (lines.length <= 1) return lines;

  const sorted = [...lines].sort((a, b) => a.top - b.top || a.left - b.left);
  const heights = sorted.map((line) => Math.max(1, line.bottom - line.top)).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 16;
  const tolerance = Math.max(6, medianHeight * 0.55);

  const merged: OcrLine[] = [];
  for (const line of sorted) {
    const current = merged[merged.length - 1];
    if (!current) {
      merged.push({ ...line, words: [...line.words] });
      continue;
    }

    const overlap = Math.min(current.bottom, line.bottom) - Math.max(current.top, line.top);
    const minHeight = Math.min(current.bottom - current.top, line.bottom - line.top);
    if (overlap > minHeight * 0.5 || Math.abs(current.top - line.top) <= tolerance) {
      const words = [...current.words, ...line.words].sort((a, b) => a.left - b.left);
      merged[merged.length - 1] = {
        text: joinOcrWords(words),
        top: Math.min(current.top, line.top),
        bottom: Math.max(current.bottom, line.bottom),
        left: Math.min(current.left, line.left),
        right: Math.max(current.right, line.right),
        confidence:
          current.confidence > 0 && line.confidence > 0
            ? (current.confidence + line.confidence) / 2
            : current.confidence || line.confidence,
        words,
      };
    } else {
      merged.push({ ...line, words: [...line.words] });
    }
  }

  return merged;
}
