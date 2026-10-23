---
name: wordpress-theme-development
description: >-
  Provides standards and best practices for creating modern Full Site Editing (FSE) block themes,
  theme.json configuration, block patterns, and template hierarchies. Use when developing, inspecting,
  or refactoring WordPress themes and styles.
---

# WordPress Theme Development

This skill governs the development of modern block themes (Full Site Editing) and classic theme integrations following the [WordPress Theme Developer Handbook](https://developer.wordpress.org/themes/).

## Modern Block Theme Layout

Modern themes leverage the Block Theme architecture with HTML templates and `theme.json`:

```text
wp-content/themes/<theme-slug>/
├── style.css             # Theme metadata and primary stylesheet
├── theme.json            # Design tokens, color palettes, spacing, presets
├── functions.php         # Theme supports, asset enqueuing, block pattern registration
├── templates/            # FSE HTML templates
│   ├── index.html        # Fallback template
│   ├── single.html       # Single post template
│   ├── page.html         # Page template
│   └── 404.html          # Not found template
├── parts/                # Reusable template parts
│   ├── header.html       # Site header
│   └── footer.html       # Site footer
└── patterns/             # PHP block pattern registrations
    └── hero-banner.php
```

## `theme.json` Structure & Design Tokens

Use `theme.json` v3 schema for layout, presets, and component styles:

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "appearanceTools": true,
    "layout": {
      "contentSize": "840px",
      "wideSize": "1200px"
    },
    "color": {
      "palette": [
        { "slug": "base", "color": "#ffffff", "name": "Base" },
        { "slug": "contrast", "color": "#111827", "name": "Contrast" },
        { "slug": "primary", "color": "#2563eb", "name": "Primary" }
      ]
    },
    "typography": {
      "fontSizes": [
        { "slug": "small", "size": "0.875rem", "name": "Small" },
        { "slug": "medium", "size": "1rem", "name": "Medium" },
        { "slug": "large", "size": "1.5rem", "name": "Large" }
      ]
    }
  }
}
```

## Enqueuing Assets

Enqueue styles and scripts via `wp_enqueue_scripts` with deterministic versioning:

```php
add_action( 'wp_enqueue_scripts', function() {
    $theme_version = wp_get_theme()->get( 'Version' );
    
    wp_enqueue_style(
        'theme-main',
        get_stylesheet_uri(),
        [],
        $theme_version
    );
} );
```

## Template Hierarchy Rules

1. Block templates in `templates/` use block grammar: `<!-- wp:group -->...<!-- /wp:group -->`.
2. Do not mix heavy business logic inside HTML block templates.
3. Keep PHP template parts modular in `patterns/` using standard header declarations (`Title`, `Slug`, `Categories`).

## Official References

- [Block Theme Handbook](https://developer.wordpress.org/block-editor/how-to-guides/themes/)
- [Global Settings and Styles (theme.json)](https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/)
- [WordPress Theme Developer Handbook](https://developer.wordpress.org/themes/)
