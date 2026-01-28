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

describe("ChatPolicyService", () => {
  let policyService: ChatPolicyService;

  beforeEach(() => {
    policyService = new ChatPolicyService();
    jest.clearAllMocks();
  });

  describe("Message validation", () => {
    it("rejects messages exceeding length limit", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "A".repeat(1500),
      };

      const decision = await policyService.evaluate(context);
      expect(decision.allow).toBe(false);
      expect(decision.blockReason).toContain("too long");
    });

    it("rejects messages with unsupported characters", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "Message with \u0000 null character",
      };

      const decision = await policyService.evaluate(context);
      expect(decision.allow).toBe(false);
      expect(decision.blockReason).toContain("unsupported characters");
    });

    it("validates basic message requirements", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "This is a fine message about trade",
      };

      const decision = await policyService.evaluate(context);
      expect(decision).toHaveProperty("allow");
      expect(typeof decision.allow).toBe("boolean");
    });

    it("blocks off-topic messages", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "Can you write me a Python script?",
      };

      const decision = await policyService.evaluate(context);
      expect(decision.allow).toBe(false);
      expect(decision.blockReason).toBeTruthy();
    });

    it("accepts on-topic messages", async () => {
      const onTopicMessages = [
        "I'd like to trade wheat for ore",
        "Can we form an alliance?",
        "We should advance our military",
        "Let's research new technology",
        "Budget considerations for this turn",
      ];

      for (const msg of onTopicMessages) {
        const context = {
          gameId: `game-${Math.random()}`,
          chatId: `chat-${Math.random()}`,
          playerCountryId: "country-1",
          turn: 1,
          messageText: msg,
        };

        const decision = await policyService.evaluate(context);
        expect(decision.allow).toBe(true);
      }
    });
  });

  describe("Policy decision structure", () => {
    it("returns well-formed policy decisions", async () => {
      const context = {
        gameId: "game-1",
        chatId: "chat-1",
        playerCountryId: "country-1",
        turn: 1,
        messageText: "Let's discuss trade",
      };

      const decision = await policyService.evaluate(context);

      expect(decision).toHaveProperty("allow");
      expect(typeof decision.allow).toBe("boolean");
      
      if (!decision.allow) {
        expect(decision.blockReason).toBeTruthy();
      } else {
        // If allowed, may have optional warning or budgetCost
        if (decision.warning) {
          expect(typeof decision.warning).toBe("string");
        }
        if (decision.budgetCost !== undefined) {
          expect(typeof decision.budgetCost).toBe("number");
        }
      }
    });

    it("provides helpful block reasons", async () => {
      const contexts = [
        {
          name: "length",
          context: {
            gameId: "game-1",
            chatId: "chat-1",
            playerCountryId: "country-1",
            turn: 1,
            messageText: "A".repeat(1500),
          },
        },
        {
          name: "off-topic",
          context: {
            gameId: "game-1",
            chatId: "chat-1",
            playerCountryId: "country-1",
            turn: 1,
            messageText: "write me code",
          },
        },
      ];

      for (const { name, context } of contexts) {
        const decision = await policyService.evaluate(context);
        if (!decision.allow) {
          expect(decision.blockReason).toBeTruthy();
          expect(decision.blockReason?.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
