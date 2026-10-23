---
name: gutenberg-block-development
description: >-
  Provides guidelines, block.json schemas, build workflows, and React component patterns for authoring
  custom Gutenberg blocks and dynamic blocks. Use when creating, modifying, or debugging Gutenberg blocks.
---

# Gutenberg Block Development

This skill governs the creation of custom Gutenberg editor blocks following the [WordPress Block Editor Handbook](https://developer.wordpress.org/block-editor/).

## Block Structure & Metadata (`block.json`)

Always declare blocks using `block.json` (v3 schema):

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "wp-agent/site-summary",
  "version": "0.1.0",
  "title": "Site Summary",
  "category": "widgets",
  "icon": "analytics",
  "description": "Displays automated AI agent site summary.",
  "supports": {
    "html": false,
    "align": ["wide", "full"],
    "color": { "background": true, "text": true },
    "spacing": { "margin": true, "padding": true }
  },
  "attributes": {
    "summaryText": { "type": "string", "default": "" },
    "showDate": { "type": "boolean", "default": true }
  },
  "textdomain": "wp-agent",
  "editorScript": "file:./build/index.js",
  "editorStyle": "file:./build/index.css",
  "style": "file:./build/style-index.css",
  "render": "file:./render.php"
}
```

## PHP Registration

Register blocks in PHP pointing to the metadata directory:

```php
add_action( 'init', function() {
    register_block_type( __DIR__ . '/blocks/site-summary' );
} );
```

## Edit Component (`edit.js`)

Use WordPress packages (`@wordpress/block-editor`, `@wordpress/components`):

```jsx
import { useBlockProps, InspectorControls } from '@wordpress/block-editor';
import { PanelBody, ToggleControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

export default function Edit( { attributes, setAttributes } ) {
    const blockProps = useBlockProps();
    const { summaryText, showDate } = attributes;

    return (
        <>
            <InspectorControls>
                <PanelBody title={ __( 'Summary Settings', 'wp-agent' ) }>
                    <ToggleControl
                        label={ __( 'Show Date', 'wp-agent' ) }
                        checked={ showDate }
                        onChange={ ( val ) => setAttributes( { showDate: val } ) }
                    />
                </PanelBody>
            </InspectorControls>
            <div { ...blockProps }>
                <TextControl
                    label={ __( 'Agent Summary', 'wp-agent' ) }
                    value={ summaryText }
                    onChange={ ( val ) => setAttributes( { summaryText: val } ) }
                />
            </div>
        </>
    );
}
```

## Dynamic vs. Static Blocks

- **Static Blocks**: Content serialized to post content via `save.js`. Use for markup that does not change dynamically on render.
- **Dynamic Blocks (Recommended for Agent Integrations)**: Use `render.php` or `render_callback` to generate server-side markup at request time based on live WordPress state.

## Official References

- [Block Editor Handbook](https://developer.wordpress.org/block-editor/)
- [Metadata in block.json](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)
- [@wordpress/scripts documentation](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-scripts/)
