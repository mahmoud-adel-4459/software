import { describe, expect, it } from 'vitest';
import { parseGateScan } from '@/lib/soldierProfile';

describe('parseGateScan', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  it('plain and Arabic-Indic digits', () => {
    expect(parseGateScan('123456789')).toEqual({ kind: 'soldier', militaryNo: '123456789' });
    expect(parseGateScan(' ١٢٣٤٥٦٧٨٩ ')).toEqual({ kind: 'soldier', militaryNo: '123456789' });
  });
  it('visitor uuid and json payloads', () => {
    expect(parseGateScan(id)).toEqual({ kind: 'visitor', id });
    expect(parseGateScan(JSON.stringify({ t: 'visitor', id }))).toEqual({ kind: 'visitor', id });
    expect(parseGateScan('{"mn":"555000111"}')).toEqual({ kind: 'soldier', militaryNo: '555000111' });
    expect(parseGateScan('{"mn":"555000111"')).toEqual({ kind: 'soldier', militaryNo: '555000111' });
  });
  it('empty input', () => {
    expect(parseGateScan('   ')).toEqual({ kind: 'none' });
  });
});


it('reads numeric visitor labels and old labels scanned with an Arabic keyboard', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const payload = '99' + BigInt('0x' + id.replaceAll('-', '')).toString().padStart(39, '0');
  expect(parseGateScan(payload)).toEqual({ kind: 'visitor', id });
  const keys: Record<string, string> = { a: 'ش', b: 'لا', c: 'ؤ', d: 'ي', e: 'ث', f: 'ب' };
  expect(parseGateScan(id.replace(/[a-f]/g, c => keys[c]!))).toEqual({ kind: 'visitor', id });
  expect(parseGateScan(payload.replace(/[0-9]/g, c => '٠١٢٣٤٥٦٧٨٩'[Number(c)]!))).toEqual({ kind: 'visitor', id });
  expect(parseGateScan('99' + '9'.repeat(39))).toEqual({ kind: 'none' });
});
