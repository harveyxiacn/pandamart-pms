// 浏览器内发票 OCR（GitHub Pages 演示专用）。
//
// GitHub Pages 只能托管静态文件，跑不了服务端 Tesseract，所以演示站改用
// Tesseract.js（WASM）在浏览器里识别，再把 TSV 交给与 server/src/ocr/
// 同一套确定性解析器。首次识别会从 jsDelivr 下载 core 与语言包
// （eng + chi_sim，约 20MB），之后由浏览器缓存。
//
// 解析器是移植过来的纯函数副本；改动服务端 invoice-parser.ts 时请同步
// client/src/demo/ocr/invoice-parser.ts。

import { documentFromText, parseTesseractTsv } from "./document";
import { parseInvoiceDocument, parseInvoiceText } from "./invoice-parser";
import type {
  InvoiceParseResult,
  KnownSupplier,
  OcrDocument,
} from "./types";

export const DEMO_OCR_LANGUAGES = "eng+chi_sim";

const MIN_IMAGE_WIDTH = 1500;
const MAX_IMAGE_WIDTH = 2800;
const MAX_PDF_WIDTH = 2400;

export interface DemoOcrProgress {
  percent: number;
  message: string;
}

export interface DemoOcrOutcome {
  parsed: InvoiceParseResult;
  engine: "tesseract.js";
  durationMs: number;
  pageCount: number;
  text: string;
}

interface TesseractWorker {
  recognize(
    image: Blob | File | string,
    options?: Record<string, unknown>,
    output?: Record<string, boolean>
  ): Promise<{ data: { text?: string; tsv?: string } }>;
  terminate(): Promise<unknown>;
}

interface TesseractModule {
  createWorker(
    langs: string,
    oem: number,
    options?: Record<string, unknown>
  ): Promise<TesseractWorker>;
}

let workerPromise: Promise<TesseractWorker> | null = null;
let progressSink: ((progress: DemoOcrProgress) => void) | null = null;

function emitProgress(percent: number, message: string) {
  progressSink?.({ percent: Math.max(0, Math.min(99, Math.round(percent))), message });
}

/** tesseract.js 的 logger 只给英文状态，这里翻译成用户看得懂的中文和进度。 */
function mapLogger(status: string, progress: number): DemoOcrProgress {
  const value = progress * 100;
  const key = status.toLowerCase();
  if (key.includes("loading tesseract core")) {
    return { percent: 5 + value * 0.15, message: "加载 OCR 引擎" };
  }
  if (key.includes("loading language") || key.includes("loading traineddata")) {
    return { percent: 20 + value * 0.35, message: "下载/加载语言包（首次较慢）" };
  }
  if (key.includes("initializing") || key.includes("initialized")) {
    return { percent: 55 + value * 0.05, message: "初始化识别引擎" };
  }
  if (key.includes("recognizing")) {
    return { percent: 60 + value * 0.35, message: "识别发票文字" };
  }
  return { percent: 10 + value * 0.8, message: "准备 OCR" };
}

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const tesseract = (await import("tesseract.js")) as unknown as TesseractModule;
      // OEM 1 = LSTM only，与服务端 CLI 的 --oem 1 一致。
      return tesseract.createWorker(DEMO_OCR_LANGUAGES, 1, {
        logger: (message: { status: string; progress: number }) => {
          const mapped = mapLogger(message.status, message.progress);
          progressSink?.(mapped);
        },
        errorHandler: (error: unknown) => {
          console.warn("[demo-ocr]", error);
        },
      });
    })().catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("图片转换失败"))),
      "image/png"
    );
  });
}

/** 图片预处理：灰度、放大过小的图、限制最大宽度（与服务端 Sharp 流程思路一致）。 */
async function normalizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    if (width < MIN_IMAGE_WIDTH) {
      width = Math.min(MAX_IMAGE_WIDTH, Math.round(bitmap.width * 2));
    } else if (width > MAX_IMAGE_WIDTH) {
      width = MAX_IMAGE_WIDTH;
    }
    const height = Math.max(1, Math.round((bitmap.height / bitmap.width) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas");
    ctx.filter = "grayscale(1) contrast(1.15)";
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    bitmap.close();
  }
}

/** pdf.js 6 用了较新的 TypedArray 方法，旧浏览器需要补齐后才能渲染 PDF。 */
function installTypedArrayPolyfills(): void {
  const proto = Uint8Array.prototype as Uint8Array & {
    toHex?: () => string;
    toBase64?: () => string;
  };
  if (typeof proto.toHex !== "function") {
    Object.defineProperty(proto, "toHex", {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let output = "";
        for (const byte of this) output += byte.toString(16).padStart(2, "0");
        return output;
      },
    });
  }
  if (typeof proto.toBase64 !== "function") {
    Object.defineProperty(proto, "toBase64", {
      configurable: true,
      writable: true,
      value(this: Uint8Array) {
        let binary = "";
        for (const byte of this) binary += String.fromCharCode(byte);
        return btoa(binary);
      },
    });
  }
}

/** 扫描版/普通 PDF：用 pdf.js 渲染第一页为 PNG（服务端对应 pdftoppm）。 */
async function renderPdfFirstPage(file: File): Promise<Blob> {
  installTypedArrayPolyfills();
  // legacy build 自带旧浏览器 polyfill（worker 线程里也需要，主线程补不了）。
  const [pdfjs, workerModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(1.5, MAX_PDF_WIDTH / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持 Canvas");
    await page.render({ canvas, viewport }).promise;
    return await canvasToBlob(canvas);
  } finally {
    await loadingTask.destroy();
  }
}

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function demoOcrSupported(file: File): boolean {
  return file.type.startsWith("image/") || isPdf(file);
}

export async function recognizeInvoiceInBrowser(
  file: File,
  knownSuppliers: KnownSupplier[],
  onProgress?: (progress: DemoOcrProgress) => void
): Promise<DemoOcrOutcome> {
  const startedAt = performance.now();
  progressSink = onProgress ?? null;
  emitProgress(3, "准备文件");

  try {
    const image = isPdf(file) ? await renderPdfFirstPage(file) : await normalizeImage(file);
    emitProgress(6, "图片预处理完成");

    const worker = await getWorker();
    emitProgress(60, "识别发票文字");
    const result = await worker.recognize(image, {}, { tsv: true });
    emitProgress(96, "整理发票明细");

    const text = result.data.text ?? "";
    const tsv = result.data.tsv ?? "";
    let document: OcrDocument | null = null;
    if (tsv.trim()) {
      try {
        document = parseTesseractTsv(tsv);
      } catch {
        document = null;
      }
    }
    const parsed =
      document && document.pages.some((page) => page.lines.length > 0)
        ? parseInvoiceDocument(document, { knownSuppliers, source: "ocr" })
        : text.trim()
          ? parseInvoiceText(text, { knownSuppliers })
          : parseInvoiceDocument(documentFromText(""), { knownSuppliers, source: "ocr" });

    return {
      parsed,
      engine: "tesseract.js",
      durationMs: Math.round(performance.now() - startedAt),
      pageCount: 1,
      text,
    };
  } finally {
    progressSink = null;
  }
}
