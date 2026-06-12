import { Response } from 'express';
import { ApiResponse, PaginationInfo } from '../types';

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode = 200): void {
  const response: ApiResponse<T> = { success: true, data };
  if (message) response.message = message;
  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: any[]
): void {
  const response: ApiResponse = {
    success: false,
    error: { code, message, details },
  };
  res.status(statusCode).json(response);
}

export function parsePagination(query: any): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10)));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function parseBoundedInt(
  value: unknown,
  options: { defaultValue: number; min: number; max: number }
): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return options.defaultValue;
  }
  return Math.min(options.max, Math.max(options.min, Math.trunc(parsed)));
}

export function buildPagination(page: number, pageSize: number, total: number): PaginationInfo {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function parseSort(
  query: any,
  allowedFields: string[],
  defaultField = 'created_at',
  defaultOrder: 'asc' | 'desc' = 'desc'
): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : defaultField;
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : defaultOrder;
  return { sortBy, sortOrder };
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function transformKeys<T extends Record<string, any>>(
  obj: T,
  transformer: (key: string) => string
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    result[transformer(key)] = obj[key];
  }
  return result;
}

export function getClientIp(req: any): string {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.connection?.remoteAddress ||
    req.ip ||
    ''
  );
}
