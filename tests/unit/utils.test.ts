/**
 * Unit tests for utility functions
 */

import {
  validateDocumento,
  validateTelefono,
  validatePilaPeriod,
  validateIBC,
  validateDiasCotizados,
} from '../../src/utils/validators';

import {
  formatCurrency,
  formatPilaPeriod,
  calculatePilaContributions,
  chunk,
  unique,
  pick,
  omit,
  isEmpty,
  percentage,
  clamp,
} from '../../src/utils/helpers';

describe('Validators', () => {
  describe('validateDocumento', () => {
    it('should validate valid CC', () => {
      const result = validateDocumento('1234567890', 'CC');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid CC (too short)', () => {
      const result = validateDocumento('12345', 'CC');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject non-numeric documento', () => {
      const result = validateDocumento('ABC123', 'CC');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTelefono', () => {
    it('should validate valid mobile number', () => {
      const result = validateTelefono('3001234567');
      expect(result.valid).toBe(true);
    });

    it('should validate valid landline', () => {
      const result = validateTelefono('6012345');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid mobile (not starting with 3)', () => {
      const result = validateTelefono('2001234567');
      expect(result.valid).toBe(false);
    });
  });

  describe('validatePilaPeriod', () => {
    it('should validate current period', () => {
      const now = new Date();
      const periodo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const result = validatePilaPeriod(periodo);
      expect(result.valid).toBe(true);
    });

    it('should reject future period', () => {
      const result = validatePilaPeriod('2099-12');
      expect(result.valid).toBe(false);
    });

    it('should reject invalid format', () => {
      const result = validatePilaPeriod('2024/01');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateIBC', () => {
    it('should validate valid IBC (1 SMMLV)', () => {
      const result = validateIBC(1300000);
      expect(result.valid).toBe(true);
    });

    it('should validate valid IBC (25 SMMLV)', () => {
      const result = validateIBC(32500000);
      expect(result.valid).toBe(true);
    });

    it('should reject IBC below minimum', () => {
      const result = validateIBC(1000000);
      expect(result.valid).toBe(false);
    });

    it('should reject IBC above maximum', () => {
      const result = validateIBC(40000000);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDiasCotizados', () => {
    it('should validate valid days (30)', () => {
      const result = validateDiasCotizados(30);
      expect(result.valid).toBe(true);
    });

    it('should reject 0 days', () => {
      const result = validateDiasCotizados(0);
      expect(result.valid).toBe(false);
    });

    it('should reject more than 30 days', () => {
      const result = validateDiasCotizados(31);
      expect(result.valid).toBe(false);
    });
  });
});

describe('Helpers', () => {
  describe('formatCurrency', () => {
    it('should format currency correctly', () => {
      expect(formatCurrency(1300000)).toContain('1.300.000');
    });

    it('should handle zero', () => {
      expect(formatCurrency(0)).toContain('0');
    });
  });

  describe('formatPilaPeriod', () => {
    it('should format date correctly', () => {
      const date = new Date('2026-02-15');
      expect(formatPilaPeriod(date)).toBe('2026-02');
    });
  });

  describe('calculatePilaContributions', () => {
    it('should calculate contributions for 1 SMMLV', () => {
      const result = calculatePilaContributions(1300000, 'I');

      expect(result.salud).toBe(162500); // 12.5%
      expect(result.pension).toBe(208000); // 16%
      expect(result.arl).toBe(6786); // 0.522%
      expect(result.total).toBe(377286);
    });

    it('should calculate different ARL for risk level V', () => {
      const resultI = calculatePilaContributions(1300000, 'I');
      const resultV = calculatePilaContributions(1300000, 'V');

      expect(resultV.arl).toBeGreaterThan(resultI.arl);
    });
  });

  describe('chunk', () => {
    it('should chunk array correctly', () => {
      const result = chunk([1, 2, 3, 4, 5], 2);
      expect(result).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should handle empty array', () => {
      const result = chunk([], 2);
      expect(result).toEqual([]);
    });
  });

  describe('unique', () => {
    it('should remove duplicates from primitive array', () => {
      const result = unique([1, 2, 2, 3, 3, 3]);
      expect(result).toEqual([1, 2, 3]);
    });

    it('should remove duplicates from object array by key', () => {
      const arr = [
        { id: 1, name: 'A' },
        { id: 2, name: 'B' },
        { id: 1, name: 'C' },
      ];
      const result = unique(arr, 'id');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('A');
    });
  });

  describe('pick', () => {
    it('should pick specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = pick(obj, ['a', 'c']);
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });

  describe('omit', () => {
    it('should omit specified keys', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const result = omit(obj, ['b']);
      expect(result).toEqual({ a: 1, c: 3 });
    });
  });

  describe('isEmpty', () => {
    it('should detect empty values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('  ')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
    });

    it('should detect non-empty values', () => {
      expect(isEmpty('text')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
      expect(isEmpty(0)).toBe(false);
    });
  });

  describe('percentage', () => {
    it('should calculate percentage correctly', () => {
      expect(percentage(25, 100)).toBe(25);
      expect(percentage(1, 3, 2)).toBe(33.33);
    });

    it('should handle division by zero', () => {
      expect(percentage(10, 0)).toBe(0);
    });
  });

  describe('clamp', () => {
    it('should clamp value between min and max', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });
});
