import { describe, it, expect } from 'vitest';
import { normalizeAliasKey, deriveAliasCandidates } from './alias.service';

describe('normalizeAliasKey', () => {
  it('barcode：保留 8–16 位数字，剔除其他字符', () => {
    expect(normalizeAliasKey('barcode', '(0123456789012)')).toBe('0123456789012');
    expect(normalizeAliasKey('barcode', '0123-4567-8901')).toBe('012345678901');
  });

  it('barcode：位数不足/过长返回 null', () => {
    expect(normalizeAliasKey('barcode', '1234567')).toBeNull();
    expect(normalizeAliasKey('barcode', '12345678901234567')).toBeNull();
    expect(normalizeAliasKey('barcode', 'ABCDEFGH')).toBeNull();
  });

  it('code：大写并去空白，长度 >= 3', () => {
    expect(normalizeAliasKey('code', ' cbs-1234 ')).toBe('CBS-1234');
    expect(normalizeAliasKey('code', 'ab')).toBeNull();
  });

  it('name：去符号小写，保留中英文数字', () => {
    expect(normalizeAliasKey('name', 'NAPA (Cabbage)')).toBe('napacabbage');
    expect(normalizeAliasKey('name', '绍菜')).toBe('绍菜');
    expect(normalizeAliasKey('name', 'a')).toBeNull();
  });

  it('空值返回 null', () => {
    expect(normalizeAliasKey('name', '')).toBeNull();
    expect(normalizeAliasKey('code', null)).toBeNull();
    expect(normalizeAliasKey('barcode', undefined)).toBeNull();
  });
});

describe('deriveAliasCandidates', () => {
  it('从完整明细派生 barcode/code/name 候选', () => {
    const candidates = deriveAliasCandidates({
      productNumber: '0123456789012',
      productCode: 'CBS-99',
      productNameEn: 'NAPA',
      productNameZh: '绍菜',
    });
    expect(candidates).toEqual(
      expect.arrayContaining([
        { type: 'barcode', key: '0123456789012' },
        { type: 'code', key: 'CBS-99' },
        { type: 'name', key: 'napa' },
        { type: 'name', key: '绍菜' },
      ])
    );
  });

  it('忽略无法成键的字段', () => {
    const candidates = deriveAliasCandidates({ productNumber: '12', productCode: '', productNameEn: 'NAPA' });
    expect(candidates).toEqual([{ type: 'name', key: 'napa' }]);
  });

  it('中英文同名归一后去重', () => {
    const candidates = deriveAliasCandidates({ productNameEn: 'Apple', productNameZh: 'Apple' });
    expect(candidates).toEqual([{ type: 'name', key: 'apple' }]);
  });

  it('空明细返回空数组', () => {
    expect(deriveAliasCandidates({})).toEqual([]);
  });
});
