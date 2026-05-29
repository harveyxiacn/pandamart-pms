import { describe, it, expect } from 'vitest';
import { validate } from './validator';

function run(rules: any[], body: any) {
  const req: any = { body };
  let nextCalled = false;
  let errorResponse: any = null;
  const res: any = {
    status() {
      return this;
    },
    json(payload: any) {
      errorResponse = payload;
      return this;
    },
  };
  const next = () => {
    nextCalled = true;
  };
  validate(rules)(req, res, next);
  return { passed: nextCalled, errorResponse };
}

describe('validate middleware', () => {
  it('接受真正的数组（回归：typeof [] === "object" 曾导致误判）', () => {
    const { passed } = run([{ field: 'items', required: true, type: 'array' }], { items: [{ a: 1 }] });
    expect(passed).toBe(true);
  });

  it('非数组传给 array 规则时报错', () => {
    const { passed, errorResponse } = run([{ field: 'items', required: true, type: 'array' }], {
      items: 'notarray',
    });
    expect(passed).toBe(false);
    expect(errorResponse.error.details[0].field).toBe('items');
  });

  it('number 接受数字字符串', () => {
    const { passed } = run([{ field: 'qty', required: true, type: 'number' }], { qty: '5' });
    expect(passed).toBe(true);
  });

  it('required 缺失时报错', () => {
    const { passed, errorResponse } = run([{ field: 'name', required: true, type: 'string' }], {});
    expect(passed).toBe(false);
    expect(errorResponse.success).toBe(false);
  });

  it('minLength 生效', () => {
    const { passed } = run([{ field: 'pw', required: true, type: 'string', minLength: 8 }], { pw: 'short' });
    expect(passed).toBe(false);
  });

  it('enum 限定取值', () => {
    expect(run([{ field: 't', enum: ['in', 'out'] }], { t: 'in' }).passed).toBe(true);
    expect(run([{ field: 't', enum: ['in', 'out'] }], { t: 'bad' }).passed).toBe(false);
  });
});
