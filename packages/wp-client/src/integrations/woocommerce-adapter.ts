export interface WooProduct {
  id?: number;
  name: string;
  type: 'simple' | 'variable' | 'grouped' | 'external';
  regularPrice: string;
  salePrice?: string;
  description: string;
  shortDescription?: string;
  sku?: string;
  stockStatus: 'instock' | 'outofstock' | 'onbackorder';
  categories?: Array<{ id: number; name: string }>;
}

export interface WooValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates WooCommerce product data before creating a staged change.
 */
export function validateWooProduct(product: WooProduct): WooValidationResult {
  const errors: string[] = [];

  if (!product.name || !product.name.trim()) {
    errors.push('Product name is required.');
  }

  if (!product.regularPrice || isNaN(parseFloat(product.regularPrice))) {
    errors.push('Product regular price must be a valid numeric string.');
  }

  if (product.salePrice && parseFloat(product.salePrice) >= parseFloat(product.regularPrice)) {
    errors.push('Sale price must be strictly less than regular price.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks HPOS (High-Performance Order Storage) support from WooCommerce system status.
 */
export function checkHposCompatibility(systemStatus: {
  environment?: { hpos_enabled?: boolean };
  database?: { order_table_exists?: boolean };
}): boolean {
  return !!(
    systemStatus.environment?.hpos_enabled ||
    systemStatus.database?.order_table_exists
  );
}
