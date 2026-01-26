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

const TRAIT_WEIGHT_MAP: Record<keyof LeaderDecisionWeights, Partial<Record<string, number>>> = {
  aggression: {
    pacifist: -0.25,
    defensive: -0.1,
    expansionist: 0.3,
    fiery: 0.1,
    calm: -0.1,
    daring: 0.15,
    cautious: -0.15,
    proud: 0.1,
    arrogant: 0.2,
    "high": 0.25, // greed
    "low": -0.1,
  },
  cooperativeness: {
    coalition_builder: 0.3,
    transactional: 0.1,
    isolationist: -0.3,
    generous: 0.2,
    market_fair: 0.1,
    empathetic: 0.2,
    "high": 0.2, // empathy
    "medium": 0.1,
  },
  riskTolerance: {
    daring: 0.35,
    cautious: -0.2,
    measured: 0.1,
    gambler: 0.25,
    planner: -0.1,
    long_game: -0.05,
  },
  honesty: {
    keeps_word: 0.2,
    pragmatic: 0.1,
    vengeful: -0.15,
    trusting: 0.1,
    paranoid: -0.15,
  },
  patience: {
    long_game: 0.3,
    steady: 0.1,
    impatient: -0.3,
  },
  fairness: {
    generous: 0.25,
    market_fair: 0.1,
    hard_bargainer: -0.15,
  },
  empathy: {
    high: 0.3,
    medium: 0.1,
    low: -0.25,
  },
  greed: {
    high: 0.3,
    medium: 0.1,
    low: -0.2,
  },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createSeededRNG(seed: string): () => number {
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

function weightedSelect<T>(
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

function buildLeaderTraits(seed: string, resourceProfileName?: string): LeaderTraits {
  const rng = createSeededRNG(seed);
  const traits: Partial<LeaderTraits> = {};
  const normalizedProfileName = resourceProfileName || "default";
  const biases = RESOURCE_PROFILE_BIASES[normalizedProfileName];

  for (const traitName of Object.keys(TRAIT_OPTIONS) as Array<keyof typeof TRAIT_OPTIONS>) {
    const options = TRAIT_OPTIONS[traitName];
    const traitBias = biases?.[traitName] ?? {};
    traits[traitName] = weightedSelect(options, rng, traitBias) as LeaderTraits[typeof traitName];
  }

  const ticsCount = Math.min(3, Math.max(2, Math.floor(rng() * 4)));
  const tics: string[] = [];
  const ticPool = [...SPEECH_TIC_OPTIONS];
  for (let i = 0; i < ticsCount; i++) {
    const idx = Math.floor(rng() * ticPool.length);
    tics.push(ticPool.splice(idx, 1)[0]);
  }

  return {
    ...(traits as Omit<LeaderTraits, "speech_tics">),
    speech_tics: tics,
  };
}

function deriveDecisionWeights(traits: LeaderTraits): LeaderDecisionWeights {
  const base = { ...BASE_DECISION_WEIGHTS };

  for (const [weightKey, influenceMap] of Object.entries(TRAIT_WEIGHT_MAP) as Array<[keyof LeaderDecisionWeights, Partial<Record<string, number>>]>) {
    let delta = 0;
    for (const [traitName, traitValue] of Object.entries(traits) as Array<[keyof LeaderTraits, string | string[]]>) {
      if (traitName === "speech_tics") continue;
      const traitBias = influenceMap[String(traitValue)] ?? 0;
      delta += traitBias;
    }
    base[weightKey] = clamp01(base[weightKey] + delta * 0.12);
  }

  base.fairness = clamp01(base.fairness + (traits.fairness === "generous" ? 0.2 : traits.fairness === "hard_bargainer" ? -0.1 : 0));
  base.empathy = clamp01(base.empathy + (traits.empathy === "high" ? 0.2 : traits.empathy === "low" ? -0.2 : 0));

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
  const lines = [
    `Values ${traits.fairness.replace("_", " ")} fairness`,
    `Honors ${traits.honor.replace("_", " ")}`,
    `Leans ${traits.cooperation_style.replace("_", " ")} cooperation`,
  ];
  if (countryName) {
    lines.push(`Serves ${countryName} with ${traits.temperament} resolve`);
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

  private getSupabase() {
    return getSupabaseServerClient();
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

    const insertPayload = {
      game_id: request.gameId,
      country_id: request.countryId,
      leader_name: leaderName,
      title,
      public_values: publicValues,
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
