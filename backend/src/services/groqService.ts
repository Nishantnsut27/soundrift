import axios from 'axios';
import { config } from '../config/config.js';
import { CURATION_ENGINE_CONFIG } from '../config/curationConfig.js';
import { logger } from '../utils/logger.js';

const SCOPE = 'GroqService';

type GroqFailureKind = 'rate_limit' | 'auth' | 'server' | 'timeout' | 'network' | 'invalid_request' | 'invalid_response' | 'unknown';

interface GroqAttemptFailure {
  kind: GroqFailureKind;
  status?: number;
  rotate: boolean;
  cooldownMs: number;
  message: string;
  /** Groq's own explanation, when it sent one. Logged so a 4xx is diagnosable. */
  detail?: string;
}

/**
 * Pulls the reason out of a Groq error response.
 *
 * Groq answers a rejected request with `{ error: { message, type, code } }`. Without
 * this the log says only "rejected the request payload", which is not enough to tell a
 * malformed schema from a content refusal from a bad model id. Truncated because the
 * body is attacker-influenced only in the sense that it echoes our own prompt back.
 */
function extractGroqDetail(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data: unknown = error.response?.data;
  if (typeof data === 'string') {
    return data.trim().length > 0 ? data.slice(0, 300) : undefined;
  }
  if (data && typeof data === 'object' && 'error' in data) {
    const inner = (data as { error?: unknown }).error;
    if (inner && typeof inner === 'object' && 'message' in inner) {
      const message = (inner as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) return message.slice(0, 300);
    }
  }
  return undefined;
}

export interface GroqCompletionResult {
  content: string;
  keyIndex: number;
  attempts: number;
  model: string;
}

export class GroqConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroqConfigurationError';
  }
}

export class GroqRequestError extends Error {
  readonly attempts: number;
  readonly lastStatus?: number;
  readonly lastFailureKind: GroqFailureKind;

  constructor(message: string, attempts: number, lastFailureKind: GroqFailureKind, lastStatus?: number) {
    super(message);
    this.name = 'GroqRequestError';
    this.attempts = attempts;
    this.lastFailureKind = lastFailureKind;
    this.lastStatus = lastStatus;
  }
}

/** Groq's machine-readable reason code, when it sent one. */
function extractGroqCode(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  const data: unknown = error.response?.data;
  if (data && typeof data === 'object' && 'error' in data) {
    const inner = (data as { error?: unknown }).error;
    if (inner && typeof inner === 'object' && 'code' in inner) {
      const code = (inner as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
  }
  return undefined;
}

function classifyFailure(error: unknown): GroqAttemptFailure {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (status === 429) {
      return {
        kind: 'rate_limit',
        status,
        rotate: true,
        cooldownMs: CURATION_ENGINE_CONFIG.rateLimitCooldownMs,
        message: 'Rate limit or quota exceeded'
      };
    }

    if (status === 401 || status === 403) {
      return {
        kind: 'auth',
        status,
        rotate: true,
        cooldownMs: CURATION_ENGINE_CONFIG.authFailureCooldownMs,
        message: 'Key rejected by Groq'
      };
    }

    if (status !== undefined && status >= 500) {
      return { kind: 'server', status, rotate: true, cooldownMs: 0, message: 'Groq server error' };
    }

    if (status !== undefined && status >= 400) {
      /*
       * `json_validate_failed` is the model failing to emit usable JSON, not us
       * sending a bad payload — the reasoning model can spend its whole output
       * budget thinking and return an empty generation. Measured intermittently
       * on an unchanged prompt, so it is transient: retry rather than lose the
       * section for the rest of the cycle. Every other 4xx really is our fault
       * and would fail identically on another key, so those still stop here.
       */
      if (extractGroqCode(error) === 'json_validate_failed') {
        return {
          kind: 'invalid_response',
          status,
          rotate: true,
          cooldownMs: 0,
          message: 'Groq returned an unusable completion',
          detail: extractGroqDetail(error)
        };
      }

      return {
        kind: 'invalid_request',
        status,
        rotate: false,
        cooldownMs: 0,
        message: 'Groq rejected the request payload',
        detail: extractGroqDetail(error)
      };
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return { kind: 'timeout', rotate: true, cooldownMs: 0, message: 'Groq request timed out' };
    }

    return { kind: 'network', rotate: true, cooldownMs: 0, message: 'Network failure calling Groq' };
  }

  return { kind: 'unknown', rotate: true, cooldownMs: 0, message: 'Unexpected failure calling Groq' };
}

class GroqKeyManager {
  private readonly keys: string[];
  private cursor = 0;
  private readonly cooldownUntil: number[];

  constructor(keys: string[]) {
    this.keys = keys;
    this.cooldownUntil = keys.map(() => 0);
  }

  get keyCount(): number {
    return this.keys.length;
  }

  buildAttemptOrder(maxAttempts: number): number[] {
    if (this.keys.length === 0) return [];

    const now = Date.now();
    const available: number[] = [];
    for (let offset = 0; offset < this.keys.length; offset++) {
      const index = (this.cursor + offset) % this.keys.length;
      if (this.cooldownUntil[index] <= now) {
        available.push(index);
      }
    }

    return available.slice(0, Math.max(1, maxAttempts));
  }

  advanceCursor(): void {
    if (this.keys.length === 0) return;
    this.cursor = (this.cursor + 1) % this.keys.length;
  }

  markFailure(index: number, cooldownMs: number): void {
    if (cooldownMs > 0 && index >= 0 && index < this.cooldownUntil.length) {
      this.cooldownUntil[index] = Date.now() + cooldownMs;
    }
  }

  markSuccess(index: number): void {
    if (index >= 0 && index < this.cooldownUntil.length) {
      this.cooldownUntil[index] = 0;
    }
  }

  getSecret(index: number): string {
    return this.keys[index];
  }

  describe(): { configuredKeys: number; coolingKeys: number[] } {
    const now = Date.now();
    return {
      configuredKeys: this.keys.length,
      coolingKeys: this.cooldownUntil
        .map((until, index) => (until > now ? index + 1 : 0))
        .filter(keyIndex => keyIndex > 0)
    };
  }
}

const keyManager = new GroqKeyManager(config.groqApiKeys);

export function getGroqKeyDiagnostics(): { configuredKeys: number; coolingKeys: number[] } {
  return keyManager.describe();
}

export function isGroqConfigured(): boolean {
  return keyManager.keyCount > 0;
}

interface GroqChoiceMessage {
  content?: unknown;
}

interface GroqChatResponse {
  choices?: Array<{ message?: GroqChoiceMessage }>;
}

export async function createJsonCompletion(options: {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  label: string;
}): Promise<GroqCompletionResult> {
  if (keyManager.keyCount === 0) {
    throw new GroqConfigurationError(
      'No Groq API keys are configured. Set GROQ_API_1..GROQ_API_6 in the backend environment.'
    );
  }

  const attemptOrder = keyManager.buildAttemptOrder(
    Math.min(CURATION_ENGINE_CONFIG.maxGroqAttempts, keyManager.keyCount)
  );

  if (attemptOrder.length === 0) {
    throw new GroqRequestError('All configured Groq keys are cooling down', 0, 'rate_limit');
  }

  let lastFailure: GroqAttemptFailure | null = null;

  for (let attempt = 1; attempt <= attemptOrder.length; attempt++) {
    const keyIndex = attemptOrder[attempt - 1];
    const safeKeyIndex = keyIndex + 1;

    try {
      const response = await axios.post<GroqChatResponse>(
        config.groqApiUrl,
        {
          model: config.groqModel,
          temperature: options.temperature ?? CURATION_ENGINE_CONFIG.llmTemperature,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt }
          ],
          response_format: { type: 'json_object' }
        },
        {
          timeout: config.groqRequestTimeoutMs,
          headers: {
            Authorization: `Bearer ${keyManager.getSecret(keyIndex)}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data?.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.trim().length === 0) {
        lastFailure = {
          kind: 'unknown',
          status: response.status,
          rotate: true,
          cooldownMs: 0,
          message: 'Groq returned an empty completion'
        };
        logger.warn(SCOPE, 'Groq returned an empty completion', {
          label: options.label,
          keyIndex: safeKeyIndex,
          attempt,
          status: response.status
        });
        keyManager.advanceCursor();
        continue;
      }

      keyManager.markSuccess(keyIndex);
      keyManager.advanceCursor();

      logger.info(SCOPE, 'Groq completion succeeded', {
        label: options.label,
        keyIndex: safeKeyIndex,
        attempt,
        model: config.groqModel,
        contentLength: content.length
      });

      return { content, keyIndex: safeKeyIndex, attempts: attempt, model: config.groqModel };
    } catch (error) {
      const failure = classifyFailure(error);
      lastFailure = failure;
      keyManager.markFailure(keyIndex, failure.cooldownMs);

      const meta = {
        label: options.label,
        keyIndex: safeKeyIndex,
        attempt,
        errorType: failure.kind,
        ...(failure.status !== undefined ? { status: failure.status } : {}),
        ...(failure.detail !== undefined ? { detail: failure.detail } : {})
      };

      if (failure.kind === 'rate_limit') {
        logger.warn(SCOPE, 'Groq rate limit detected', meta);
      } else {
        logger.warn(SCOPE, `Groq request failed: ${failure.message}`, meta);
      }

      if (!failure.rotate) {
        throw new GroqRequestError(failure.message, attempt, failure.kind, failure.status);
      }

      keyManager.advanceCursor();

      if (attempt < attemptOrder.length) {
        logger.info(SCOPE, 'Rotating to next Groq key', {
          label: options.label,
          failedKeyIndex: safeKeyIndex,
          nextKeyIndex: attemptOrder[attempt] + 1,
          attempt: attempt + 1
        });
      }
    }
  }

  logger.error(SCOPE, 'All Groq keys failed', {
    label: options.label,
    attempts: attemptOrder.length,
    configuredKeys: keyManager.keyCount,
    lastErrorType: lastFailure?.kind ?? 'unknown',
    ...(lastFailure?.status !== undefined ? { lastStatus: lastFailure.status } : {})
  });

  throw new GroqRequestError(
    `All ${attemptOrder.length} Groq key attempt(s) failed: ${lastFailure?.message ?? 'unknown failure'}`,
    attemptOrder.length,
    lastFailure?.kind ?? 'unknown',
    lastFailure?.status
  );
}
