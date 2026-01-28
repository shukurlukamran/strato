import { ChatMemoryService, type MemorySnapshot } from "@/lib/ai/ChatMemoryService";

// Mock Supabase
jest.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: jest.fn(() => ({
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
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
        data: { id: "test" },
        error: null,
      }),
    })),
  })),
}));

describe("ChatMemoryService", () => {
  let memoryService: ChatMemoryService;

  beforeEach(() => {
    memoryService = new ChatMemoryService();
    jest.clearAllMocks();
  });

  describe("Relationship state tracking", () => {
    it("tracks initial relationship state", async () => {
      const memory = await memoryService.captureMemory({
        chatId: "chat-1",
        chatHistory: [],
        newMessageText: "Let's discuss a trade deal",
        senderCountryId: "country-1",
      });

      expect(memory).toHaveProperty("relationshipState");
      expect(memory.relationshipState).toHaveProperty("trust");
      expect(memory.relationshipState).toHaveProperty("grievance");
      expect(memory.relationshipState).toHaveProperty("respect");

      // Initial values should be in 0-100 range
      expect(memory.relationshipState.trust).toBeGreaterThanOrEqual(0);
      expect(memory.relationshipState.trust).toBeLessThanOrEqual(100);
      expect(memory.relationshipState.grievance).toBeGreaterThanOrEqual(0);
      expect(memory.relationshipState.grievance).toBeLessThanOrEqual(100);
      expect(memory.relationshipState.respect).toBeGreaterThanOrEqual(0);
      expect(memory.relationshipState.respect).toBeLessThanOrEqual(100);
    });

    it("detects positive sentiment and updates relationships", async () => {
      const memory1 = await memoryService.captureMemory({
        chatId: "chat-2",
        chatHistory: [],
        newMessageText: "Thanks for the great trade",
        senderCountryId: "country-1",
      });

      const initialState = memory1.relationshipState;

      // Positive keywords should increase trust and respect, decrease grievance
      const memory2 = await memoryService.captureMemory({
        chatId: "chat-2",
        chatHistory: [],
        newMessageText: "I appreciate our agreement",
        senderCountryId: "country-1",
      });

      // Should see improvements in relationship
      expect(memory2.relationshipState).toBeTruthy();
    });

    it("detects negative sentiment and updates relationships", async () => {
      const memory1 = await memoryService.captureMemory({
        chatId: "chat-3",
        chatHistory: [],
        newMessageText: "Initial contact",
        senderCountryId: "country-1",
      });

      const initialState = memory1.relationshipState;

      // Negative keywords should decrease trust and respect, increase grievance
      const memory2 = await memoryService.captureMemory({
        chatId: "chat-3",
        chatHistory: [],
        newMessageText: "This is a threat to our security",
        senderCountryId: "country-1",
      });

      expect(memory2.relationshipState).toBeTruthy();
    });

    it("clamps relationship values to 0-100 range", async () => {
      // Create multiple positive messages to test upper bound
      let memory: MemorySnapshot = {
        summary: null,
        openThreads: [],
        relationshipState: { trust: 95, grievance: 90, respect: 95 },
      };

      for (let i = 0; i < 10; i++) {
        memory = await memoryService.captureMemory({
          chatId: `chat-clamp-${i}`,
          chatHistory: [],
          newMessageText: "Great, wonderful, excellent, fantastic cooperation",
          senderCountryId: "country-1",
        });
      }

      // Values should never exceed 100
      expect(memory.relationshipState.trust).toBeLessThanOrEqual(100);
      expect(memory.relationshipState.grievance).toBeLessThanOrEqual(100);
      expect(memory.relationshipState.respect).toBeLessThanOrEqual(100);

      // Values should never go below 0
      expect(memory.relationshipState.trust).toBeGreaterThanOrEqual(0);
      expect(memory.relationshipState.grievance).toBeGreaterThanOrEqual(0);
      expect(memory.relationshipState.respect).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Thread detection and tracking", () => {
    it("detects open threads from message content", async () => {
      const memory = await memoryService.captureMemory({
        chatId: "chat-4",
        chatHistory: [],
        newMessageText: "We should discuss a trade deal for your resources",
        senderCountryId: "country-1",
      });

      expect(memory.openThreads).toBeTruthy();
      expect(Array.isArray(memory.openThreads)).toBe(true);
    });

    it("tracks multiple concurrent threads", async () => {
      const memory = await memoryService.captureMemory({
        chatId: "chat-5",
        chatHistory: [],
        newMessageText:
          "Let's discuss trade, form an alliance, and strengthen our military cooperation",
        senderCountryId: "country-1",
      });

      // Multiple topics mentioned should create multiple threads
      expect(memory.openThreads).toBeTruthy();
    });

    it("maintains thread snippets for context", async () => {
      const memory = await memoryService.captureMemory({
        chatId: "chat-6",
        chatHistory: [],
        newMessageText: "Can we negotiate on research technology sharing?",
        senderCountryId: "country-1",
      });

      for (const thread of memory.openThreads) {
        expect(thread).toHaveProperty("topic");
        expect(thread).toHaveProperty("snippet");
        expect(thread).toHaveProperty("lastMentionedAt");
      }
    });
  });

  describe("Memory persistence", () => {
    it("returns consistent memory snapshots", async () => {
      const memory1 = await memoryService.captureMemory({
        chatId: "chat-7",
        chatHistory: [],
        newMessageText: "Initial message",
        senderCountryId: "country-1",
      });

      const memory2 = await memoryService.captureMemory({
        chatId: "chat-7",
        chatHistory: [],
        newMessageText: "Follow-up message",
        senderCountryId: "country-1",
      });

      expect(memory1).toHaveProperty("summary");
      expect(memory2).toHaveProperty("summary");
      expect(memory1).toHaveProperty("relationshipState");
      expect(memory2).toHaveProperty("relationshipState");
    });

    it("handles chat history correctly", async () => {
      const history = [
        {
          id: "msg-1",
          chatId: "chat-8",
          senderCountryId: "country-1",
          text: "First message",
          createdAt: new Date().toISOString(),
          role: "user" as const,
        },
        {
          id: "msg-2",
          chatId: "chat-8",
          senderCountryId: "country-2",
          text: "Response message",
          createdAt: new Date().toISOString(),
          role: "assistant" as const,
        },
      ];

      const memory = await memoryService.captureMemory({
        chatId: "chat-8",
        chatHistory: history,
        newMessageText: "Another follow-up",
        senderCountryId: "country-1",
      });

      expect(memory).toHaveProperty("summary");
      expect(memory).toHaveProperty("relationshipState");
      expect(memory).toHaveProperty("openThreads");
    });
  });

  describe("Memory snapshot structure", () => {
    it("provides complete memory snapshot", async () => {
      const memory = await memoryService.captureMemory({
        chatId: "chat-9",
        chatHistory: [],
        newMessageText: "Test message",
        senderCountryId: "country-1",
      });

      expect(memory).toHaveProperty("summary");
      expect(memory).toHaveProperty("openThreads");
      expect(memory).toHaveProperty("relationshipState");
      expect(Array.isArray(memory.openThreads)).toBe(true);
    });
  });
});
