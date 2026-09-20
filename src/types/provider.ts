/**
 * AI ????????
 * ??????src/modules/ai-providers.js
 */

export interface ModelAlias {
  name: string;
  alias?: string;
  priority?: number;
  testModel?: string;
  image?: boolean;
  thinking?: Record<string, unknown>;
}

export interface ApiKeyEntry {
  apiKey: string;
  proxyUrl?: string;
  weight?: number;
  authIndex?: string;
}

export interface CloakConfig {
  mode?: string;
  strictMode?: boolean;
  sensitiveWords?: string[];
  cacheUserId?: boolean;
}

export interface GeminiKeyConfig {
  apiKey: string;
  priority?: number;
  weight?: number;
  prefix?: string;
  baseUrl?: string;
  proxyUrl?: string;
  models?: ModelAlias[];
  headers?: Record<string, string>;
  excludedModels?: string[];
  disableCooling?: boolean;
  hideNoAvailableChannel?: boolean;
  providerRetryCount?: number | null;
  providerRetryStatusCodes?: number[] | null;
  authIndex?: string;
}

export interface ProviderKeyConfig {
  apiKey: string;
  /** Antigravity routing project, or Vertex override for official SA credentials. */
  projectId?: string;
  /** Official Vertex service-account JSON (private key lives here). */
  serviceAccount?: Record<string, unknown>;
  /** Optional Vertex region, e.g. us-central1. */
  location?: string;
  /** Optional display identity for a Vertex service account. */
  email?: string;
  priority?: number;
  weight?: number;
  prefix?: string;
  baseUrl?: string;
  websockets?: boolean;
  proxyUrl?: string;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  excludedModels?: string[];
  disableCooling?: boolean;
  /**
   * Codex-only override for handling /v1/responses/compact locally.
   * `undefined` inherits the global local-compact switch.
   */
  localCompact?: boolean;
  /**
   * Codex-only exact text deltas to drop as fake first tokens.
   * Entries are not trimmed; a single space must remain a space.
   */
  streamFakeFirstTokens?: string[];
  cloak?: CloakConfig;
  fingerprintProfile?: string;
  hideNoAvailableChannel?: boolean;
  providerRetryCount?: number | null;
  providerRetryStatusCodes?: number[] | null;
  authIndex?: string;
}

export interface OpenAIProviderConfig {
  name: string;
  prefix?: string;
  baseUrl: string;
  apiKeyEntries: ApiKeyEntry[];
  disabled?: boolean;
  headers?: Record<string, string>;
  models?: ModelAlias[];
  priority?: number;
  testModel?: string;
  disableCooling?: boolean;
  hideNoAvailableChannel?: boolean;
  providerRetryCount?: number | null;
  providerRetryStatusCodes?: number[] | null;
  authIndex?: string;
  /** Original index in the backend openai-compatibility array. */
  sourceIndex?: number;
  [key: string]: unknown;
}
