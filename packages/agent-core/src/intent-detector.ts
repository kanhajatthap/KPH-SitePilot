import {
  IntentCategory,
  IntentDetectionResult,
} from '@wp-agent/contracts';

export interface IntentDetectorOptions {
  modelAdapter?: unknown;
}

export class IntentDetector {
  /**
   * Analyzes a user prompt against the currently selected mode to determine intent
   * and whether a mode switch or clarification is recommended.
   */
  public detect(prompt: string, currentMode: 'agent' | 'writes' | 'chat'): IntentDetectionResult {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();

    // 1. Check for ambiguous or empty prompt
    if (trimmed.length < 3 || /^(hi|hello|hey|ok|okay|cool|thanks|help)$/i.test(trimmed)) {
      return {
        category: 'informational_chat',
        confidence: 0.9,
        recommendedMode: currentMode,
        reason: 'Short conversational greeting or acknowledgment.',
        requiresModeSwitch: false,
      };
    }

    // 2. Check for unsupported security-violating or destructive bulk operations
    if (
      /eval\(|exec\(|system\(|passthru|shell_exec|sudo|rm -rf|drop database|drop table|<script/i.test(
        lower
      ) ||
      /(?:delete|remove|uninstall|drop)\s+(?:all\s+)?(?:plugins|themes|posts|pages|database|users)/i.test(
        lower
      )
    ) {
      return {
        category: 'unsupported_request',
        confidence: 0.99,
        recommendedMode: currentMode,
        reason: 'Destructive bulk operations or arbitrary shell execution are strictly forbidden by security policy.',
        requiresModeSwitch: false,
      };
    }

    // 2b. High-level educational / conceptual queries (must remain chat, never mutations)
    if (
      /^(?:explain|what is|what are|how (?:do|does|can)|why (?:do|does|is))\s+/i.test(lower) &&
      !/(?:create|install|update|set|change|add|inject|modify)\s+/i.test(lower)
    ) {
      return {
        category: 'informational_chat',
        confidence: 0.95,
        recommendedMode: 'chat',
        reason: 'Informational explanation inquiry. Handled via direct AI Chat without mutating WordPress state.',
        requiresModeSwitch: false,
      };
    }

    // 3. Plugin management operations (Install, activate, deactivate, list)
    const isPluginOperation =
      /^(?:install|activate|deactivate|uninstall)\s+(?:the\s+)?(?:plugin\s+)?[\w-]+/i.test(lower) ||
      /(?:install|activate|deactivate)\s+[\w-]+\s+plugin/i.test(lower);

    // 4. Builder structures (Elementor, Gutenberg, ACF, WooCommerce) - EXCLUDE explicit plugin install commands
    const isBuilderPrompt =
      !isPluginOperation &&
      /elementor|gutenberg|blocks|acf|custom field|metadata|woocommerce|woo product|theme\.json/i.test(
        lower
      );

    // 5. Content mutation (post/page creation, drafting, updates)
    const isMutationPrompt =
      !isPluginOperation &&
      (/(?:create|draft|add|make|publish|write|generate|propose)\s+(?:a\s+|an\s+|the\s+)?(?:new\s+)?(?:wordpress\s+|wp\s+)?(?:post|page|article|draft|hero section|product|content)/i.test(
        lower
      ) ||
      /(?:post|page|draft)\s+titled/i.test(lower) ||
      /save (?:as )?draft/i.test(lower));

    // 6. Site inspection and read operations
    const isInspectionPrompt =
      /^(?:list|show)\s+(?:installed\s+)?plugins/i.test(lower) ||
      /plugin[s]?\s*(?:list|status)/i.test(lower) ||
      /inspect|site health|wp version|installed plugins|active theme|read page|get page|check (?:the )?(?:site|health|status)/i.test(
        lower
      );

    // Classification & Mode Recommendations:
    if (isBuilderPrompt || isMutationPrompt) {
      const category: IntentCategory = isBuilderPrompt ? 'builder_structure' : 'content_mutation';

      if (currentMode === 'writes') {
        return {
          category,
          confidence: 0.95,
          recommendedMode: 'writes',
          reason: `Request matches WordPress ${isBuilderPrompt ? 'builder structure proposal' : 'draft creation'} and Controlled Writes mode is already active.`,
          requiresModeSwitch: false,
        };
      }

      if (currentMode === 'agent') {
        return {
          category,
          confidence: 0.95,
          recommendedMode: 'writes',
          reason: `Request involves staging or creating WordPress content. You are currently in Read-Only mode. Switch to Controlled Writes to proceed with draft generation and human approval.`,
          requiresModeSwitch: true,
          suggestedActionPill: {
            label: 'Switch to Controlled Writes',
            targetMode: 'writes',
            description: 'Enable controlled writes to stage and review this WordPress content proposal.',
          },
        };
      }

      // currentMode === 'chat'
      return {
        category,
        confidence: 0.95,
        recommendedMode: 'writes',
        reason: `Request involves WordPress content creation or builder layout, but Direct AI Chat does not have WordPress tool capabilities.`,
        requiresModeSwitch: true,
        suggestedActionPill: {
          label: 'Switch to Controlled Writes',
          targetMode: 'writes',
          description: 'Switch to Controlled Writes to inspect LocalWP and stage draft content.',
        },
      };
    }

    if (isInspectionPrompt) {
      if (currentMode === 'agent') {
        return {
          category: 'site_inspection',
          confidence: 0.95,
          recommendedMode: 'agent',
          reason: 'Request matches safe read-only site inspection. WP Agent (Read-Only) is already active.',
          requiresModeSwitch: false,
        };
      }

      if (currentMode === 'chat') {
        return {
          category: 'site_inspection',
          confidence: 0.9,
          recommendedMode: 'agent',
          reason: 'Request asks for local WordPress site data or health inspection, which requires WP Agent tools.',
          requiresModeSwitch: true,
          suggestedActionPill: {
            label: 'Switch to WP Agent',
            targetMode: 'agent',
            description: 'Switch to WP Agent (Read-Only) to safely query and inspect the local WordPress site.',
          },
        };
      }

      // In writes mode, inspection is also supported
      return {
        category: 'site_inspection',
        confidence: 0.85,
        recommendedMode: 'agent',
        reason: 'Read-only inspection can be performed in WP Agent mode or Controlled Writes mode.',
        requiresModeSwitch: false,
      };
    }

    // Default: general informational chat
    return {
      category: 'informational_chat',
      confidence: 0.8,
      recommendedMode: currentMode === 'chat' ? 'chat' : currentMode,
      reason: 'General inquiry or discussion. No special WordPress tool capabilities required.',
      requiresModeSwitch: false,
    };
  }
}
