import { describe, it, expect } from 'vitest';
import {
  buildPagination,
  parsePagination,
  parseBoundedInt,
  getClientIp,
  camelToSnake,
  snakeToCamel,
} from './helpers';

describe('helpers', () => {
  it('buildPagination 计算总页数', () => {
    expect(buildPagination(1, 20, 45)).toEqual({ page: 1, pageSize: 20, total: 45, totalPages: 3 });
    expect(buildPagination(1, 20, 0).totalPages).toBe(0);
  });

  it('parsePagination 钳制范围并算 offset', () => {
    expect(parsePagination({ page: '2', pageSize: '10' })).toEqual({
      page: 2,
      pageSize: 10,
      offset: 10,
    });
    expect(parsePagination({ pageSize: '9999' }).pageSize).toBe(100); // 上限 100
    expect(parsePagination({ page: '0' }).page).toBe(1); // 下限 1
  });

  it('parseBoundedInt 过滤非法数字并钳制上下限', () => {
    expect(parseBoundedInt('12', { defaultValue: 5, min: 1, max: 20 })).toBe(12);
    expect(parseBoundedInt('-1', { defaultValue: 5, min: 1, max: 20 })).toBe(1);
    expect(parseBoundedInt('999', { defaultValue: 5, min: 1, max: 20 })).toBe(20);
    expect(parseBoundedInt('abc', { defaultValue: 5, min: 1, max: 20 })).toBe(5);
    expect(parseBoundedInt(undefined, { defaultValue: 5, min: 1, max: 20 })).toBe(5);
  });

  it('getClientIp 优先取 X-Forwarded-For 首个', () => {
    expect(getClientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })).toBe('1.2.3.4');
    expect(getClientIp({ headers: {}, ip: '9.9.9.9' })).toBe('9.9.9.9');
  });

  it('camel/snake 互转', () => {
    expect(camelToSnake('defaultPrice')).toBe('default_price');
    expect(snakeToCamel('default_price')).toBe('defaultPrice');
  });
});
