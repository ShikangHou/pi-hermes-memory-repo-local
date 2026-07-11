import * as fs from "node:fs";
import * as path from "node:path";
import type { AutoRecallMode, MemoryConfig, MemoryOverflowStrategy, ProjectMemoryMode, ReviewTransport, SessionSearchVariant, ThinkingLevel } from "./types.js";
import {
  DEFAULT_MEMORY_CHAR_LIMIT,
  DEFAULT_USER_CHAR_LIMIT,
  DEFAULT_PROJECT_CHAR_LIMIT,
  DEFAULT_PROJECTS_MEMORY_DIR,
  DEFAULT_NUDGE_INTERVAL,
  DEFAULT_FLUSH_MIN_TURNS,
  DEFAULT_NUDGE_TOOL_CALLS,
  DEFAULT_REVIEW_RECENT_MESSAGES,
  DEFAULT_FLUSH_RECENT_MESSAGES,
  DEFAULT_CONSOLIDATION_TIMEOUT_MS,
  DEFAULT_FAILURE_INJECTION_MAX_AGE_DAYS,
  DEFAULT_FAILURE_INJECTION_MAX_ENTRIES,
  DEFAULT_AUTO_RECALL_TOP_K,
  DEFAULT_AUTO_RECALL_BUDGET_CHARS,
  DEFAULT_AUTO_RECALL_MAX_ENTRY_CHARS,
  DEFAULT_AUTO_RECALL_MAX_TOKENS,
} from "./constants.js";
import { AGENT_ROOT, normalizeConfiguredMemoryDir, normalizeProjectsMemoryDir } from "./paths.js";

const MEMORY_OVERFLOW_STRATEGIES: readonly MemoryOverflowStrategy[] = ["auto-consolidate", "reject", "fifo-evict"];
const SESSION_SEARCH_VARIANTS: readonly SessionSearchVariant[] = ["legacy", "anchors"];
const REVIEW_TRANSPORTS: readonly ReviewTransport[] = ["direct", "subprocess"];
const THINKING_LEVELS: readonly ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
const PROJECT_MEMORY_MODES: readonly ProjectMemoryMode[] = ["central", "repo-local"];
const AUTO_RECALL_MODES: readonly AutoRecallMode[] = ["off", "suggest", "auto", "debug"];

function isReviewTransport(value: unknown): value is ReviewTransport {
  return typeof value === "string" && REVIEW_TRANSPORTS.includes(value as ReviewTransport);
}

function isMemoryOverflowStrategy(value: unknown): value is MemoryOverflowStrategy {
  return typeof value === "string" && MEMORY_OVERFLOW_STRATEGIES.includes(value as MemoryOverflowStrategy);
}

function isSessionSearchVariant(value: unknown): value is SessionSearchVariant {
  return typeof value === "string" && SESSION_SEARCH_VARIANTS.includes(value as SessionSearchVariant);
}

function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === "string" && THINKING_LEVELS.includes(value as ThinkingLevel);
}

function isProjectMemoryMode(value: unknown): value is ProjectMemoryMode {
  return typeof value === "string" && PROJECT_MEMORY_MODES.includes(value as ProjectMemoryMode);
}
function isAutoRecallMode(value: unknown): value is AutoRecallMode {
  return typeof value === "string" && AUTO_RECALL_MODES.includes(value as AutoRecallMode);
}

function normalizeProjectMemoryDirName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return null;
  if (path.isAbsolute(trimmed) || trimmed.includes("/") || trimmed.includes("\\")) return null;
  return trimmed;
}

const DEFAULT_CONFIG: MemoryConfig = {
  memoryMode: "policy-only",
  memoryPolicyStyle: "full",
  memoryCharLimit: DEFAULT_MEMORY_CHAR_LIMIT,
  userCharLimit: DEFAULT_USER_CHAR_LIMIT,
  projectCharLimit: DEFAULT_PROJECT_CHAR_LIMIT,
  nudgeInterval: DEFAULT_NUDGE_INTERVAL,
  reviewRecentMessages: DEFAULT_REVIEW_RECENT_MESSAGES,
  reviewEnabled: true,
  reviewTransport: "direct",
  flushOnCompact: true,
  flushOnShutdown: true,
  flushMinTurns: DEFAULT_FLUSH_MIN_TURNS,
  flushRecentMessages: DEFAULT_FLUSH_RECENT_MESSAGES,
  memoryOverflowStrategy: "auto-consolidate",
  autoConsolidate: true,
  correctionDetection: true,
  failureInjectionEnabled: true,
  failureInjectionMaxAgeDays: DEFAULT_FAILURE_INJECTION_MAX_AGE_DAYS,
  failureInjectionMaxEntries: DEFAULT_FAILURE_INJECTION_MAX_ENTRIES,
  consolidationTimeoutMs: DEFAULT_CONSOLIDATION_TIMEOUT_MS,
  nudgeToolCalls: DEFAULT_NUDGE_TOOL_CALLS,
  autoRecallTopK: DEFAULT_AUTO_RECALL_TOP_K,
  autoRecallBudgetChars: DEFAULT_AUTO_RECALL_BUDGET_CHARS,
  autoRecallMaxEntryChars: DEFAULT_AUTO_RECALL_MAX_ENTRY_CHARS,
  autoRecallMaxTokens: DEFAULT_AUTO_RECALL_MAX_TOKENS,
  autoRecallMode: "off",
  autoRecallEnabled: false,
  projectsMemoryDir: DEFAULT_PROJECTS_MEMORY_DIR,
  projectMemoryMode: "repo-local",
  projectMemoryDirName: ".pi",
  sessionSearch: { variant: "legacy" },
};

export const DEFAULT_CONFIG_PATH = path.join(
  AGENT_ROOT,
  "hermes-memory-config.json",
);

export function loadConfig(configPath = DEFAULT_CONFIG_PATH): MemoryConfig {
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      // Merge: override defaults with user config
      const config: MemoryConfig = { ...DEFAULT_CONFIG };
      const isNonNegativeNumber = (value: unknown): value is number => (
        typeof value === "number" && Number.isFinite(value) && value >= 0
      );
      const isStringArray = (value: unknown): value is string[] => (
        Array.isArray(value) && value.every((item) => typeof item === "string")
      );
      let hasLegacyAutoConsolidate = false;
      let hasMemoryOverflowStrategy = false;
      if (parsed.memoryMode === "policy-only" || parsed.memoryMode === "legacy-inject") config.memoryMode = parsed.memoryMode;
      if (
        parsed.memoryPolicyStyle === "full" ||
        parsed.memoryPolicyStyle === "compact" ||
        parsed.memoryPolicyStyle === "custom" ||
        parsed.memoryPolicyStyle === "none"
      ) config.memoryPolicyStyle = parsed.memoryPolicyStyle;
      if (typeof parsed.memoryPolicyCustomText === "string") config.memoryPolicyCustomText = parsed.memoryPolicyCustomText;
      if (typeof parsed.memoryCharLimit === "number") config.memoryCharLimit = parsed.memoryCharLimit;
      if (typeof parsed.userCharLimit === "number") config.userCharLimit = parsed.userCharLimit;
      if (typeof parsed.nudgeInterval === "number") config.nudgeInterval = parsed.nudgeInterval;
      if (isNonNegativeNumber(parsed.reviewRecentMessages)) config.reviewRecentMessages = parsed.reviewRecentMessages;
      if (typeof parsed.reviewEnabled === "boolean") config.reviewEnabled = parsed.reviewEnabled;
      if (isReviewTransport(parsed.reviewTransport)) config.reviewTransport = parsed.reviewTransport;
      if (typeof parsed.flushOnCompact === "boolean") config.flushOnCompact = parsed.flushOnCompact;
      if (typeof parsed.flushOnShutdown === "boolean") config.flushOnShutdown = parsed.flushOnShutdown;
      if (typeof parsed.flushMinTurns === "number") config.flushMinTurns = parsed.flushMinTurns;
      if (isNonNegativeNumber(parsed.flushRecentMessages)) config.flushRecentMessages = parsed.flushRecentMessages;
      if (typeof parsed.autoConsolidate === "boolean") {
        config.autoConsolidate = parsed.autoConsolidate;
        hasLegacyAutoConsolidate = true;
      }
      if (isMemoryOverflowStrategy(parsed.memoryOverflowStrategy)) {
        config.memoryOverflowStrategy = parsed.memoryOverflowStrategy;
        hasMemoryOverflowStrategy = true;
      }
      if (typeof parsed.correctionDetection === "boolean") config.correctionDetection = parsed.correctionDetection;
      if (isStringArray(parsed.correctionStrongPatterns)) config.correctionStrongPatterns = parsed.correctionStrongPatterns;
      if (isStringArray(parsed.correctionWeakPatterns)) config.correctionWeakPatterns = parsed.correctionWeakPatterns;
      if (isStringArray(parsed.correctionNegativePatterns)) config.correctionNegativePatterns = parsed.correctionNegativePatterns;
      if (isStringArray(parsed.correctionDirectiveWords)) config.correctionDirectiveWords = parsed.correctionDirectiveWords;
      if (typeof parsed.consolidationTimeoutMs === "number") config.consolidationTimeoutMs = parsed.consolidationTimeoutMs;
      if (typeof parsed.failureInjectionEnabled === "boolean") config.failureInjectionEnabled = parsed.failureInjectionEnabled;
      if (typeof parsed.failureInjectionMaxAgeDays === "number") config.failureInjectionMaxAgeDays = parsed.failureInjectionMaxAgeDays;
      if (typeof parsed.failureInjectionMaxEntries === "number") config.failureInjectionMaxEntries = parsed.failureInjectionMaxEntries;
      if (typeof parsed.nudgeToolCalls === "number") config.nudgeToolCalls = parsed.nudgeToolCalls;
      if (isNonNegativeNumber(parsed.autoRecallTopK)) config.autoRecallTopK = parsed.autoRecallTopK;
      if (isNonNegativeNumber(parsed.autoRecallBudgetChars)) config.autoRecallBudgetChars = parsed.autoRecallBudgetChars;
      if (isNonNegativeNumber(parsed.autoRecallMaxEntryChars)) config.autoRecallMaxEntryChars = parsed.autoRecallMaxEntryChars;
      if (isNonNegativeNumber(parsed.autoRecallMaxTokens)) config.autoRecallMaxTokens = parsed.autoRecallMaxTokens;
      if (isAutoRecallMode(parsed.autoRecallMode)) config.autoRecallMode = parsed.autoRecallMode;
      if (typeof parsed.autoRecallEnabled === "boolean") config.autoRecallEnabled = parsed.autoRecallEnabled;
      if (config.autoRecallEnabled === false) config.autoRecallMode = "off";
      if (typeof parsed.projectCharLimit === "number") config.projectCharLimit = parsed.projectCharLimit;
      if (typeof parsed.memoryDir === "string") {
        const normalizedMemoryDir = normalizeConfiguredMemoryDir(parsed.memoryDir);
        if (normalizedMemoryDir) config.memoryDir = normalizedMemoryDir;
      }
      if (typeof parsed.projectsMemoryDir === "string") {
        const normalizedProjectsMemoryDir = normalizeProjectsMemoryDir(parsed.projectsMemoryDir);
        if (normalizedProjectsMemoryDir) config.projectsMemoryDir = normalizedProjectsMemoryDir;
      }
      if (isProjectMemoryMode(parsed.projectMemoryMode)) config.projectMemoryMode = parsed.projectMemoryMode;
      const normalizedProjectMemoryDirName = normalizeProjectMemoryDirName(parsed.projectMemoryDirName);
      if (normalizedProjectMemoryDirName) config.projectMemoryDirName = normalizedProjectMemoryDirName;
      if (
        typeof parsed.sessionSearch === "object" &&
        parsed.sessionSearch !== null &&
        isSessionSearchVariant(parsed.sessionSearch.variant)
      ) {
        config.sessionSearch = { variant: parsed.sessionSearch.variant };
      }
      if (typeof parsed.llmModelOverride === "string") {
        const trimmed = parsed.llmModelOverride.trim();
        if (trimmed.length > 0) config.llmModelOverride = trimmed;
      }
      if (isThinkingLevel(parsed.llmThinkingOverride)) config.llmThinkingOverride = parsed.llmThinkingOverride;
      if (hasMemoryOverflowStrategy) {
        config.autoConsolidate = config.memoryOverflowStrategy === "auto-consolidate";
      } else if (hasLegacyAutoConsolidate) {
        config.memoryOverflowStrategy = config.autoConsolidate ? "auto-consolidate" : "reject";
      }
      return config;
    }
  } catch {
    // Fall back to defaults on parse error or access issues
  }
  return { ...DEFAULT_CONFIG };
}
