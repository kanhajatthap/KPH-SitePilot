---
name: woocommerce-development
description: >-
  Provides patterns for extending WooCommerce, working with CRUD models, declaring HPOS compatibility,
  hooking into checkout and orders, and consuming WooCommerce APIs. Use when building or reviewing WooCommerce extensions.
---

# WooCommerce Development

This skill governs developing extensions and integrations for WooCommerce following the [WooCommerce Developer Documentation](https://developer.woocommerce.com/).

## High-Performance Order Storage (HPOS) Compatibility

All modern WooCommerce plugins **must** explicitly declare HPOS compatibility on `before_woocommerce_init`:

```php
use Automattic\WooCommerce\Utilities\FeaturesUtil;

add_action( 'before_woocommerce_init', function() {
    if ( class_exists( FeaturesUtil::class ) ) {
        FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true
        );
    }
} );
```

## Using WooCommerce CRUD Objects

Never use `get_post_meta()` or `update_post_meta()` directly for orders. Use the WooCommerce CRUD abstraction:

```php
// Retrieve an order
$order = wc_get_order( $order_id );
if ( ! $order instanceof \WC_Order ) {
    return;
}

// Read attributes safely
$total       = $order->get_total();
$status      = $order->get_status();
$billing_email = $order->get_billing_email();

// Query products using wc_get_products
$products = wc_get_products( [
    'status'  => 'publish',
    'limit'   => 10,
    'orderby' => 'date',
    'order'   => 'DESC',
] );
foreach ( $products as $product ) {
    $price = $product->get_price();
    $sku   = $product->get_sku();
}
```

## Hooking into Order Processing

```php
add_action( 'woocommerce_order_status_changed', function( $order_id, $old_status, $new_status, $order ) {
    if ( 'completed' === $new_status ) {
        // Handle post-completion event cleanly
    }
}, 10, 4 );
```

## Best Practices

1. **Cart & Session Safety**: Never interact directly with `WC()->cart` or `WC()->session` in CLI or REST API contexts without checking `isset( WC()->cart )`.
2. **Transactional Safety**: When mutating stock or order statuses programmatically, wrap logic in try/catch and log errors gracefully.
3. **Template Overrides**: Follow the template override system (`your-theme/woocommerce/...`) rather than modifying core files.

## Official References

- [WooCommerce Developer Documentation](https://developer.woocommerce.com/)
- [High-Performance Order Storage (HPOS) Guide](https://developer.woocommerce.com/docs/hpos-extension-recipe-book/)
- [WooCommerce CRUD Objects](https://developer.woocommerce.com/docs/crud-objects-in-woocommerce/)
