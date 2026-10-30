import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ocrService } from './ocr.service';
import { AppError } from '../middleware/errorHandler';

// SEC-N4：魔数（文件签名）校验——伪造扩展名但字节头不符的文件必须被拒，合法文件正常分发
describe('ocrService.detectFileType 魔数校验', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-magic-'));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTmp(name: string, bytes: number[]): string {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, Buffer.from(bytes));
    return filePath;
  }

  it('合法 PDF（%PDF 头）识别为 pdf', () => {
    const file = writeTmp('ok.pdf', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(ocrService.detectFileType(file)).toBe('pdf');
  });

  it('合法 JPEG（FF D8 FF）识别为 image', () => {
    const file = writeTmp('ok.jpg', [0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(ocrService.detectFileType(file)).toBe('image');
  });

  it('合法 PNG（89 50 4E 47）识别为 image', () => {
    const file = writeTmp('ok.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(ocrService.detectFileType(file)).toBe('image');
  });

  it('合法 xlsx（ZIP 50 4B 03 04）识别为 excel', () => {
    const file = writeTmp('ok.xlsx', [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(ocrService.detectFileType(file)).toBe('excel');
  });

  it('合法 xls（OLE D0 CF 11 E0）识别为 excel', () => {
    const file = writeTmp('ok.xls', [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    expect(ocrService.detectFileType(file)).toBe('excel');
  });

  it('伪造扩展名（.pdf 但字节为任意内容）抛 AppError(400, INVALID_FILE)', () => {
    const file = writeTmp('spoof.pdf', [0x00, 0x01, 0x02, 0x03]);
    try {
      ocrService.detectFileType(file);
      expect.unreachable('应当因魔数不符抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(400);
      expect((e as AppError).code).toBe('INVALID_FILE');
    }
  });

  it('扩展名伪装成 .xlsx 但实为 PDF 字节，仍被拒', () => {
    const file = writeTmp('fake.xlsx', [0x25, 0x50, 0x44, 0x46]);
    expect(() => ocrService.detectFileType(file)).toThrow(AppError);
  });

  it('不在白名单的扩展名抛 AppError(400, INVALID_FILE)', () => {
    const file = writeTmp('evil.exe', [0x4d, 0x5a, 0x90, 0x00]);
    try {
      ocrService.detectFileType(file);
      expect.unreachable('应当因扩展名不支持抛错');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_FILE');
    }
  });
});

describe('ocrService 本地文本解析入口', () => {
  it('不调用 LLM 也能得到可落库的明细与金额', () => {
    const outcome = ocrService.buildLocalTextOutcome(
      `CBS Wholesale Inc.
Invoice No: LOCAL-1
Invoice Date: 2026-10-30
Description Qty Price Amount
Ginger Root 10 3.99 39.90
Apple Fuji 5 20.00 100.00
Subtotal 139.90
HST 18.19
Total 158.09`,
      [{ name: 'CBS Wholesale' }]
    );

    expect(outcome.ocrMethod).toBe('text_extract');
    expect(outcome.engine).toBe('local_text');
    expect(outcome.recognized.items).toHaveLength(2);
    expect(outcome.recognized.taxAmount).toBe(18.19);
    expect(outcome.recognized.grandTotal).toBe(158.09);
    expect(outcome.confidence).toBeGreaterThan(0.7);
  });
});
