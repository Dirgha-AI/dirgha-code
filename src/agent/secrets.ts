/**
 * agent/secrets.ts — Secret redaction patterns and utilities
 */

// Secret patterns — strip before injecting context files into system prompt
// FIX P1-ISSUE 4.1: Added missing patterns for PWD, SECRET, API_SECRET, AWS session tokens
export const SECRET_PATTERNS = [
  // Cloud & AI
  /AKIA[0-9A-Z]{16}/g,                                          // AWS access key
  /ASIA[0-9A-Z]{16}/g,                                          // AWS session key (FIXED)
  /sk-[A-Za-z0-9]{32,}/g,                                       // OpenAI / Anthropic keys
  /sk-ant-[A-Za-z0-9]{32,}/g,                                   // Anthropic API key variant
  /AIza[0-9A-Za-z_-]{35,}/g,                                    // Google/Gemini API key
  // GitHub
  /ghp_[A-Za-z0-9]{36}/g,                                       // GitHub personal token
  /gho_[A-Za-z0-9]{36}/g,                                       // GitHub OAuth token
  /ghs_[A-Za-z0-9]{36}/g,                                       // GitHub App installation token
  /github_pat_[A-Za-z0-9_]{82}/g,                                // GitHub fine-grained PAT
  /ghu_[A-Za-z0-9]{36}/g,                                       // GitHub user-to-server token
  /ghr_[A-Za-z0-9]{36}/g,                                       // GitHub refresh token
  // Slack
  /xoxb-[A-Za-z0-9\-]+/g,                                       // Slack bot token
  /xoxp-[A-Za-z0-9\-]+/g,                                       // Slack user token
  /xoxs-[A-Za-z0-9\-]+/g,                                       // Slack session token
  /xoxr-[A-Za-z0-9\-]+/g,                                       // Slack refresh token
  /xoxa-[A-Za-z0-9\-]+/g,                                       // Slack app token
  // Email / Messaging
  /SG\.[A-Za-z0-9\-_]{22,}\.[A-Za-z0-9\-_]{22,}/g,             // SendGrid API key
  /re_[A-Za-z0-9]{20,}/g,                                       // Resend API key
  /[A-Za-z0-9]{64}-[A-Za-z0-9]{32}-[A-Za-z0-9]{64}/g,          // Mailgun API key pattern
  // Payments
  /sk_live_[A-Za-z0-9]{24,}/g,                                  // Stripe secret live
  /sk_test_[A-Za-z0-9]{24,}/g,                                  // Stripe secret test
  /pk_live_[A-Za-z0-9]{24,}/g,                                  // Stripe publishable live
  /pk_test_[A-Za-z0-9]{24,}/g,                                  // Stripe publishable test
  /rk_live_[A-Za-z0-9]{14,}/g,                                  // Razorpay key live
  /rk_test_[A-Za-z0-9]{14,}/g,                                  // Razorpay key test
  /FLWSECK-[A-Za-z0-9]{32,}/g,                                  // Flutterwave secret key
  /FLWPUBK-[A-Za-z0-9]{32,}/g,                                  // Flutterwave public key
  /sq0csp-[A-Za-z0-9\-_]{20,}/g,                                // Square credential
  /sq0atp-[A-Za-z0-9\-_]{20,}/g,                                // Square access token
  /sq0idp-[A-Za-z0-9\-_]{20,}/g,                                // Square application ID
  // Infrastructure
  /dop_v1_[A-Fa-f0-9]{64}/g,                                    // DigitalOcean PAT
  /sentry_[A-Za-z0-9]{32,}/g,                                   // Sentry DSN token
  /npm_[A-Za-z0-9]{36}/g,                                       // NPM token
  /pypi-AgEIcH[A-Za-z0-9\-_]{50,}/g,                            // PyPI token
  /whsec_[A-Za-z0-9]{32,}/g,                                    // Webhook signing secret
  /key-[A-Za-z0-9]{32,}/g,                                      // Fireworks API key
  /fw_[A-Za-z0-9]{40,}/g,                                       // Fireworks API key v2
  /nvapi-[A-Za-z0-9]{60,}/g,                                    // NVIDIA API key
  /glhf_[A-Za-z0-9]{40,}/g,                                     // GLHF API key
  // Auth / Generic
  /Bearer\s+[A-Za-z0-9\-_.~+/]+=*/g,                            // Bearer tokens
  /Basic\s+[A-Za-z0-9\-_]+=*/g,                                 // Basic auth tokens
  /ApiKey\s+[A-Za-z0-9\-_]+/gi,                                  // Generic API key header
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  /-----BEGIN (RSA |EC )?PUBLIC KEY-----[\s\S]*?-----END (RSA |EC )?PUBLIC KEY-----/g,
  /ssh-rsa\s+[A-Za-z0-9+/]{200,}/g,                              // SSH RSA keys
  /ssh-ed25519\s+[A-Za-z0-9+/]{40,}/g,                          // SSH ed25519 keys
  // Database connection strings with credentials
  /(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp):\/\/[^\s:]+:[^\s@]+@[^\s]+/g,
  /jdbc:(?:postgresql|mysql):\/\/[^\s:]+:[^\s@]+@[^\s]+/g,      // JDBC with creds
  // JWT tokens (3 dot-separated base64url segments)
  /eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g,
  // OAuth tokens
  /ya29\.[A-Za-z0-9\-_]+/g,                                      // Google OAuth
  /1\/[A-Za-z0-9\-_]{20,}/g,                                     // Google OAuth v1
  // Common environment variable patterns (FIXED - catch more secret names)
  /(?:password|pwd|passwd|secret|api_secret|api_key|access_token|auth_token|private_key)\s*[:=]\s*['"]?[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]{8,}['"]?/gi,
  // AWS credential patterns (FIXED)
  /aws[_-]?(?:access[_-]?key[_-]?id|secret[_-]?access[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9/+=]{16,}['"]?/gi,
  // Generic high-entropy strings that look like secrets
  /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?/gi,
  // High-entropy base64 catch-all (32+ bytes) - KEEP LAST (broadest match)
  /[A-Za-z0-9+/]{40,}={0,2}/g,
] as const;

/** Redact secrets from text using pattern matching */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

// Kimi K2 (NVIDIA NIM) sometimes hallucinates tool-call or message API JSON
// as literal text output instead of using actual tool calls. Strip it.
const HALLUCINATION_PATTERNS = [
  // Python-dict style: [{'type': 'text', 'text': ...}]
  /\[\s*\{'type'\s*:/g,
  /\[\s*\{"type"\s*:/g,
  // JSON blob: [{"type":"tool_use",...}] or [{"type":"text",...}]
  /\[\s*\{\s*"type"\s*:\s*"(?:text|tool_use|thinking)"/g,
  // Self-narration artifacts: PAUSE & RESET, SYSTEM ALERT CAUGHT
  /PAUSE\s*[&+]\s*RESET\s*[—-]/g,
  /SYSTEM\s+ALERT\s+CAUGHT\s*[—-]/g,
  // Dispatcher meta messages that must not reach user output or history
  /\[rate-limited\s*·/,
  /\[admin\s*·\s*(?:429|rate-limited)/,
  /\[fireworks\s*·.*rate-limited/,
  /\[.*rate-limited\s*·\s*failing over/,
  /\[connection resumed\s*·/,
  /·\s*failing over to\s+\w+/,
] as const;

/** Strip model hallucination artifacts from streamed text. */
export function cleanStreamOutput(text: string): string {
  // If the chunk contains a hallucinated JSON block start, drop the whole chunk
  for (const re of HALLUCINATION_PATTERNS) {
    if (re.test(text)) return '';
  }
  return text;
}
