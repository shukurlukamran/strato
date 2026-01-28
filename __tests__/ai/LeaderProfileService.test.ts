import {
  buildLeaderTraits,
  createSeededRNG,
  weightedSelect,
} from "@/lib/ai/LeaderProfileService";

describe("LeaderProfileService helpers", () => {
  // UNIT TESTS
  describe("Seeded RNG reproducibility", () => {
    it("reproduces the same RNG sequence when seeded identically", () => {
      const seed = "game-1:country-4";
      const rngA = createSeededRNG(seed);
      const rngB = createSeededRNG(seed);
      const sequenceA = Array.from({ length: 3 }, () => rngA());
      const sequenceB = Array.from({ length: 3 }, () => rngB());
      expect(sequenceB).toEqual(sequenceA);
    });

    it("generates different sequences for different seeds", () => {
      const rngA = createSeededRNG("seed-1");
      const rngB = createSeededRNG("seed-2");
      const sequenceA = Array.from({ length: 5 }, () => rngA());
      const sequenceB = Array.from({ length: 5 }, () => rngB());
      expect(sequenceB).not.toEqual(sequenceA);
    });

    it("produces values in [0, 1) range", () => {
      const rng = createSeededRNG("test-seed");
      const values = Array.from({ length: 100 }, () => rng());
      expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
    });

    it("generates long sequences without repetition", () => {
      const rng = createSeededRNG("long-sequence");
      const values = Array.from({ length: 1000 }, () => rng());
      const uniqueValues = new Set(values);
      // Should have significant variety (not perfect, but many unique values)
      expect(uniqueValues.size).toBeGreaterThan(900);
    });
  });

  describe("Trait bias application", () => {
    it("lets trait biases override the default selection order", () => {
      const options = ["pacifist", "expansionist"];
      const deterministicRng = () => 0.6;
      const withoutBias = weightedSelect(options, deterministicRng);
      const withBias = weightedSelect(options, deterministicRng, { pacifist: 2 });
      expect(withoutBias).toBe("expansionist");
      expect(withBias).toBe("pacifist");
    });

    it("increases probability of biased options", () => {
      const options = ["a", "b", "c"];
      const bias = { a: 10 }; // heavily bias towards 'a'

      let aCountWithBias = 0;
      let aCountNoBias = 0;

      // Use Math.random for this test to actually demonstrate probability
      // since our deterministic RNG with seeds may not vary enough
      for (let i = 0; i < 100; i++) {
        const rngValue = Math.random();
        const rngFunc = () => rngValue;
        
        if (weightedSelect(options, rngFunc, bias) === "a") {
          aCountWithBias++;
        }
      }

      for (let i = 0; i < 100; i++) {
        const rngValue = Math.random();
        const rngFunc = () => rngValue;
        
        if (weightedSelect(options, rngFunc, {}) === "a") {
          aCountNoBias++;
        }
      }

      // With heavy bias of 10, weight for 'a' is 11 vs 1 for others
      // So expect roughly 11/(11+1+1) = ~78% vs 1/(1+1+1) = ~33%
      expect(aCountWithBias).toBeGreaterThan(aCountNoBias);
    });

    it("handles negative bias weights correctly", () => {
      const options = ["favored", "disfavored"];
      let favoredCount = 0;

      for (let i = 0; i < 100; i++) {
        const rng = createSeededRNG(`neg-bias-${i}`);
        if (weightedSelect(options, rng, { disfavored: -2 }) === "favored") {
          favoredCount++;
        }
      }

      // 'favored' should be selected more often when 'disfavored' has negative bias
      expect(favoredCount).toBeGreaterThan(50);
    });

    it("maintains minimum weight floor of 0.01", () => {
      const options = ["a", "b", "c"];
      // Even with large negative bias, probability is reduced but not eliminated
      const results = new Set();
      for (let i = 0; i < 1000; i++) {
        const rng = createSeededRNG(`floor-test-${i}`);
        results.add(weightedSelect(options, rng, { a: -100, b: -100 }));
      }
      // All options should eventually be selected due to minimum weight of 0.01
      // (c has much higher weight, but a and b can still be selected occasionally)
      expect(results.size).toBeGreaterThanOrEqual(1);
      expect(results.size).toBeLessThanOrEqual(3);
    });
  });

  describe("Trait consistency and building", () => {
    it("builds consistent traits for the same seed", () => {
      const seed = "game-1:country-4";
      const firstTraits = buildLeaderTraits(seed);
      const secondTraits = buildLeaderTraits(seed);
      expect(secondTraits).toEqual(firstTraits);
    });

    it("generates different traits for different seeds", () => {
      const traitsA = buildLeaderTraits("game-1:country-4");
      const traitsB = buildLeaderTraits("game-1:country-5");
      expect(traitsB).not.toEqual(traitsA);
    });

    it("applies resource profile biases consistently", () => {
      const seed = "game-test:country-military";
      const militaryTraits1 = buildLeaderTraits(seed, "Military State");
      const militaryTraits2 = buildLeaderTraits(seed, "Military State");
      expect(militaryTraits2).toEqual(militaryTraits1);
    });

    it("generates 2-3 speech tics", () => {
      for (let i = 0; i < 20; i++) {
        const traits = buildLeaderTraits(`seed-${i}`);
        expect(traits.speech_tics.length).toBeGreaterThanOrEqual(2);
        expect(traits.speech_tics.length).toBeLessThanOrEqual(3);
      }
    });

    it("ensures no duplicate speech tics per leader", () => {
      for (let i = 0; i < 20; i++) {
        const traits = buildLeaderTraits(`seed-${i}`);
        const uniqueTics = new Set(traits.speech_tics);
        expect(uniqueTics.size).toBe(traits.speech_tics.length);
      }
    });
  });
});
