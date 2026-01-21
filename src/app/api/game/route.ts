import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CountryInitializer } from "@/lib/game-engine/CountryInitializer";
import { CityGenerator } from "@/lib/game-engine/CityGenerator";
import { TerritoryGenerator } from "@/lib/game-engine/TerritoryGenerator";
import { ResourceProduction } from "@/lib/game-engine/ResourceProduction";
import type { Country, CountryStats } from "@/types/country";

const CreateGameSchema = z.object({
  name: z.string().min(1).default("New Game"),
  playerCountryIndex: z.number().int().min(0).max(5).default(0),
});

const GetGameSchema = z.object({
  id: z.string().min(1),
});

type DbGame = { id: string; name: string; current_turn: number; status: string; player_country_id: string | null };
type DbCountry = {
  id: string;
  game_id: string;
  name: string;
  is_player_controlled: boolean;
  color: string;
  position_x: number;
  position_y: number;
};
type DbCountryStats = {
  id: string;
  country_id: string;
  turn: number;
  population: number;
  budget: number;
  technology_level: number;
  military_strength: number;
  military_equipment: Record<string, unknown>;
  resources: Record<string, number>;
  resource_profile?: Record<string, unknown>; // Resource specialization profile
  diplomatic_relations: Record<string, number>;
  created_at: string;
};

export const memoryGames = new Map<
  string,
  {
    game: DbGame;
    countries: DbCountry[];
    stats: Record<string, DbCountryStats>;
    chats: Record<string, { id: string; country_a_id: string; country_b_id: string }>;
  }
>();

const defaultCountries = [
  { name: "Aurum", color: "#F59E0B", x: 10, y: 20 },
  { name: "Borealis", color: "#3B82F6", x: 35, y: 15 },
  { name: "Cyrenia", color: "#10B981", x: 60, y: 25 },
  { name: "Dravon", color: "#EF4444", x: 20, y: 55 },
  { name: "Eldoria", color: "#8B5CF6", x: 50, y: 55 },
  { name: "Falken", color: "#64748B", x: 75, y: 45 },
];

// Note: generateSimpleTerritoryPath has been removed
// We now use TerritoryGenerator.generateTerritories which creates Voronoi-based territories
// This ensures cities cover the exact same territory displayed on the map

function makeInitialStats(countryId: string, turn: number, gameSeed: string, countryIndex: number, profile: any): DbCountryStats {
  return {
    id: crypto.randomUUID(),
    country_id: countryId,
    turn,
    population: profile.population,
    budget: profile.budget,
    technology_level: profile.technologyLevel,
    military_strength: profile.militaryStrength,
    military_equipment: {},
    resources: profile.resources,
    resource_profile: profile.resourceProfile, // Include resource profile
    diplomatic_relations: {},
    created_at: new Date().toISOString(),
  };
}

async function ensureChats(
  gameId: string,
  countries: DbCountry[],
): Promise<Array<{ id: string; game_id: string; country_a_id: string; country_b_id: string }>> {
  // For MVP: create chats between player and each AI country.
  const player = countries.find((c) => c.is_player_controlled);
  if (!player) return [];
  return countries
    .filter((c) => !c.is_player_controlled)
    .map((c) => ({
      id: crypto.randomUUID(),
      game_id: gameId,
      country_a_id: player.id,
      country_b_id: c.id,
    }));
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = CreateGameSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { name, playerCountryIndex } = parsed.data;
  const now = new Date().toISOString();

  // Supabase-backed
  try {
    const supabase = getSupabaseServerClient();
    const createdGame = await supabase
      .from("games")
      .insert({ name, current_turn: 1, status: "active", created_at: now, updated_at: now })
      .select("id, name, current_turn, status, player_country_id");
    
    if (createdGame.error) throw createdGame.error;
    if (!createdGame.data || createdGame.data.length === 0) {
      throw new Error("Failed to create game - no data returned");
    }

    const gameId = createdGame.data[0].id as string;

    const countryRows = defaultCountries.map((c, idx) => ({
      game_id: gameId,
      name: c.name,
      is_player_controlled: idx === playerCountryIndex,
      color: c.color,
      position_x: c.x,
      position_y: c.y,
      created_at: now,
    }));

    const insertedCountries = await supabase
      .from("countries")
      .insert(countryRows)
      .select("id, game_id, name, is_player_controlled, color, position_x, position_y");
    if (insertedCountries.error) throw insertedCountries.error;

    const countries = insertedCountries.data as DbCountry[];
    const player = countries.find((c) => c.is_player_controlled);
    if (!player) throw new Error("Failed to create player country.");

    await supabase.from("games").update({ player_country_id: player.id, updated_at: now }).eq("id", gameId);

    // Generate randomized starting stats for each country with resource profiles
    const countryProfiles = CountryInitializer.generateMultipleProfiles(countries.length, gameId);
    const statsRows = countries.map((c, idx) => {
      const profile = countryProfiles[idx];
      return {
        country_id: c.id,
        turn: 1,
        population: profile.population,
        budget: profile.budget,
        technology_level: profile.technologyLevel,
        infrastructure_level: profile.infrastructureLevel,
        military_strength: profile.militaryStrength,
        military_equipment: {},
        resources: profile.resources,
        resource_profile: profile.resourceProfile, // Include resource profile
        diplomatic_relations: {},
        created_at: now,
      };
    });

    const insertedStats = await supabase.from("country_stats").insert(statsRows);
    if (insertedStats.error) throw insertedStats.error;

    // Generate cities for each country
    // First, convert all countries to Country format for territory generation
    const countryObjects: Country[] = countries.map(dbCountry => ({
      id: dbCountry.id,
      gameId: dbCountry.game_id,
      name: dbCountry.name,
      isPlayerControlled: dbCountry.is_player_controlled,
      color: dbCountry.color,
      positionX: Number(dbCountry.position_x),
      positionY: Number(dbCountry.position_y),
    }));
    
    // Generate Voronoi territories for all countries
    // This ensures cities cover the exact same territories that will be displayed on the map
    const territoryPaths = TerritoryGenerator.generateTerritories(countryObjects);
    
    // Now generate cities for each country using their Voronoi territory
    const allCities = [];
    for (let i = 0; i < countries.length; i++) {
      const dbCountry = countries[i];
      const stats = statsRows[i];
      const country = countryObjects[i];
      
      // Get the Voronoi territory path for this country
      const territoryPath = territoryPaths.get(country.id);
      if (!territoryPath) {
        console.error(`No territory path found for country ${country.name}`);
        continue;
      }
      
      // Convert stats row to CountryStats format
      const countryStats: CountryStats = {
        id: crypto.randomUUID(),
        countryId: country.id,
        turn: 1,
        population: stats.population,
        budget: stats.budget,
        technologyLevel: stats.technology_level,
        infrastructureLevel: stats.infrastructure_level,
        militaryStrength: stats.military_strength,
        militaryEquipment: stats.military_equipment,
        resources: stats.resources,
        resourceProfile: stats.resource_profile,
        diplomaticRelations: stats.diplomatic_relations,
        createdAt: now,
      };
      
      // Calculate per-turn production for this country (NOT the stockpile)
      const production = ResourceProduction.calculateProduction(country, countryStats);
      const perTurnProduction: Record<string, number> = {};
      for (const res of production.resources) {
        if (res.amount > 0) {
          perTurnProduction[res.resourceId] = res.amount;
        }
      }
      
      const cities = CityGenerator.generateCitiesForCountry(
        country,
        countryStats,
        territoryPath,
        perTurnProduction // Pass per-turn production instead of stockpile
      );
      
      allCities.push(...cities.map(city => ({
        country_id: city.countryId,
        game_id: city.gameId,
        name: city.name,
        position_x: city.positionX,
        position_y: city.positionY,
        size: city.size,
        border_path: city.borderPath,  // Convert camelCase to snake_case
        per_turn_resources: city.perTurnResources,
        population: city.population,
        is_under_attack: city.isUnderAttack,
        created_at: now,
      })));
    }
    
    // Insert all cities
    if (allCities.length > 0) {
      const insertedCities = await supabase.from("cities").insert(allCities);
      if (insertedCities.error) {
        console.error("Failed to create cities:", insertedCities.error);
        // Don't fail the game creation if cities fail
      }
    }

    // Create chats
    const chats = await ensureChats(gameId, countries);
    if (chats.length) {
      await supabase.from("diplomacy_chats").insert(
        chats.map((c) => ({
          id: c.id,
          game_id: c.game_id,
          country_a_id: c.country_a_id,
          country_b_id: c.country_b_id,
          created_at: now,
          updated_at: now,
        })),
      );
    }

    return NextResponse.json({ gameId });
  } catch {
    // In-memory fallback
    const gameId = crypto.randomUUID();
    const game: DbGame = { id: gameId, name, current_turn: 1, status: "active", player_country_id: null };
    const countries: DbCountry[] = defaultCountries.map((c, idx) => ({
      id: crypto.randomUUID(),
      game_id: gameId,
      name: c.name,
      is_player_controlled: idx === playerCountryIndex,
      color: c.color,
      position_x: c.x,
      position_y: c.y,
    }));
    const player = countries.find((c) => c.is_player_controlled)!;
    game.player_country_id = player.id;
    
    // Generate profiles for all countries
    const countryProfiles = CountryInitializer.generateMultipleProfiles(countries.length, gameId);
    const stats: Record<string, DbCountryStats> = {};
    for (let i = 0; i < countries.length; i++) {
      const c = countries[i];
      stats[c.id] = makeInitialStats(c.id, 1, gameId, i, countryProfiles[i]);
    }

    const chatsArr = await ensureChats(gameId, countries);
    const chats: Record<string, { id: string; country_a_id: string; country_b_id: string }> = {};
    for (const ch of chatsArr) chats[ch.id] = { id: ch.id, country_a_id: ch.country_a_id, country_b_id: ch.country_b_id };

    memoryGames.set(gameId, { game, countries, stats, chats });
    return NextResponse.json({ gameId, note: "Supabase not configured; using in-memory game store." });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = GetGameSchema.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const gameId = parsed.data.id;

  try {
    const supabase = getSupabaseServerClient();
    
    console.log("[API Game] Loading game:", {
      gameId,
      gameIdLength: gameId.length,
      isValidUUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(gameId),
    });
    
    const gameRes = await supabase
      .from("games")
      .select("id, name, current_turn, status, player_country_id")
      .eq("id", gameId)
      .limit(1);
      
    if (gameRes.error) {
      console.error("[API Game] Game query error:", {
        gameId,
        error: gameRes.error.message,
        errorCode: gameRes.error.code,
      });
      
      // If game not found in Supabase, check in-memory fallback
      const mem = memoryGames.get(gameId);
      if (!mem) {
        // Log available games for debugging
        const allGames = await supabase
          .from("games")
          .select("id, name")
          .limit(5)
          .order("created_at", { ascending: false });
        console.log("[API Game] Game not found. Sample games in DB:", {
          requestedGameId: gameId,
          availableGames: allGames.data?.map(g => ({ id: g.id, name: g.name })) || [],
        });
        return NextResponse.json({ error: "Game not found." }, { status: 404 });
      }
      return NextResponse.json({
        game: mem.game,
        countries: mem.countries,
        stats: Object.values(mem.stats),
        chats: Object.values(mem.chats),
        cities: [], // Cities not supported in memory mode yet
        note: "Supabase not configured; using in-memory game store.",
      });
    }
    
    // Handle case where query returns no results or multiple results
    if (!gameRes.data || gameRes.data.length === 0) {
      console.error("[API Game] Game not found (no data returned):", { gameId });
      const mem = memoryGames.get(gameId);
      if (mem) {
        return NextResponse.json({
          game: mem.game,
          countries: mem.countries,
          stats: Object.values(mem.stats),
          chats: Object.values(mem.chats),
          note: "Supabase not configured; using in-memory game store.",
        });
      }
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    
    // Take the first result if multiple exist (shouldn't happen with primary key, but handle it)
    const game = gameRes.data[0];
    if (gameRes.data.length > 1) {
      console.warn("[API Game] Multiple games found with same ID (taking first):", {
        gameId,
        count: gameRes.data.length,
      });
    }
    
    console.log("[API Game] Game found:", {
      requestedGameId: gameId,
      dbGameId: game.id,
      gameName: game.name,
      idsMatch: game.id === gameId,
    });

    const countriesRes = await supabase
      .from("countries")
      .select("id, game_id, name, is_player_controlled, color, position_x, position_y")
      .eq("game_id", gameId);
    if (countriesRes.error) throw countriesRes.error;

    // Try to select infrastructure_level and resource_profile, but handle if columns don't exist yet
    const statsRes = await supabase
      .from("country_stats")
      .select(
        "id, country_id, turn, population, budget, technology_level, infrastructure_level, military_strength, military_equipment, resources, resource_profile, diplomatic_relations, created_at",
      )
      .eq("turn", game.current_turn)
      .in(
        "country_id",
        (countriesRes.data ?? []).map((c) => c.id),
      );
    
    // If infrastructure_level column doesn't exist, try without it
    if (statsRes.error && statsRes.error.message?.includes("infrastructure_level")) {
      const statsResFallback = await supabase
        .from("country_stats")
        .select(
          "id, country_id, turn, population, budget, technology_level, military_strength, military_equipment, resources, diplomatic_relations, created_at",
        )
        .eq("turn", game.current_turn)
        .in(
          "country_id",
          (countriesRes.data ?? []).map((c) => c.id),
        );
      if (statsResFallback.error) throw statsResFallback.error;
      
      // Add infrastructure_level as 0 for all stats
      const statsWithInfra = (statsResFallback.data ?? []).map(s => ({
        ...s,
        infrastructure_level: 0
      }));
      
      const chatsRes = await supabase
        .from("diplomacy_chats")
        .select("id, game_id, country_a_id, country_b_id")
        .eq("game_id", gameId);
      if (chatsRes.error) throw chatsRes.error;

      // Fetch cities
      const citiesRes = await supabase
        .from("cities")
        .select("*")
        .eq("game_id", gameId);
      const cities = citiesRes.error ? [] : (citiesRes.data ?? []);

      return NextResponse.json({
        game: game,
        countries: countriesRes.data ?? [],
        stats: statsWithInfra,
        chats: chatsRes.data ?? [],
        cities: cities,
      });
    }
    
    if (statsRes.error) throw statsRes.error;

    const chatsRes = await supabase
      .from("diplomacy_chats")
      .select("id, game_id, country_a_id, country_b_id")
      .eq("game_id", gameId);
    if (chatsRes.error) throw chatsRes.error;

    // Fetch cities
    const citiesRes = await supabase
      .from("cities")
      .select("*")
      .eq("game_id", gameId);
    
    // Don't throw error if cities table doesn't exist yet (migration pending)
    const cities = citiesRes.error ? [] : (citiesRes.data ?? []);

    return NextResponse.json({
      game: game,
      countries: countriesRes.data ?? [],
      stats: statsRes.data ?? [],
      chats: chatsRes.data ?? [],
      cities: cities,
    });
  } catch (error) {
    console.error("Error loading game:", error);
    // Only fall back to in-memory if Supabase is not configured
    const mem = memoryGames.get(gameId);
    if (mem) {
      return NextResponse.json({
        game: mem.game,
        countries: mem.countries,
        stats: Object.values(mem.stats),
        chats: Object.values(mem.chats),
        cities: [], // Cities not supported in memory mode yet
        note: "Supabase not configured; using in-memory game store.",
      });
    }
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Game not found." 
    }, { status: 404 });
  }
}

