export type AcfFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'url'
  | 'image'
  | 'file'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'true_false'
  | 'repeater'
  | 'group';

export interface AcfFieldDefinition {
  key: string;
  label: string;
  name: string;
  type: AcfFieldType;
  required?: boolean;
  defaultValue?: unknown;
  subFields?: AcfFieldDefinition[];
}

export interface AcfFieldGroup {
  key: string;
  title: string;
  fields: AcfFieldDefinition[];
  location?: Array<Array<{ param: string; operator: string; value: string }>>;
}

export interface AcfValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates custom field values against an ACF field group definition.
 */
export function validateAcfFields(
  values: Record<string, unknown>,
  group: AcfFieldGroup
): AcfValidationResult {
  const errors: string[] = [];

  for (const field of group.fields) {
    const val = values[field.name];

    // Check required fields
    if (field.required && (val === undefined || val === null || val === '')) {
      errors.push(`Field "${field.label}" (${field.name}) is required.`);
      continue;
    }

    if (val !== undefined && val !== null) {
      if (field.type === 'number' && typeof val !== 'number') {
        errors.push(`Field "${field.name}" must be a number.`);
      }
      if (field.type === 'email' && typeof val === 'string' && !val.includes('@')) {
        errors.push(`Field "${field.name}" must be a valid email.`);
      }
      if (field.type === 'repeater' && !Array.isArray(val)) {
        errors.push(`Field "${field.name}" must be an array for repeater.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
