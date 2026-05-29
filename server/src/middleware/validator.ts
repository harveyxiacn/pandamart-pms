import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { sendError } from '../utils/helpers';

interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  message?: string;
}

export function validate(rules: ValidationRule[], source: 'body' | 'query' | 'params' = 'body') {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const data = req[source];
    const errors: { field: string; message: string }[] = [];

    for (const rule of rules) {
      const value = data[rule.field];

      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({ field: rule.field, message: rule.message || `${rule.field} 不能为空` });
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      if (rule.type) {
        // 注意：typeof [] === 'object'，需用 Array.isArray 判断数组；number 允许数字字符串
        const typeOk =
          rule.type === 'array'
            ? Array.isArray(value)
            : rule.type === 'number'
              ? !isNaN(Number(value))
              : typeof value === rule.type;
        if (!typeOk) {
          errors.push({ field: rule.field, message: `${rule.field} 类型应为 ${rule.type}` });
          continue;
        }
      }

      if (rule.type === 'string' || typeof value === 'string') {
        if (rule.minLength && value.length < rule.minLength) {
          errors.push({ field: rule.field, message: `${rule.field} 最少 ${rule.minLength} 个字符` });
        }
        if (rule.maxLength && value.length > rule.maxLength) {
          errors.push({ field: rule.field, message: `${rule.field} 最多 ${rule.maxLength} 个字符` });
        }
        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push({ field: rule.field, message: rule.message || `${rule.field} 格式不正确` });
        }
      }

      if (rule.type === 'number' || typeof value === 'number') {
        const num = Number(value);
        if (rule.min !== undefined && num < rule.min) {
          errors.push({ field: rule.field, message: `${rule.field} 不能小于 ${rule.min}` });
        }
        if (rule.max !== undefined && num > rule.max) {
          errors.push({ field: rule.field, message: `${rule.field} 不能大于 ${rule.max}` });
        }
      }

      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({ field: rule.field, message: `${rule.field} 值必须是: ${rule.enum.join(', ')}` });
      }
    }

    if (errors.length > 0) {
      sendError(res, 400, 'VALIDATION_ERROR', '请求参数验证失败', errors);
      return;
    }

    next();
  };
}
