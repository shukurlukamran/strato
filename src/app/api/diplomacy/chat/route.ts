import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { countryId, message, chatHistory } = body;

    if (!countryId || !message) {
      return NextResponse.json(
        { error: "countryId and message are required" },
        { status: 400 }
      );
    }

    // For now, return a simple hardcoded response
    // This can be enhanced later with AI integration
    const response = "I'm interested in your proposal. What terms do you suggest?";

    return NextResponse.json({ response });
  } catch (error) {
    console.error("Error in diplomacy chat route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
