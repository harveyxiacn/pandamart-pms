import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import logger from '../utils/logger';
import { parseTesseractTsv } from './document';
import type { LocalOcrStatus, OcrDocument, OcrPage } from './types';

const CACHE_MS = 60_000;
const TESSERACT_TIMEOUT_MS = 120_000;
const PDF_RENDER_TIMEOUT_MS = 90_000;
const MAX_TSV_BYTES = 32 * 1024 * 1024;

export class LocalOcrUnavailableError extends Error {
  code = 'LOCAL_OCR_UNAVAILABLE';
  statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = 'LocalOcrUnavailableError';
  }
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  error: Error | null;
}

function binaryFromEnv(name: string, fallback: string): string {
  return (process.env[name] || '').trim() || fallback;
}

function requestedLanguages(): string {
  return (process.env.TESSERACT_LANG || 'eng+chi_sim').trim() || 'eng';
}

function tesseractBinary(): string {
  return binaryFromEnv('TESSERACT_BIN', 'tesseract');
}

function pdftoppmBinary(): string {
  return binaryFromEnv('PDFTOPPM_BIN', 'pdftoppm');
}

function run(binary: string, args: string[], timeoutMs: number, maxBuffer = 8 * 1024 * 1024): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, maxBuffer, encoding: 'utf8', windowsHide: true },
      (error, stdout, stderr) => {
        const err = error as (Error & { code?: string | number }) | null;
        if (err && (err.code === 'ENOENT' || err.code === 'EACCES')) {
          reject(new LocalOcrUnavailableError(`未找到可执行程序：${binary}`));
          return;
        }
        resolve({
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          code: err ? Number(err.code) || 1 : 0,
          error: err,
        });
      }
    );
  });
}

let statusCache: { at: number; value: LocalOcrStatus } | null = null;

export async function getLocalOcrStatus(force = false): Promise<LocalOcrStatus> {
  if (!force && statusCache && Date.now() - statusCache.at < CACHE_MS) {
    return statusCache.value;
  }

  const binary = tesseractBinary();
  const renderer = pdftoppmBinary();
  let version: string | null = null;
  let languages: string[] = [];
  let available = false;
  let rendererAvailable = false;

  try {
    const result = await run(binary, ['--version'], 10_000);
    const output = `${result.stdout}\n${result.stderr}`;
    version = output.match(/tesseract\s+v?([\w.-]+)/i)?.[1] || output.split('\n')[0]?.trim() || null;
    available = result.code === 0 || Boolean(version);
  } catch (err) {
    logger.debug(`本地 OCR 不可用: ${(err as Error).message}`);
  }

  if (available) {
    try {
      const result = await run(binary, ['--list-langs'], 10_000);
      languages = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/list of available/i.test(line))
        .flatMap((line) => line.split(/\s+/))
        .filter(Boolean);
    } catch {
      languages = [];
    }
  }

  try {
    const result = await run(renderer, ['-v'], 10_000);
    rendererAvailable = result.code === 0 || /pdftoppm/i.test(`${result.stdout}${result.stderr}`);
  } catch {
    rendererAvailable = false;
  }

  const requested = requestedLanguages();
  const wanted = requested.split('+').filter(Boolean);
  const usable = languages.length > 0 ? wanted.filter((lang) => languages.includes(lang)) : wanted;
  const effective = usable.length > 0 ? usable.join('+') : languages.includes('eng') ? 'eng' : requested;

  const message = available
    ? `本地 OCR 可用（Tesseract ${version || 'unknown'}，语言 ${effective}）`
    : '本地 OCR 不可用：未检测到 tesseract 可执行程序';

  const value: LocalOcrStatus = {
    available,
    engine: 'tesseract',
    binary,
    version,
    languages,
    requestedLanguages: effective,
    pdfRenderer: { available: rendererAvailable, binary: renderer },
    message,
    installHint:
      'Ubuntu/Debian: apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-chi-sim poppler-utils；' +
      'macOS: brew install tesseract tesseract-lang poppler；Windows: 安装 Tesseract 与 Poppler 并加入 PATH。',
  };

  statusCache = { at: Date.now(), value };
  return value;
}

async function preprocessImage(inputPath: string, outputPath: string): Promise<void> {
  const image = sharp(inputPath, { failOn: 'none' }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 0;

  let pipeline = sharp(inputPath, { failOn: 'none' }).rotate().grayscale().normalize();
  if (width > 0 && width < 1500) {
    pipeline = pipeline.resize({ width: Math.min(2800, Math.round(width * 2)), withoutEnlargement: false });
  } else if (width > 2800) {
    pipeline = pipeline.resize({ width: 2800, withoutEnlargement: true });
  }

  await pipeline.sharpen({ sigma: 0.6 }).png({ compressionLevel: 6 }).toFile(outputPath);
}

async function renderPdfPages(filePath: string, outputDir: string, maxPages: number, format: 'png' | 'jpeg'): Promise<string[]> {
  const status = await getLocalOcrStatus();
  if (!status.pdfRenderer.available) {
    throw new LocalOcrUnavailableError('扫描版 PDF 需要 poppler-utils（pdftoppm）才能转为图片');
  }

  const prefix = path.join(outputDir, 'page');
  const result = await run(
    status.pdfRenderer.binary,
    ['-r', '300', `-${format}`, '-f', '1', '-l', String(maxPages), filePath, prefix],
    PDF_RENDER_TIMEOUT_MS
  );
  if (result.code !== 0) {
    throw new Error(`PDF 转图片失败：${(result.stderr || result.error?.message || '').slice(0, 300)}`);
  }

  const entries = await fs.readdir(outputDir);
  return entries
    .filter((name) => name.startsWith('page-') && (format === 'png' ? name.endsWith('.png') : /\.jpe?g$/i.test(name)))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)\./)?.[1] || 0);
      const nb = Number(b.match(/(\d+)\./)?.[1] || 0);
      return na - nb;
    })
    .map((name) => path.join(outputDir, name));
}

async function recognizePage(imagePath: string, languages: string): Promise<OcrDocument> {
  const psm = (process.env.TESSERACT_PSM || '6').trim() || '6';
  const status = await getLocalOcrStatus();
  if (!status.available) {
    throw new LocalOcrUnavailableError(status.message);
  }

  const runOnce = (langs: string) =>
    run(
      status.binary,
      [imagePath, 'stdout', '-l', langs, '--oem', '1', '--psm', psm, '--dpi', '300', '-c', 'preserve_interword_spaces=1', 'tsv'],
      TESSERACT_TIMEOUT_MS,
      MAX_TSV_BYTES
    );

  let result = await runOnce(languages);
  if (result.code !== 0 && languages.includes('chi_sim') && status.languages.includes('eng')) {
    // 服务器只装了英文语言包时不要让整张发票失败
    logger.warn(`Tesseract 语言包 ${languages} 不可用，退回 eng 重试`);
    result = await runOnce('eng');
  }

  if (result.code !== 0) {
    throw new Error(`Tesseract 识别失败：${(result.stderr || result.error?.message || '').slice(0, 300)}`);
  }

  const document = parseTesseractTsv(result.stdout);
  if (!document.text.trim()) {
    throw new Error('Tesseract 未识别到文字，请检查图片清晰度或更换扫描件');
  }
  return document;
}

function mergeDocuments(documents: OcrDocument[]): OcrDocument {
  const pages: OcrPage[] = [];
  documents.forEach((document) => {
    document.pages.forEach((page) => {
      pages.push({ ...page, pageNumber: pages.length + 1 });
    });
  });

  const totalWords = pages.reduce(
    (sum, page) => sum + page.lines.reduce((lineSum, line) => lineSum + line.words.length, 0),
    0
  );
  const weighted = pages.reduce(
    (sum, page) =>
      sum +
      page.lines.reduce(
        (lineSum, line) => lineSum + line.words.reduce((wordSum, word) => wordSum + word.confidence, 0),
        0
      ),
    0
  );

  return {
    pages,
    text: pages.map((page) => page.text).join('\n\n'),
    confidence: totalWords > 0 ? weighted / totalWords : 0,
  };
}

export const tesseractProvider = {
  getStatus: getLocalOcrStatus,

  async recognize(filePath: string, fileType: 'image' | 'pdf'): Promise<OcrDocument> {
    const status = await getLocalOcrStatus();
    if (!status.available) {
      throw new LocalOcrUnavailableError(`${status.message}。${status.installHint}`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pandapms-ocr-'));
    try {
      let imagePaths: string[];
      if (fileType === 'pdf') {
        imagePaths = await renderPdfPages(filePath, tempDir, Math.max(1, Number(process.env.LOCAL_OCR_MAX_PAGES) || 3), 'png');
        if (imagePaths.length === 0) throw new Error('PDF 未能渲染出页面');
      } else {
        const prepared = path.join(tempDir, 'page-1.png');
        await preprocessImage(filePath, prepared);
        imagePaths = [prepared];
      }

      const documents: OcrDocument[] = [];
      for (let i = 0; i < imagePaths.length; i++) {
        const prepared = path.join(tempDir, `ready-${i + 1}.png`);
        await preprocessImage(imagePaths[i], prepared);
        documents.push(await recognizePage(prepared, status.requestedLanguages));
      }

      const merged = mergeDocuments(documents);
      logger.info(
        `本地 OCR 完成: ${path.basename(filePath)} pages=${merged.pages.length} confidence=${merged.confidence.toFixed(1)}`
      );
      return merged;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },

  /** 供 LLM Vision 降级使用：只渲染第一页，避免把 PDF 字节直接当图片发给模型。 */
  async renderFirstPageJpeg(filePath: string, dpi = 200): Promise<{ base64: string; mimeType: string }> {
    const status = await getLocalOcrStatus();
    if (!status.pdfRenderer.available) {
      throw new LocalOcrUnavailableError('PDF 转图片失败：未安装 poppler-utils');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pandapms-pdf-'));
    try {
      const prefix = path.join(tempDir, 'page');
      const result = await run(
        status.pdfRenderer.binary,
        ['-jpeg', '-r', String(dpi), '-f', '1', '-l', '1', '-singlefile', filePath, prefix],
        PDF_RENDER_TIMEOUT_MS
      );
      if (result.code !== 0) {
        throw new Error(`PDF 转图片失败：${(result.stderr || result.error?.message || '').slice(0, 300)}`);
      }
      const jpegPath = `${prefix}.jpg`;
      const buffer = await fs.readFile(jpegPath);
      return { base64: buffer.toString('base64'), mimeType: 'image/jpeg' };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
};
