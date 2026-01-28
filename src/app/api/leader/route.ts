import { NextRequest, NextResponse } from "next/server";
import { LeaderProfileService } from "@/lib/ai/LeaderProfileService";
import { RESOURCE_PROFILES } from "@/lib/game-engine/ResourceProfile";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = searchParams.get("gameId");
    const countryId = searchParams.get("countryId");
    const resourceProfileName = searchParams.get("resourceProfile");
    const countryName = searchParams.get("countryName");

    if (!gameId || !countryId) {
      return NextResponse.json(
        { error: "Missing gameId or countryId" },
        { status: 400 }
      );
    }

    const service = new LeaderProfileService();
    
    // Get resource profile if provided
    let resourceProfile = null;
    if (resourceProfileName) {
      resourceProfile = RESOURCE_PROFILES.find(p => p.name === resourceProfileName);
    }

    const profile = await service.getOrCreateProfile({
      gameId,
      countryId,
      resourceProfile: resourceProfile || undefined,
      countryName: countryName || undefined,
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Failed to create or fetch leader profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("Failed to fetch leader profile:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
