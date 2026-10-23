import { randomUUID } from 'node:crypto';

export type AuditEventType =
  | 'agent_request'
  | 'tool_invocation'
  | 'tool_result'
  | 'tool_denial'
  | 'security_violation';

export interface AuditEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly type: AuditEventType;
  readonly actor: string;
  readonly targetSite?: string;
  readonly action: string;
  readonly payload?: Record<string, unknown>;
  readonly result?: Record<string, unknown>;
  readonly isRedacted: true;
}

const SENSITIVE_KEY_REGEX =
  /(password|token|secret|auth|authorization|api[-_]?key|cookie|bearer|credential|app[-_]?pass)/i;

/**
 * Recursively deep-redacts sensitive keys and values from payloads.
 */
export function redactSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    let sanitized: string = input;
    sanitized = sanitized.replace(/Basic\s+[A-Za-z0-9+/=]+/gi, 'Basic [REDACTED]');
    sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [REDACTED]');
    sanitized = sanitized.replace(
      /[a-z0-9]{4}[ -][a-z0-9]{4}[ -][a-z0-9]{4}[ -][a-z0-9]{4}/gi,
      '[REDACTED]'
    );
    sanitized = sanitized.replace(/sk-or-v1-[a-f0-9]{64}/gi, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/AIzaSy[A-Za-z0-9_-]{30,40}/gi, '[REDACTED_API_KEY]');
    sanitized = sanitized.replace(/gsk_[A-Za-z0-9]{30,64}/gi, '[REDACTED_API_KEY]');
    return sanitized as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (typeof input === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEY_REGEX.test(key)) {
        copy[key] = '[REDACTED]';
      } else {
        copy[key] = redactSensitiveData(value);
      }
    }
    return copy as T;
  }

  return input;
}

export interface LogAuditOptions {
  type: AuditEventType;
  actor: string;
  targetSite?: string;
  action: string;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/**
 * Structured Audit Logger ensuring zero credential leakage.
 */
export class AuditLogger {
  private events: AuditEvent[] = [];

  log(options: LogAuditOptions): AuditEvent {
    const event: AuditEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: options.type,
      actor: options.actor,
      targetSite: options.targetSite,
      action: options.action,
      payload: options.payload
        ? (redactSensitiveData(options.payload) as Record<string, unknown>)
        : undefined,
      result: options.result
        ? (redactSensitiveData(options.result) as Record<string, unknown>)
        : undefined,
      isRedacted: true,
    };

    this.events.push(event);
    return event;
  }

  getEvents(): readonly AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
