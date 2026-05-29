import { Request, Response, NextFunction } from 'express';
import { MulterError } from 'multer';
import logger from '../utils/logger';

export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: any[];

  constructor(statusCode: number, code: string, message: string, details?: any[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err instanceof MulterError) {
    let message = '文件上传错误';
    let code = 'BAD_REQUEST';
    let statusCode = 400;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = '文件大小超过限制（最大20MB）';
        code = 'FILE_TOO_LARGE';
        statusCode = 413;
        break;
      case 'LIMIT_FILE_COUNT':
        message = '单次上传文件数超过限制（最多10个）';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = '意外的文件字段';
        break;
    }

    res.status(statusCode).json({
      success: false,
      error: { code, message },
    });
    return;
  }

  if (err.message && err.message.includes('不支持的文件类型')) {
    res.status(415).json({
      success: false,
      error: { code: 'UNSUPPORTED_FILE_TYPE', message: err.message },
    });
    return;
  }

  logger.error('未处理的错误:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
    },
  });
}
