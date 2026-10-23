import { randomUUID } from 'node:crypto';
import { Section } from '@wp-agent/contracts';

export interface ElementorElement {
  id: string;
  elType: 'section' | 'column' | 'widget';
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElementorElement[];
  isInner?: boolean;
}

/**
 * Validates and parses raw _elementor_data JSON safely, preserving unknown widgets.
 */
export function parseElementorData(rawJson: string | unknown[]): ElementorElement[] {
  let parsed: unknown;
  if (typeof rawJson === 'string') {
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return [];
    }
  } else {
    parsed = rawJson;
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed as ElementorElement[];
}

/**
 * Converts a SitePlan section into valid Elementor section & column hierarchy.
 */
export function convertSectionToElementor(section: Section): ElementorElement {
  const sectionId = randomUUID().slice(0, 7);
  const columnId = randomUUID().slice(0, 7);

  const widgets: ElementorElement[] = [];

  if (section.type === 'hero') {
    // 1. Heading Widget
    widgets.push({
      id: randomUUID().slice(0, 7),
      elType: 'widget',
      widgetType: 'heading',
      settings: {
        title: section.headline,
        header_size: 'h1',
        align: 'center',
      },
      elements: [],
    });

    // 2. Subheading Text Editor Widget
    if (section.subheadline) {
      widgets.push({
        id: randomUUID().slice(0, 7),
        elType: 'widget',
        widgetType: 'text-editor',
        settings: {
          editor: `<p style="text-align: center;">${section.subheadline}</p>`,
        },
        elements: [],
      });
    }

    // 3. Button Widget
    if (section.callToAction) {
      widgets.push({
        id: randomUUID().slice(0, 7),
        elType: 'widget',
        widgetType: 'button',
        settings: {
          text: section.callToAction.label,
          link: { url: section.callToAction.href },
          align: 'center',
        },
        elements: [],
      });
    }
  } else if (section.type === 'features') {
    widgets.push({
      id: randomUUID().slice(0, 7),
      elType: 'widget',
      widgetType: 'heading',
      settings: {
        title: section.headline,
        header_size: 'h2',
        align: 'center',
      },
      elements: [],
    });

    if (section.items) {
      for (const item of section.items) {
        widgets.push({
          id: randomUUID().slice(0, 7),
          elType: 'widget',
          widgetType: 'icon-box',
          settings: {
            title_text: item.title,
            description_text: item.description,
          },
          elements: [],
        });
      }
    }
  } else {
    // Default heading + text editor
    widgets.push({
      id: randomUUID().slice(0, 7),
      elType: 'widget',
      widgetType: 'heading',
      settings: {
        title: section.headline,
        header_size: 'h2',
      },
      elements: [],
    });
    if (section.subheadline) {
      widgets.push({
        id: randomUUID().slice(0, 7),
        elType: 'widget',
        widgetType: 'text-editor',
        settings: {
          editor: `<p>${section.subheadline}</p>`,
        },
        elements: [],
      });
    }
  }

  // Wrap widgets in standard Section -> Column hierarchy
  return {
    id: sectionId,
    elType: 'section',
    settings: {
      layout: 'boxed',
    },
    elements: [
      {
        id: columnId,
        elType: 'column',
        settings: {
          _column_size: 100,
        },
        elements: widgets,
      },
    ],
  };
}
