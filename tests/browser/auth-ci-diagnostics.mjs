// Only fixed codes escape private runtime diagnostics. Never return matched text.
export function classifyFailure(text) {
 const rules=[
 ['CLI_FLAG',/unknown (?:flag|option)/i],
 ['CONFIG_INVALID',/invalid config|failed to parse config|config.*validation/i],
 ['IMAGE_PULL',/failed to pull|pull access denied|manifest unknown|toomanyrequests/i],
 ['MIGRATION_SQL',/SQLSTATE|syntax error at or near/i],
 ['PORT_BIND',/port is already allocated|address already in use/i],
 ['SERVICE_UNHEALTHY',/unhealthy|health check failed|failed health check/i],
 ['NETWORK',/network is unreachable|no such host|connection refused|i\/o timeout/i],
 ['TIMEOUT',/timed out|ETIMEDOUT/i],
 ];
 return rules.filter(([,pattern])=>pattern.test(text)).map(([code])=>code).join(',')||'UNCLASSIFIED';
}
