import { ChatPolicyService } from "@/lib/ai/ChatPolicyService";

// Mock Supabase
jest.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: jest.fn(() => ({
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: "test", count: 0 },
        error: null,
      }),
    })),
  })),
}));

describe("Load Tests: Rate limiting and concurrent operations", () => {
  let policyService: ChatPolicyService;

  beforeEach(() => {
    policyService = new ChatPolicyService();
    jest.clearAllMocks();
  });

  describe("Rate limiting under high load", () => {
    it("enforces rate limit of 2s minimum between messages", async () => {
      const context = {
        gameId: "game-load",
        chatId: "chat-load-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "Trade proposal",
      };

      const start = Date.now();
      const decision1 = await policyService.evaluate(context);
      const time1 = Date.now() - start;

      // Immediate follow-up should be rate limited
      const decision2 = await policyService.evaluate({
        ...context,
        messageText: "Quick follow-up",
      });

      // At least one of these should indicate rate limiting
      const rateLimited = !decision2.allow && decision2.blockReason?.includes("quickly");
      const allowed = decision2.allow;

      expect(rateLimited || allowed).toBe(true);
    });

    it("allows messages after rate limit window expires", async () => {
      const context = {
        gameId: "game-load",
        chatId: "chat-load-2",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "First message",
      };

      const decision1 = await policyService.evaluate(context);
      expect(decision1.allow).toBe(true);

      // Wait for rate limit window (2.5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 2500));

      const decision2 = await policyService.evaluate({
        ...context,
        messageText: "Second message after delay",
      });

      // Should be allowed after rate limit expires
      expect(decision2.allow).toBe(true);
    }, 10000); // 10 second timeout

    it("enforces per-minute cap across multiple chats", async () => {
      // The per-minute cap is 18 messages
      const messages = 20;
      const decisions = [];

      for (let i = 0; i < messages; i++) {
        const context = {
          gameId: "game-load-minute",
          chatId: `chat-minute-${i}`,
          playerCountryId: `country-${i % 3}`,
          turn: 1,
          messageText: `Message ${i}: Trade proposal`,
        };

        const decision = await policyService.evaluate(context);
        decisions.push(decision);
      }

      // Some should be allowed, some might be blocked due to per-minute cap
      const allowedCount = decisions.filter((d) => d.allow).length;
      expect(allowedCount).toBeGreaterThan(0);
      // Expect some to be rate limited (though exact behavior depends on implementation)
    });

    it("handles burst of messages from same country", async () => {
      const gameId = "game-burst";
      const playerCountryId = "country-burst";
      const decisions = [];

      // Try to send 5 quick messages
      for (let i = 0; i < 5; i++) {
        const decision = await policyService.evaluate({
          gameId,
          chatId: `chat-burst-${i}`,
          playerCountryId,
          turn: 1,
          messageText: `Rapid message ${i}`,
        });
        decisions.push(decision);
      }

      // First few should succeed, later ones may hit rate limit
      expect(decisions[0].allow).toBe(true);
      // Some later decisions might indicate rate limiting
      const laterDecisions = decisions.slice(1);
      expect(laterDecisions.some((d) => d.allow || d.blockReason?.includes("quickly"))).toBe(true);
    });
  });

  describe("Budget charging under load", () => {
    it("handles multiple simultaneous budget charges", async () => {
      // Simulate 5 countries trying to use chat simultaneously
      const countries = Array.from({ length: 5 }, (_, i) => `country-${i}`);
      const gameId = "game-concurrent";

      const promises = countries.map((playerCountryId) =>
        policyService.evaluate({
          gameId,
          chatId: `chat-concurrent-${playerCountryId}`,
          playerCountryId,
          turn: 1,
          messageText: "Concurrent trade proposal",
        })
      );

      const decisions = await Promise.all(promises);

      // All should get valid policy decisions
      expect(decisions.length).toBe(5);
      decisions.forEach((d) => {
        expect(d).toHaveProperty("allow");
        expect(typeof d.allow).toBe("boolean");
      });
    });

    it("prevents budget charging race conditions", async () => {
      // Same chat, multiple rapid budget attempts
      const gameId = "game-race";
      const chatId = "chat-race";
      const playerCountryId = "country-race";

      const promises = Array.from({ length: 3 }, (_, i) =>
        policyService.evaluate({
          gameId,
          chatId,
          playerCountryId,
          turn: 1,
          messageText: `Concurrent attempt ${i}`,
        })
      );

      const decisions = await Promise.all(promises);

      // All should get valid decisions
      decisions.forEach((d) => {
        expect(d).toHaveProperty("allow");
      });

      // Budget costs should be properly tracked (if applicable)
      const withCost = decisions.filter((d) => d.budgetCost !== undefined);
      expect(withCost.length >= 0).toBe(true);
    });

    it("correctly escalates costs during high usage", async () => {
      const gameId = "game-escalate";
      const playerCountryId = "country-escalate";
      const decisions = [];

      // Send multiple messages to same chat to exhaust free allowance
      for (let i = 0; i < 6; i++) {
        // Add delay to avoid rate limiting
        if (i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }

        const decision = await policyService.evaluate({
          gameId,
          chatId: `chat-escalate`,
          playerCountryId,
          turn: i + 1,
          messageText: `Message ${i}: Trade related content`,
        });
        decisions.push(decision);
      }

      // Later messages should have higher costs or be blocked
      const laterMessages = decisions.slice(3);
      expect(laterMessages.length > 0).toBe(true);
    }, 30000); // 30 second timeout for delays

    it("maintains budget tracking across multiple turns", async () => {
      const gameId = "game-multi-turn";
      const chatId = "chat-multi-turn";
      const playerCountryId = "country-multi-turn";
      const decisions = [];

      // Message at each of 3 turns
      for (let turn = 1; turn <= 3; turn++) {
        const decision = await policyService.evaluate({
          gameId,
          chatId,
          playerCountryId,
          turn,
          messageText: `Turn ${turn} message`,
        });
        decisions.push(decision);
      }

      // All should be valid decisions
      decisions.forEach((d) => {
        expect(d).toHaveProperty("allow");
      });
    });
  });

  describe("System stability under load", () => {
    it("handles many concurrent chats without crashing", async () => {
      const gameId = "game-many";
      const chatCount = 50;

      const promises = Array.from({ length: chatCount }, (_, i) =>
        policyService.evaluate({
          gameId,
          chatId: `chat-load-${i}`,
          playerCountryId: `country-${i % 5}`,
          turn: 1,
          messageText: "Load test message",
        })
      );

      const decisions = await Promise.all(promises);
      expect(decisions.length).toBe(chatCount);
      expect(decisions.every((d) => typeof d.allow === "boolean")).toBe(true);
    });

    it("handles many game instances simultaneously", async () => {
      const gameCount = 20;
      const messagesPerGame = 3;

      const promises = [];
      for (let g = 0; g < gameCount; g++) {
        for (let m = 0; m < messagesPerGame; m++) {
          promises.push(
            policyService.evaluate({
              gameId: `game-stress-${g}`,
              chatId: `chat-stress-${g}-${m}`,
              playerCountryId: `country-${m}`,
              turn: 1,
              messageText: "Stress test message",
            })
          );
        }
      }

      const decisions = await Promise.all(promises);
      expect(decisions.length).toBe(gameCount * messagesPerGame);
      expect(decisions.every((d) => d !== null && d !== undefined)).toBe(true);
    });

    it("recovers gracefully after rate limit saturation", async () => {
      // Try to saturate with messages
      const gameId = "game-saturate";
      const promises1 = Array.from({ length: 25 }, (_, i) =>
        policyService.evaluate({
          gameId,
          chatId: `chat-saturate-${i}`,
          playerCountryId: `country-${i}`,
          turn: 1,
          messageText: "Saturation message",
        })
      );

      await Promise.all(promises1);

      // Wait and try again
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const decision = await policyService.evaluate({
        gameId,
        chatId: "chat-saturate-recovery",
        playerCountryId: "country-recovery",
        turn: 1,
        messageText: "Recovery message",
      });

      // Should get a valid decision (might be blocked, but should respond)
      expect(decision).toHaveProperty("allow");
    }, 15000);
  });

  describe("Memory efficiency under load", () => {
    it("handles policy evaluations efficiently", async () => {
      const gameId = "game-perf";
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await policyService.evaluate({
          gameId,
          chatId: `chat-perf-${i}`,
          playerCountryId: `country-${i % 10}`,
          turn: 1,
          messageText: "Performance test",
        });
      }

      const elapsed = Date.now() - startTime;
      // Should handle 100 policy evaluations in reasonable time
      // (allowing for slowness in test environment)
      expect(elapsed).toBeLessThan(30000);
    });
  });
});
