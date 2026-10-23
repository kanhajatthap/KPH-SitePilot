---
name: wordpress-accessibility-and-seo
description: >-
  Provides standards for semantic HTML, WCAG 2.2 AA accessibility, ARIA patterns, structured data (JSON-LD),
  and technical SEO in WordPress themes and plugins. Use when auditing, implementing, or reviewing accessibility and search metadata.
---

# WordPress Accessibility & SEO

This skill governs implementing WCAG 2.2 AA accessibility standards and technical SEO based on the [WordPress Accessibility Handbook](https://make.wordpress.org/accessibility/handbook/) and Google Search Essentials.

## Accessibility Standards (WCAG 2.2 AA)

### 1. Semantic Landmarks & Structure
- Use semantic HTML5 elements: `<header>`, `<nav>`, `<main>`, `<article>`, `<aside>`, `<footer>`.
- Maintain a single, logical `<h1>` per document. Heading hierarchy (`h1` through `h6`) must not skip levels (e.g. `h2` directly to `h4`).

### 2. Screen Reader Support
- Provide visual hidden text for screen readers using WordPress core CSS class `.screen-reader-text`:
  ```html
  <a href="<?php the_permalink(); ?>">
      <?php esc_html_e( 'Read more', 'wp-agent' ); ?>
      <span class="screen-reader-text"><?php the_title(); ?></span>
  </a>
  ```
- For dynamic JS updates (e.g. notifications, status changes), trigger `wp.a11y.speak()`:
  ```javascript
  wp.a11y.speak( 'Agent analysis complete.', 'polite' );
  ```

### 3. Keyboard Navigation & Forms
- Ensure all interactive elements (`<button>`, `<a>`, `<input>`) have visible focus rings (`:focus-visible`).
- Every form field must be explicitly associated with a `<label for="...">`.
- Accessible custom buttons must use `<button type="button">`, not `<div onclick="...">`.

## Technical SEO Fundamentals

### 1. Structured Data (Schema.org JSON-LD)
Output valid Schema.org markup in `wp_head`:

```php
add_action( 'wp_head', function() {
    if ( ! is_single() ) {
        return;
    }
    
    $schema = [
        '@context'      => 'https://schema.org',
        '@type'         => 'Article',
        'headline'      => get_the_title(),
        'datePublished' => get_the_date( 'c' ),
        'dateModified'  => get_the_modified_date( 'c' ),
        'author'        => [
            '@type' => 'Person',
            'name'  => get_the_author(),
        ],
    ];

    echo '<script type="application/ld+json">' . wp_json_encode( $schema ) . '</script>' . "\n";
} );
```

### 2. Meta Tags & Canonicalization
- Verify canonical URLs match the permalink: `wp_get_canonical_url()`.
- Ensure images include descriptive, contextual `alt` attributes (`wp_get_attachment_image( $id, 'large', false, [ 'alt' => esc_attr( $alt ) ] )`).

## Official References

- [WordPress Accessibility Handbook](https://make.wordpress.org/accessibility/handbook/)
- [W3C WCAG 2.2 Quick Reference](https://www.w3.org/WAI/WCAG22/quickref/)
- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
