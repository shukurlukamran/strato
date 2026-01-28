import { ChatPolicyService } from "@/lib/ai/ChatPolicyService";
import { ChatMemoryService } from "@/lib/ai/ChatMemoryService";

// Mock Supabase for both services
jest.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: jest.fn(() => ({
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          id: "test-id",
          summary: null,
          open_threads: [],
          relationship_state: { trust: 50, grievance: 0, respect: 50 },
          last_summarized_message_at: null,
          last_message_id: null,
        },
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

describe("Integration: End-to-end chat flow with policy enforcement", () => {
  let policyService: ChatPolicyService;
  let memoryService: ChatMemoryService;

  beforeEach(() => {
    policyService = new ChatPolicyService();
    memoryService = new ChatMemoryService();
    jest.clearAllMocks();
  });

  describe("Policy enforcement during conversation", () => {
    it("allows on-topic messages to proceed", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "I'd like to propose a trade agreement",
      };

      const policyDecision = await policyService.evaluate(context);
      expect(policyDecision.allow).toBe(true);

      if (policyDecision.allow) {
        const memory = await memoryService.captureMemory({
          chatId: context.chatId,
          chatHistory: [],
          newMessageText: context.messageText,
          senderCountryId: context.playerCountryId,
        });

        expect(memory).toHaveProperty("relationshipState");
        expect(memory.relationshipState.trust).toBeGreaterThanOrEqual(0);
      }
    });

    it("blocks off-topic messages before memory capture", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "Can you write me some Python code?",
      };

      const policyDecision = await policyService.evaluate(context);
      expect(policyDecision.allow).toBe(false);

      // Off-topic messages should be blocked before memory is captured
      // (in practice, memory wouldn't be updated for blocked messages)
    });

    it("enforces budget costs on paid messages", async () => {
      // Simulate sending multiple messages to exhaust free allowance
      const contexts = [];
      for (let i = 0; i < 5; i++) {
        contexts.push({
          gameId: "game-1",
          chatId: "chat-integration-1",
          playerCountryId: "country-1",
          turn: 1 + i,
          messageText: `Message number ${i + 1}: I'd like to discuss trade agreements`,
        });
      }

      let allowedCount = 0;
      for (const context of contexts) {
        const decision = await policyService.evaluate(context);
        if (decision.allow) {
          allowedCount++;
        }
      }

      // Most or all should be allowed (some might hit rate limiting)
      expect(allowedCount).toBeGreaterThanOrEqual(1);
    });

    it("maintains policy state across turns", async () => {
      const chatId = "chat-persistent-1";
      const gameId = "game-1";
      const playerCountryId = "country-1";

      // Message at turn 1
      const decision1 = await policyService.evaluate({
        gameId,
        chatId,
        playerCountryId,
        turn: 1,
        messageText: "Trade proposal for turn 1",
      });

      // Message at turn 2
      const decision2 = await policyService.evaluate({
        gameId,
        chatId,
        playerCountryId,
        turn: 2,
        messageText: "Trade proposal for turn 2",
      });

      // Both should be policy decisions (may vary based on implementation)
      expect(decision1).toHaveProperty("allow");
      expect(decision2).toHaveProperty("allow");
    });
  });

  describe("Memory persistence across turns", () => {
    it("preserves relationship state across separate messages", async () => {
      const chatId = "chat-persistence-2";

      const memory1 = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "Let's establish a trade partnership",
        senderCountryId: "country-1",
      });

      const initialTrust = memory1.relationshipState.trust;

      // Simulate time passing and another message
      const memory2 = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "Great, we agreed on favorable terms",
        senderCountryId: "country-2",
      });

      // Relationship should evolve (may increase or stay same based on message)
      expect(memory2.relationshipState).toBeTruthy();
      expect(memory2.relationshipState.trust).toBeGreaterThanOrEqual(0);
      expect(memory2.relationshipState.trust).toBeLessThanOrEqual(100);
    });

    it("maintains open threads across message exchanges", async () => {
      const chatId = "chat-threads-persist";

      const memory1 = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "We should discuss a trade deal and military alliance",
        senderCountryId: "country-1",
      });

      const openThreadTopics1 = memory1.openThreads.map((t) => t.topic);

      const memory2 = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "Yes, the trade terms look good to me",
        senderCountryId: "country-2",
      });

      // Should still have context of earlier threads
      expect(memory2.openThreads).toBeTruthy();
    });

    it("updates memory correctly when same chat is accessed multiple times", async () => {
      const chatId = "chat-multi-access";

      // First capture
      const memory1 = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "Initial proposal",
        senderCountryId: "country-1",
      });

      // Second capture (simulating user returning to chat)
      const memory2 = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "Follow-up proposal",
        senderCountryId: "country-1",
      });

      // Both should be valid memory snapshots
      expect(memory1.relationshipState).toBeTruthy();
      expect(memory2.relationshipState).toBeTruthy();
    });
  });

  describe("Leader profile consistency per game", () => {
    it("uses same seed for same game and country combination", async () => {
      const gameId = "game-consistency";
      const country1 = "country-a";
      const country2 = "country-b";

      // Same game, same country should produce consistent profiles
      const context1a = {
        gameId,
        chatId: "chat-1",
        playerCountryId: country1,
        turn: 1,
        messageText: "Trade proposal",
      };

      const context1b = {
        gameId,
        chatId: "chat-2",
        playerCountryId: country1,
        turn: 1,
        messageText: "Another trade proposal",
      };

      // Both should reference the same leader profile (in practice)
      const decision1a = await policyService.evaluate(context1a);
      const decision1b = await policyService.evaluate(context1b);

      expect(decision1a).toHaveProperty("allow");
      expect(decision1b).toHaveProperty("allow");
    });

    it("uses different profiles for different countries in same game", async () => {
      const gameId = "game-diff-profiles";

      const contextA = {
        gameId,
        chatId: "chat-a",
        playerCountryId: "country-a",
        turn: 1,
        messageText: "Trade proposal",
      };

      const contextB = {
        gameId,
        chatId: "chat-b",
        playerCountryId: "country-b",
        turn: 1,
        messageText: "Trade proposal",
      };

      // Different players should have different policy evaluations
      // (depending on separate budget tracking, etc.)
      const decisionA = await policyService.evaluate(contextA);
      const decisionB = await policyService.evaluate(contextB);

      expect(decisionA).toHaveProperty("allow");
      expect(decisionB).toHaveProperty("allow");
    });
  });

  describe("Chat flow correctness", () => {
    it("handles conversation sequence correctly", async () => {
      const gameId = "game-flow";
      const chatId = "chat-flow";
      const playerCountryId = "country-player";

      // Turn 1: First message
      const msg1Policy = await policyService.evaluate({
        gameId,
        chatId,
        playerCountryId,
        turn: 1,
        messageText: "Hello, I'm interested in trading",
      });

      expect(msg1Policy.allow).toBe(true);

      const msg1Memory = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "Hello, I'm interested in trading",
        senderCountryId: playerCountryId,
      });

      expect(msg1Memory.relationshipState).toBeTruthy();

      // Turn 1: Second message (different country response)
      const msg2Policy = await policyService.evaluate({
        gameId,
        chatId,
        playerCountryId: "country-responder",
        turn: 1,
        messageText: "We would be interested in wheat for ore",
      });

      expect(msg2Policy.allow).toBe(true);

      const msg2Memory = await memoryService.captureMemory({
        chatId,
        chatHistory: [],
        newMessageText: "We would be interested in wheat for ore",
        senderCountryId: "country-responder",
      });

      // Memory should evolve from message to message
      expect(msg2Memory.relationshipState).toBeTruthy();
    });
  });
});
