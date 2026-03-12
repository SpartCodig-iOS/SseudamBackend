/**
 * Database column configuration constants
 */

export const DATABASE_COLUMN_CONFIG = {
  /**
   * Standard currency field configuration (ISO 4217 - 3 character codes)
   */
  CURRENCY: { type: 'varchar', length: 3 } as const,

  /**
   * Standard country code field configuration (ISO 3166-1 alpha-2 - 2 character codes)
   */
  COUNTRY_CODE: { type: 'varchar', length: 2 } as const,

  /**
   * Standard decimal precision for monetary amounts
   */
  MONEY_AMOUNT: { type: 'decimal', precision: 15, scale: 2 } as const,

  /**
   * Standard decimal precision for exchange rates
   */
  EXCHANGE_RATE: { type: 'decimal', precision: 15, scale: 6 } as const,
} as const;