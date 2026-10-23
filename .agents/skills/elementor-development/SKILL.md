---
name: elementor-development
description: >-
  Provides patterns, control registrations, and widget structures for extending Elementor Page Builder.
  Use when creating or modifying custom Elementor widgets, dynamic tags, or registering custom controls.
---

# Elementor Development

This skill governs authoring custom Elementor widgets and extensions adhering to the [Elementor Developer Documentation](https://developers.elementor.com/).

## Bootstrap & Compatibility Check

Always verify that Elementor is active before registering hooks:

```php
add_action( 'plugins_loaded', function() {
    if ( ! did_action( 'elementor/loaded' ) ) {
        return;
    }
    
    add_action( 'elementor/widgets/register', function( $widgets_manager ) {
        require_once __DIR__ . '/widgets/SiteSummaryWidget.php';
        $widgets_manager->register( new \WpAgent\Elementor\Widgets\SiteSummaryWidget() );
    } );
} );
```

## Custom Widget Structure

Extend `\Elementor\Widget_Base`:

```php
namespace WpAgent\Elementor\Widgets;

use Elementor\Widget_Base;
use Elementor\Controls_Manager;

class SiteSummaryWidget extends Widget_Base {
    public function get_name(): string {
        return 'wp_agent_site_summary';
    }

    public function get_title(): string {
        return esc_html__( 'Agent Site Summary', 'wp-agent' );
    }

    public function get_icon(): string {
        return 'eicon-post-list';
    }

    public function get_categories(): array {
        return [ 'general' ];
    }

    protected function register_controls(): void {
        $this->start_controls_section(
            'content_section',
            [
                'label' => esc_html__( 'Content', 'wp-agent' ),
                'tab'   => Controls_Manager::TAB_CONTENT,
            ]
        );

        $this->add_control(
            'heading_text',
            [
                'label'   => esc_html__( 'Heading', 'wp-agent' ),
                'type'    => Controls_Manager::TEXT,
                'default' => esc_html__( 'Site Summary', 'wp-agent' ),
            ]
        );

        $this->end_controls_section();
    }

    protected function render(): void {
        $settings = $this->get_settings_for_display();
        ?>
        <div class="wp-agent-summary-widget">
            <h3><?php echo esc_html( $settings['heading_text'] ); ?></h3>
        </div>
        <?php
    }
}
```

## Best Practices

1. **Escaping**: Always escape settings retrieved via `get_settings_for_display()`.
2. **Backbone Content Template**: Provide `content_template()` for instantaneous live editor preview where viable.
3. **Asset Optimization**: Enqueue frontend scripts and styles only when the specific widget is present on the page (`get_style_depends()`, `get_script_depends()`).

## Official References

- [Elementor Developers Docs](https://developers.elementor.com/)
- [Creating a New Widget](https://developers.elementor.com/docs/widgets/)
- [Widget Controls Guide](https://developers.elementor.com/docs/widgets/controls/)
