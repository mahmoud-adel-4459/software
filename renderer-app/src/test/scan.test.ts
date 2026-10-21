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
