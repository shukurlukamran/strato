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
const GROQ_MODEL_NAME = "openai/gpt-oss-20b";

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

function buildLeaderSummaryPrompt(context: SummaryContext, traits: LeaderTraits, decisionWeights: LeaderDecisionWeights) {
  const traitSummary = formatTraitsForPrompt(traits);
  const decisionSummary = formatDecisionWeightsForPrompt(decisionWeights);
  const instructions = [
    `Leader: ${context.leaderName}${context.title ? ` (${context.title})` : ""}`,
    `Country: ${context.countryName ?? "Unnamed nation"}`,
    `Resource profile: ${context.resourceProfileName ?? "Balanced"}`,
    `Public values: ${context.publicValues ?? "Not provided"}`,
    `Traits: ${traitSummary}`,
    `Decision weights: ${decisionSummary}`,
    "",
    "Write a single paragraph (40-60 words) describing this leader's personality, tone, and decision-making tendencies.",
    "Do not use bullet points, tables, or quotes—just natural prose.",
    "Emphasize their defining traits, how they communicate, and what drives their choices."
  ].join("\n");

  return instructions;
}

function buildSummaryFallback(context: SummaryContext, traits: LeaderTraits, decisionWeights: LeaderDecisionWeights) {
  const temperament = traits.temperament === "fiery" ? "fiery and passionate" : traits.temperament === "icy" ? "cool and analytical" : "calm and steady";
  const patience = traits.patience === "impatient" ? "pushes for quick decisions" : traits.patience === "long_game" ? "plans far ahead" : "takes deliberate action";
  const aggression = decisionWeights.aggression > 0.6 ? "drives aggressive expansion" : decisionWeights.aggression < 0.4 ? "prioritizes defensive protection" : "keeps a balanced foreign policy";
  const cooperation = decisionWeights.cooperativeness > 0.6 ? "seeks alliances" : decisionWeights.cooperativeness < 0.4 ? "stays independently minded" : "makes selective partnerships";
  const risk = decisionWeights.riskTolerance > 0.6 ? "embraces bold risk-taking" : decisionWeights.riskTolerance < 0.4 ? "prefers cautious moves" : "plays calculated risks";
  const speechStyle =
    traits.register === "formal"
      ? "formal, diplomatic language"
      : traits.register === "streetwise"
        ? "direct, pragmatic speech"
        : traits.register === "folksy"
          ? "conversational storytelling"
          : "casual, approachable tone";
  const values = context.publicValues ? context.publicValues.split(",")[0] : "a steady vision for their nation";
  const titleClause = context.title ? `${context.leaderName}, ${context.title},` : `${context.leaderName}`;
  const summary = `${titleClause} is ${temperament} who ${patience}. They ${aggression} yet ${cooperation}, while ${risk}. Their voice is ${speechStyle}, reinforcing ${values}${context.countryName ? ` for ${context.countryName}` : ""}.`;

  return summary;
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
                "You are a concise narrator summarizing political leaders. Respond with a single paragraph of 40-60 words. No quotes, lists, or annotations—just natural prose describing the leader's personality, communication, and strategic tilt.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.45,
          top_p: 0.9,
          max_tokens: 300,
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
      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        console.warn("[LeaderProfileService] Groq returned empty summary content");
        return null;
      }

      return content.replace(/\s+/g, " ").trim();
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
    const prompt = buildLeaderSummaryPrompt(context, traits, decisionWeights);
    const groqSummary = await this.callGroqForSummary(prompt);
    if (groqSummary) {
      return groqSummary;
    }

    return buildSummaryFallback(context, traits, decisionWeights);
  }

  private async ensureSummary(profile: LeaderProfile, context: SummaryContext): Promise<void> {
    if (profile.summary) {
      return;
    }

    const summary = await this.generateLeaderSummaryFromTraits(context, profile.traits, profile.decisionWeights);
    if (!summary) {
      return;
    }

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
