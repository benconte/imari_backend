import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

/**
 * ⚠️  NEVER do money math with native `number`. JS floats produce wrong results
 *     even for trivial cases (0.1 + 0.2 !== 0.3). Always go through these helpers.
 */

export function toMoney(value: number | string | Prisma.Decimal): Money {
  return new Prisma.Decimal(value);
}

export function add(a: Money, b: Money): Money {
  return a.add(b);
}

export function subtract(a: Money, b: Money): Money {
  return a.sub(b);
}

export function multiply(a: Money, factor: number | string | Money): Money {
  return a.mul(factor);
}

export function divide(a: Money, divisor: number | string | Money): Money {
  return a.div(divisor);
}

export function percentOf(value: Money, percent: number): Money {
  return value.mul(percent).div(100);
}

export function isPositive(value: Money): boolean {
  return value.greaterThan(0);
}

export function isNegative(value: Money): boolean {
  return value.lessThan(0);
}

export function isZero(value: Money): boolean {
  return value.equals(0);
}

export function isGreaterThanOrEqual(a: Money, b: Money): boolean {
  return a.greaterThanOrEqualTo(b);
}

export function min(a: Money, b: Money): Money {
  return a.lessThan(b) ? a : b;
}

export function max(a: Money, b: Money): Money {
  return a.greaterThan(b) ? a : b;
}

/**
 * Round up to nearest whole unit (used by ROUND_UP savings rules).
 * Example: roundUp(toMoney(1247.32)) -> 1248
 */
export function roundUpToWhole(value: Money): Money {
  return value.ceil();
}

/**
 * Format money for display. Pure presentation — does not affect storage precision.
 */
export function formatMoney(
  value: Money,
  currency = 'RWF',
  decimals = 2,
): string {
  return `${value.toFixed(decimals)} ${currency}`;
}
