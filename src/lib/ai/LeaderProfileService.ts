import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResourceProfile } from "@/lib/game-engine/ResourceProfile";

type TraitValueMap = Record<string, string | string[]>;

export interface LeaderTraits {
  register: "plain" | "formal" | "folksy" | "streetwise";
  verbosity: "terse" | "balanced" | "expansive";
  directness: "blunt" | "diplomatic" | "flowery";
  temperament: "calm" | "fiery" | "icy";
  humor: "none" | "dry" | "playful";
  patience: "impatient" | "steady" | "long_game";
  risk_appetite: "cautious" | "measured" | "daring";
  aggression_doctrine: "pacifist" | "defensive" | "expansionist";
  cooperation_style: "isolationist" | "transactional" | "coalition_builder";
  honor: "pragmatic" | "keeps_word" | "vengeful";
  fairness: "hard_bargainer" | "market_fair" | "generous";
  paranoia: "trusting" | "wary" | "paranoid";
  pride: "humble" | "proud" | "arrogant";
  empathy: "low" | "medium" | "high";
  greed: "low" | "medium" | "high";
  ideology: "realist" | "idealist" | "opportunist";
  planning_style: "planner" | "improviser" | "gambler";
  speech_tics: string[];
}

export interface LeaderDecisionWeights {
  aggression: number;
  cooperativeness: number;
  riskTolerance: number;
  honesty: number;
  patience: number;
  fairness: number;
  empathy: number;
  greed: number;
}

export interface LeaderVoiceProfile {
  register: LeaderTraits["register"];
  verbosity: LeaderTraits["verbosity"];
  directness: LeaderTraits["directness"];
  tics: string[];
}

export interface LeaderProfile {
  id: string;
  gameId: string;
  countryId: string;
  leaderName: string;
  title: string | null;
  publicValues: string | null;
  summary: string | null;
  traits: LeaderTraits;
  decisionWeights: LeaderDecisionWeights;
  voiceProfile: LeaderVoiceProfile;
  seed: string;
  createdAt: string;
  updatedAt: string;
}

interface LeaderProfileRequest {
  gameId: string;
  countryId: string;
  resourceProfile?: ResourceProfile | null;
  countryName?: string;
}

interface SummaryContext {
  leaderName: string;
  title?: string | null;
  publicValues?: string | null;
  countryName?: string;
  resourceProfileName?: string | null;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL_NAME = "llama-3.3-70b-versatile";

function formatTraitsForPrompt(traits: LeaderTraits) {
  return Object.entries(traits)
    .filter(([key]) => key !== "speech_tics")
    .map(([key, value]) => `${key.replace(/_/g, " ")}=${value}`)
    .join(", ");
}

function formatDecisionWeightsForPrompt(weights: LeaderDecisionWeights) {
  return Object.entries(weights)
    .map(([key, value]) => `${key.replace(/_/g, " ")}=${value.toFixed(2)}`)
    .join(", ");
}

function getDominantDecisionWeight(weights: LeaderDecisionWeights) {
  let dominantKey: keyof LeaderDecisionWeights = "aggression";
  let maxDiff = 0;

  for (const [key, value] of Object.entries(weights) as Array<[keyof LeaderDecisionWeights, number]>) {
    const diff = Math.abs(value - 0.5);
    if (diff > maxDiff) {
      maxDiff = diff;
      dominantKey = key;
    }
  }

  return dominantKey;
}

function buildDominantTraitPhrase(weights: LeaderDecisionWeights) {
  const key = getDominantDecisionWeight(weights);
  const value = weights[key];

  const phrases: Record<keyof LeaderDecisionWeights, { high: string; low: string }> = {
    aggression: { high: "boldly assertive", low: "carefully defensive" },
    cooperativeness: { high: "alliance-minded", low: "self-reliant" },
    riskTolerance: { high: "comfortable with daring moves", low: "prefers safe choices" },
    honesty: { high: "unwaveringly honest", low: "pragmatically flexible" },
    patience: { high: "plans far ahead", low: "pushes for swift action" },
    fairness: { high: "treats others generously", low: "hard-nosed when bargaining" },
    empathy: { high: "deeply tuned to others", low: "focused on their own vision" },
    greed: { high: "driven by accumulation", low: "content with steadiness" },
  };

  const { high, low } = phrases[key];
  return value >= 0.5 ? high : low;
}

function extractSummaryFromReasoning(reasoning: string): string {
  const draftMatch = reasoning.match(/Draft:\s*"([^"]+)"/i);
  if (draftMatch && draftMatch[1]) {
    return draftMatch[1];
  }

  const quoteMatch = reasoning.match(/"([^"]+)"/);
  if (quoteMatch && quoteMatch[1]) {
    return quoteMatch[1];
  }

  return reasoning;
}

function extractJsonBlock(text: string): string | null {
  // Try to find JSON block with proper brace matching
  const start = text.indexOf("{");
  if (start === -1) return null;
  
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }
  }
  
  // Fallback to simple extraction
  const end = text.lastIndexOf("}");
  if (end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  
  return null;
}

function parseSummaryJson(raw: string): { summary: string; quote: string } | null {
  try {
    // Try direct parsing first
    let parsed: any;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      // Try extracting JSON block
      const jsonBlock = extractJsonBlock(raw);
      if (!jsonBlock) {
        console.log("[parseSummaryJson] No JSON block found");
        return null;
      }
      parsed = JSON.parse(jsonBlock);
    }
    
    if (!parsed || typeof parsed !== "object") {
      console.log("[parseSummaryJson] Parsed value is not an object");
      return null;
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const quote = typeof parsed.quote === "string" ? parsed.quote.trim() : "";
    
    console.log("[parseSummaryJson] Extracted fields:", {
      hasSummary: !!summary,
      hasQuote: !!quote,
      summaryLength: summary.length,
      quoteLength: quote.length,
    });
    
    if (!summary || !quote) {
      console.log("[parseSummaryJson] Missing summary or quote");
      return null;
    }

    return { summary, quote };
  } catch (error) {
    console.log("[parseSummaryJson] Parse error:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function formatQuoteForOutput(quote: string): string {
  const trimmed = quote.replace(/^"+|"+$/g, "").trim();
  return `"${trimmed}"`;
}

function buildLeaderSummaryPrompt(context: SummaryContext, traits: LeaderTraits, decisionWeights: LeaderDecisionWeights) {
  const dominantTrait = getDominantDecisionWeight(decisionWeights);
  const dominantValue = decisionWeights[dominantTrait];
  
  const topTraits = [
    `${traits.temperament} temperament`,
    `${traits.cooperation_style} cooperation`,
    `${traits.aggression_doctrine} military stance`,
  ];

  const instructions = [
    `You must respond with ONLY a valid JSON object. Do not include any text before or after the JSON.`,
    ``,
    `Create a character description for this leader:`,
    `Leader: ${context.leaderName} (${context.title || "Leader"})`,
    `Country: ${context.countryName || "Unknown"}`,
    `Most distinctive trait: ${dominantTrait} (${dominantValue.toFixed(2)})`,
    `Key traits: ${topTraits.join(", ")}`,
    "",
    "Focus on what makes this leader UNIQUE and interesting.",
    "Write 45-55 simple words about their standout personality and leadership style.",
    "Create a memorable one-line quote they would say.",
    "",
    "Your response must be a valid JSON object with exactly this structure:",
    "{",
    '  "summary": "45-55 word description of their personality and leadership style",',
    '  "quote": "A memorable one-line quote they would say"',
    "}",
    "",
    "Remember: Output ONLY the JSON object, nothing else."
  ].join("\n");

  return instructions;
}

function buildSummaryFallback(context: SummaryContext, traits: LeaderTraits, decisionWeights: LeaderDecisionWeights) {
  const dominantKey = getDominantDecisionWeight(decisionWeights);
  const dominantValue = decisionWeights[dominantKey];
  
  let focusTrait = "";
  let quoteContent = "";
  
  if (dominantKey === "aggression") {
    if (dominantValue > 0.6) {
      focusTrait = "boldly expansionist, always seeking opportunities to grow their power";
      quoteContent = "We grow or we stagnate—there is no middle ground.";
    } else {
      focusTrait = "carefully defensive, protecting what they've built";
      quoteContent = "Security comes before ambition, always.";
    }
  } else if (dominantKey === "cooperativeness") {
    if (dominantValue > 0.6) {
      focusTrait = "alliance-minded, building networks of mutual benefit";
      quoteContent = "Together we're stronger than any of us alone.";
    } else {
      focusTrait = "self-reliant, trusting their own judgment above all";
      quoteContent = "I decide our path—no one else.";
    }
  } else if (dominantKey === "riskTolerance") {
    if (dominantValue > 0.6) {
      focusTrait = "daring, willing to gamble for big wins";
      quoteContent = "Fortune favors the bold.";
    } else {
      focusTrait = "cautious, preferring sure paths over risky moves";
      quoteContent = "Slow and steady keeps us alive.";
    }
  } else if (dominantKey === "honesty") {
    if (dominantValue > 0.6) {
      focusTrait = "straightforward and honest in all dealings";
      quoteContent = "My word is my bond.";
    } else {
      focusTrait = "pragmatic, bending rules when needed";
      quoteContent = "Principles are fine, but survival matters more.";
    }
  } else if (dominantKey === "patience") {
    if (dominantValue > 0.6) {
      focusTrait = "strategic thinker who plans many steps ahead";
      quoteContent = "I'm building something that will last generations.";
    } else {
      focusTrait = "quick to act, demanding swift results";
      quoteContent = "We move now, or we lose our chance.";
    }
  } else {
    focusTrait = "pragmatic leader balancing multiple priorities";
    quoteContent = "I do what works.";
  }

  const temperamentNote = traits.temperament === "fiery" ? "Their fiery temperament" : 
                          traits.temperament === "icy" ? "Their cool demeanor" : "Their calm presence";
  
  const summary = `${context.leaderName}, ${context.title || "leader"} of ${context.countryName || "their nation"}, is ${focusTrait}. ${temperamentNote} shapes every interaction.`;
  const quote = `"${quoteContent}"`;

  return `${summary}\n\n${quote}`;
}

const TRAIT_OPTIONS: Record<keyof Omit<LeaderTraits, "speech_tics">, string[]> = {
  register: ["plain", "formal", "folksy", "streetwise"],
  verbosity: ["terse", "balanced", "expansive"],
  directness: ["blunt", "diplomatic", "flowery"],
  temperament: ["calm", "fiery", "icy"],
  humor: ["none", "dry", "playful"],
  patience: ["impatient", "steady", "long_game"],
  risk_appetite: ["cautious", "measured", "daring"],
  aggression_doctrine: ["pacifist", "defensive", "expansionist"],
  cooperation_style: ["isolationist", "transactional", "coalition_builder"],
  honor: ["pragmatic", "keeps_word", "vengeful"],
  fairness: ["hard_bargainer", "market_fair", "generous"],
  paranoia: ["trusting", "wary", "paranoid"],
  pride: ["humble", "proud", "arrogant"],
  empathy: ["low", "medium", "high"],
  greed: ["low", "medium", "high"],
  ideology: ["realist", "idealist", "opportunist"],
  planning_style: ["planner", "improviser", "gambler"],
};

const SPEECH_TIC_OPTIONS = [
  "leans on metaphors about storms",
  "ends sentences with 'as always'",
  "starts replies with 'We all know'",
  "uses triads like 'strength, stability, success'",
  "sprinkles in short questions (e.g., 'Right?')",
  "refers to ancestors or cities ('Our founders')",
  "drops in mild humor ('Since we're all grown-ups')",
  "prefers verbs of motion ('Let's move forward')",
  "calls the other leader 'my friend' even when wary",
];

const RESOURCE_PROFILE_BIASES: Record<string, Partial<Record<keyof Omit<LeaderTraits, "speech_tics">, Partial<Record<string, number>>>>> = {
  "Trade Hub": {
    cooperation_style: { coalition_builder: 3, transactional: 2 },
    fairness: { market_fair: 3, generous: 2 },
    greed: { low: 1, medium: 2 },
    humor: { playful: 1, dry: 1 },
  },
  "Military State": {
    aggression_doctrine: { defensive: 2, expansionist: 3 },
    risk_appetite: { daring: 2 },
    temperament: { fiery: 2 },
    pride: { arrogant: 2, proud: 1 },
    directness: { blunt: 3 },
  },
  "Tech Innovator": {
    planning_style: { planner: 4 },
    patience: { long_game: 3 },
    risk_appetite: { measured: 2 },
    directness: { diplomatic: 2, flowery: 1 },
  },
  "Agricultural Hub": {
    temperament: { calm: 2 },
    fairness: { generous: 2 },
    cooperation_style: { coalition_builder: 2 },
    humor: { dry: 1 },
  },
  "Oil Kingdom": {
    greed: { high: 2 },
    fairness: { hard_bargainer: 2 },
    paranoia: { wary: 2, paranoid: 1 },
    directness: { blunt: 2 },
  },
  "Mining Empire": {
    aggression_doctrine: { defensive: 2 },
    risk_appetite: { measured: 2 },
    patience: { steady: 2 },
    temperament: { icy: 1 },
  },
  "Industrial Powerhouse": {
    cooperation_style: { transactional: 2 },
    patience: { steady: 2 },
    risk_appetite: { measured: 2 },
    planning_style: { planner: 2 },
  },
};

const TITLE_BANK: Record<string, string[]> = {
  default: ["Keeper of the Flame", "Guardian of Prosperity", "Voice of the Council", "First Consul"],
  "Trade Hub": ["Chair of the Exchange", "Custodian of Trade Winds", "Voice of the Market"],
  "Military State": ["Defender General", "High Marshal", "Steel Regent"],
  "Tech Innovator": ["Chief Engineer", "Innovations Chancellor", "Prime Architect"],
  "Agricultural Hub": ["Harvest Steward", "Fields Protector", "Sovereign of Plenty"],
};

const NAME_BANK = [
  "Maris", "Aldric", "Teryn", "Liora", "Bast", "Helia", "Rae", "Cormac",
  "Isolde", "Navar", "Sira", "Kael", "Elara", "Thane", "Vera", "Jorren",
  "Mirek", "Calia", "Sorin", "Kasia",
];

const BASE_DECISION_WEIGHTS: LeaderDecisionWeights = {
  aggression: 0.5,
  cooperativeness: 0.5,
  riskTolerance: 0.5,
  honesty: 0.6,
  patience: 0.5,
  fairness: 0.5,
  empathy: 0.5,
  greed: 0.5,
};

type TraitInfluenceMap = Partial<Record<keyof LeaderTraits, Partial<Record<string, number>>>>;

const TRAIT_WEIGHT_MAP: Record<keyof LeaderDecisionWeights, TraitInfluenceMap> = {
  aggression: {
    aggression_doctrine: { pacifist: -0.25, defensive: -0.1, expansionist: 0.3 },
    temperament: { fiery: 0.1, calm: -0.1 },
    risk_appetite: { daring: 0.15, cautious: -0.15 },
    pride: { proud: 0.1, arrogant: 0.2 },
    greed: { high: 0.25, low: -0.1 },
  },
  cooperativeness: {
    cooperation_style: { coalition_builder: 0.3, transactional: 0.1, isolationist: -0.3 },
    fairness: { generous: 0.15, market_fair: 0.08 },
    empathy: { high: 0.2, medium: 0.1 },
  },
  riskTolerance: {
    risk_appetite: { daring: 0.35, measured: 0.1, cautious: -0.2 },
    planning_style: { gambler: 0.25, planner: -0.1 },
    temperament: { fiery: 0.1, calm: -0.05 },
  },
  honesty: {
    honor: { keeps_word: 0.2, pragmatic: 0.1, vengeful: -0.15 },
    paranoia: { trusting: 0.1, paranoia: -0.15, wary: -0.05 },
  },
  patience: {
    patience: { long_game: 0.3, steady: 0.1, impatient: -0.3 },
    planning_style: { planner: 0.15, improviser: -0.1 },
  },
  fairness: {
    fairness: { generous: 0.25, market_fair: 0.1, hard_bargainer: -0.15 },
  },
  empathy: {
    empathy: { high: 0.3, medium: 0.1, low: -0.25 },
  },
  greed: {
    greed: { high: 0.3, medium: 0.1, low: -0.2 },
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createSeededRNG(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  if (hash === 0) hash = 123456789;
  return function () {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    return ((hash >>> 0) / 4294967296);
  };
}

export function weightedSelect<T>(
  options: T[],
  rng: () => number,
  bias: Partial<Record<string, number>> = {}
): T {
  const weights = options.map((option) => {
    const weight = 1 + (bias[String(option)] ?? 0);
    return Math.max(0.01, weight);
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let target = rng() * total;
  for (let i = 0; i < options.length; i++) {
    target -= weights[i];
    if (target <= 0) {
      return options[i];
    }
  }
  return options[options.length - 1];
}

export function buildLeaderTraits(seed: string, resourceProfileName?: string): LeaderTraits {
  const rng = createSeededRNG(seed);
  const traits: Record<string, any> = {};
  const normalizedProfileName = resourceProfileName || "default";
  const biases = RESOURCE_PROFILE_BIASES[normalizedProfileName];

  const traitNames = Object.keys(TRAIT_OPTIONS) as Array<keyof typeof TRAIT_OPTIONS>;
  for (const traitName of traitNames) {
    const options = TRAIT_OPTIONS[traitName];
    const traitBias = biases?.[traitName] ?? {};
    traits[traitName] = weightedSelect(options, rng, traitBias);
  }

  const ticsCount = Math.min(3, Math.max(2, Math.floor(rng() * 4)));
  const tics: string[] = [];
  const ticPool = [...SPEECH_TIC_OPTIONS];
  for (let i = 0; i < ticsCount; i++) {
    const idx = Math.floor(rng() * ticPool.length);
    tics.push(ticPool.splice(idx, 1)[0]);
  }

  return {
    ...traits,
    speech_tics: tics,
  } as LeaderTraits;
}

function deriveDecisionWeights(traits: LeaderTraits): LeaderDecisionWeights {
  const base = { ...BASE_DECISION_WEIGHTS };

  for (const [weightKey, influenceMap] of Object.entries(
    TRAIT_WEIGHT_MAP
  ) as Array<[keyof LeaderDecisionWeights, TraitInfluenceMap]>) {
    let delta = 0;
    for (const [traitName, traitValue] of Object.entries(traits) as Array<
      [keyof LeaderTraits, string | string[]]
    >) {
      if (traitName === "speech_tics") continue;
      const traitInfluences = influenceMap[traitName];
      if (!traitInfluences) continue;
      delta += traitInfluences[String(traitValue)] ?? 0;
    }
    base[weightKey] = clamp01(base[weightKey] + delta * 0.12);
  }

  base.fairness = clamp01(
    base.fairness +
      (traits.fairness === "generous" ? 0.2 : traits.fairness === "hard_bargainer" ? -0.1 : 0),
  );
  base.empathy = clamp01(
    base.empathy +
      (traits.empathy === "high" ? 0.2 : traits.empathy === "low" ? -0.2 : 0),
  );

  return base;
}

function buildVoiceProfile(traits: LeaderTraits): LeaderVoiceProfile {
  return {
    register: traits.register,
    verbosity: traits.verbosity,
    directness: traits.directness,
    tics: traits.speech_tics.slice(0, 2),
  };
}

function buildLeaderName(seed: string): string {
  const rng = createSeededRNG(seed + "-name");
  const firstName = NAME_BANK[Math.floor(rng() * NAME_BANK.length)];
  const lastName = NAME_BANK[Math.floor(rng() * NAME_BANK.length)] + "a";
  return `${firstName} ${lastName}`;
}

function buildTitle(resourceProfileName?: string): string {
  const pool = TITLE_BANK[resourceProfileName || "default"] ?? TITLE_BANK.default;
  const index = Math.floor(createSeededRNG(resourceProfileName ?? "default-title")() * pool.length);
  return pool[index];
}

function buildPublicValues(traits: LeaderTraits, countryName?: string): string {
  const formatTrait = (t: string) => t.replace(/_/g, " ");
  const lines = [
    `Values ${formatTrait(traits.fairness)} fairness`,
    `Honors ${formatTrait(traits.honor)}`,
    `Leans ${formatTrait(traits.cooperation_style)} cooperation`,
  ];
  if (countryName) {
    const aggression = traits.aggression_doctrine === 'expansionist' 
      ? 'ambitious' 
      : traits.aggression_doctrine === 'defensive'
      ? 'protective'
      : 'peaceful';
    lines.push(`Serves ${countryName} with ${aggression} ${traits.temperament} leadership`);
  }
  return lines.join(", ");
}

function normalizeRow(row: any): LeaderProfile {
  return {
    id: row.id,
    gameId: row.game_id,
    countryId: row.country_id,
    leaderName: row.leader_name,
    title: row.title,
    publicValues: row.public_values,
    summary: row.summary ?? null,
    traits: row.traits,
    decisionWeights: row.decision_weights,
    voiceProfile: row.voice_profile,
    seed: row.seed,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class LeaderProfileService {
  private cache = new Map<string, LeaderProfile>();
  private groqApiKey: string | null;
  private groqModelName = GROQ_MODEL_NAME;
  private groqApiUrl = GROQ_API_URL;

  constructor() {
    this.groqApiKey = process.env.GROQ_API_KEY || null;
    if (!this.groqApiKey) {
      console.warn("[LeaderProfileService] GROQ_API_KEY not configured; leader summaries will use fallback text.");
    } else {
      console.log(`[LeaderProfileService] Using Groq model: ${this.groqModelName}`);
    }
  }

  private getSupabase() {
    return getSupabaseServerClient();
  }

  private async callGroqForSummary(prompt: string): Promise<string | null> {
    if (!this.groqApiKey) {
      return null;
    }

    try {
      const response = await fetch(this.groqApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.groqApiKey}`,
        },
        body: JSON.stringify({
          model: this.groqModelName,
          messages: [
            {
              role: "system",
              content:
                "You are a creative character writer who generates concise leader descriptions. You MUST respond with ONLY valid JSON. Never include explanations, markdown formatting, or any text outside the JSON object.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.7,
          top_p: 0.95,
          max_tokens: 500,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[LeaderProfileService] Groq summary request failed: ${response.status} ${response.statusText} - ${errorText}`
        );
        return null;
      }

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content;
      const reasoningText = data?.choices?.[0]?.message?.reasoning;
      const finishReason = data?.choices?.[0]?.finish_reason;

      console.log("[LeaderProfileService] Groq response:", {
        hasContent: !!rawText,
        hasReasoning: !!reasoningText,
        contentLength: rawText?.length || 0,
        finishReason,
        model: data?.model,
      });

      const candidateTexts: string[] = [];
      if (typeof rawText === "string" && rawText.trim() !== "") {
        candidateTexts.push(rawText);
      }
      if (typeof reasoningText === "string" && reasoningText.trim() !== "") {
        candidateTexts.push(reasoningText);
      }

      if (candidateTexts.length === 0) {
        console.error("[LeaderProfileService] No content returned from Groq API");
        return null;
      }

      for (const candidate of candidateTexts) {
        const parsed = parseSummaryJson(candidate.trim());
        if (parsed) {
          console.log("[LeaderProfileService] Parsed JSON successfully");
          return `${parsed.summary}\n\n${formatQuoteForOutput(parsed.quote)}`;
        }
      }

      // Log the actual content to debug parsing issues
      console.warn("[LeaderProfileService] JSON parse failed, raw content:", {
        rawText: rawText?.substring(0, 500),
        reasoningText: reasoningText?.substring(0, 500),
      });
      return null;
    } catch (error) {
      console.error("[LeaderProfileService] Groq summary request threw an error:", error);
      return null;
    }
  }

  private async generateLeaderSummaryFromTraits(
    context: SummaryContext,
    traits: LeaderTraits,
    decisionWeights: LeaderDecisionWeights
  ): Promise<string> {
    console.log("[LeaderProfileService] Generating summary for:", context.leaderName);
    const prompt = buildLeaderSummaryPrompt(context, traits, decisionWeights);
    const groqSummary = await this.callGroqForSummary(prompt);
    if (groqSummary) {
      console.log("[LeaderProfileService] Using Groq summary");
      return groqSummary;
    }

    console.log("[LeaderProfileService] Using fallback summary");
    return buildSummaryFallback(context, traits, decisionWeights);
  }

  private async ensureSummary(profile: LeaderProfile, context: SummaryContext): Promise<void> {
    if (profile.summary) {
      console.log("[LeaderProfileService] Summary already exists for:", profile.leaderName);
      return;
    }

    console.log("[LeaderProfileService] No summary, generating for:", profile.leaderName);
    const summary = await this.generateLeaderSummaryFromTraits(context, profile.traits, profile.decisionWeights);
    if (!summary) {
      console.error("[LeaderProfileService] Failed to generate summary");
      return;
    }

    console.log("[LeaderProfileService] Summary generated, persisting to DB");
    try {
      const supabase = this.getSupabase();
      const update = await supabase
        .from("leader_profiles")
        .update({ summary })
        .eq("id", profile.id);

      if (update.error) {
        console.error("[LeaderProfileService] Failed to persist leader summary:", update.error);
        return;
      }

      profile.summary = summary;
      console.log("[LeaderProfileService] Summary persisted successfully");
    } catch (error) {
      console.error("[LeaderProfileService] Error persisting leader summary:", error);
    }
  }

  async getOrCreateProfile(request: LeaderProfileRequest): Promise<LeaderProfile | null> {
    const cacheKey = `${request.gameId}:${request.countryId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const supabase = this.getSupabase();
    const existing = await supabase
      .from("leader_profiles")
      .select("*")
      .eq("game_id", request.gameId)
      .eq("country_id", request.countryId)
      .maybeSingle();

    if (existing.error) {
      console.warn("[LeaderProfileService] Failed to query existing profile:", existing.error);
    }

    if (existing.data) {
      const profile = normalizeRow(existing.data);
      await this.ensureSummary(profile, {
        leaderName: profile.leaderName,
        title: profile.title,
        publicValues: profile.publicValues,
        countryName: request.countryName,
        resourceProfileName: request.resourceProfile?.name ?? null,
      });
      this.cache.set(cacheKey, profile);
      return profile;
    }

    const seed = `${request.gameId}:${request.countryId}`;
    const traits = buildLeaderTraits(seed, request.resourceProfile?.name);
    const decisionWeights = deriveDecisionWeights(traits);
    const voiceProfile = buildVoiceProfile(traits);
    const leaderName = buildLeaderName(seed);
    const title = buildTitle(request.resourceProfile?.name);
    const publicValues = buildPublicValues(traits, request.countryName);
    const summaryContext = {
      leaderName,
      title,
      publicValues,
      countryName: request.countryName,
      resourceProfileName: request.resourceProfile?.name ?? null,
    };
    const summary = await this.generateLeaderSummaryFromTraits(summaryContext, traits, decisionWeights);

    const insertPayload = {
      game_id: request.gameId,
      country_id: request.countryId,
      leader_name: leaderName,
      title,
      public_values: publicValues,
      summary,
      traits,
      decision_weights: decisionWeights,
      voice_profile: voiceProfile,
      seed,
    };

    const created = await supabase.from("leader_profiles").insert(insertPayload).select().single();

    if (created.error || !created.data) {
      console.error("[LeaderProfileService] Failed to insert new leader profile:", created.error);
      return null;
    }

    const profile = normalizeRow(created.data);
    this.cache.set(cacheKey, profile);
    return profile;
  }
}
