import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xlsx', '.xls'];

function getUploadDir(subDir: string): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const dir = path.resolve(__dirname, '../../', env.upload.dir, subDir, year, month);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const invoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadDir('invoices'));
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

const productStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getUploadDir('products'));
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safeName}`);
  },
});

function fileFilter(_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    cb(new Error(`不支持的文件类型: ${ext}`));
    return;
  }

  const isGenericBinaryMime = file.mimetype === 'application/octet-stream';
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype) && !isGenericBinaryMime) {
    cb(new Error(`不支持的MIME类型: ${file.mimetype}`));
    return;
  }

  cb(null, true);
}

export const uploadInvoice = multer({
  storage: invoiceStorage,
  fileFilter,
  limits: {
    fileSize: env.upload.maxFileSize,
    files: 10,
  },
});

export const uploadProduct = multer({
  storage: productStorage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jpg', '.jpeg', '.png'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('产品图片仅支持 JPG/PNG 格式'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

export const uploadExcel = multer({
  storage: invoiceStorage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 Excel 文件格式'));
    }
  },
  limits: {
    fileSize: env.upload.maxFileSize,
    files: 1,
  },
});
