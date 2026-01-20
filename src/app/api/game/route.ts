import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { CountryInitializer } from "@/lib/game-engine/CountryInitializer";
import { CityGenerator } from "@/lib/game-engine/CityGenerator";
import type { Country, City } from "@/types/country";

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
  infrastructure_level?: number;
  military_strength: number;
  military_equipment: Record<string, unknown>;
  resources: Record<string, number>;
  resource_profile?: Record<string, unknown>; // Resource specialization profile
  diplomatic_relations: Record<string, number>;
  created_at: string;
};

type DbCity = {
  id: string;
  country_id: string;
  name: string;
  position_x: number;
  position_y: number;
  size: string;
  resources_per_turn: Record<string, number>;
  population: number;
  infrastructure: number;
  created_at: string;
};

export const memoryGames = new Map<
  string,
  {
    game: DbGame;
    countries: DbCountry[];
    stats: Record<string, DbCountryStats>;
    cities: DbCity[];
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
    const countryObjects: Country[] = countries.map(c => ({
      id: c.id,
      gameId: c.game_id,
      name: c.name,
      isPlayerControlled: c.is_player_controlled,
      color: c.color,
      positionX: Number(c.position_x),
      positionY: Number(c.position_y),
      cities: [] // Will be populated below
    }));

    const allCities: City[] = [];
    for (let i = 0; i < countries.length; i++) {
      const country = countryObjects[i];
      const stats = countryProfiles[i];
      const cities = CityGenerator.generateCitiesForCountry(country, {
        ...stats,
        id: '',
        countryId: country.id,
        turn: 1,
        infrastructureLevel: stats.infrastructureLevel,
        militaryEquipment: {},
        diplomaticRelations: {},
        createdAt: now
      });

      // Update country with cities
      country.cities = cities;
      allCities.push(...cities);
    }

    // Insert cities into database
    if (allCities.length > 0) {
      const cityRows = allCities.map(city => ({
        country_id: city.countryId,
        name: city.name,
        position_x: city.positionX,
        position_y: city.positionY,
        size: city.size,
        resources_per_turn: city.resourcesPerTurn,
        population: city.population,
        infrastructure: city.infrastructure,
        created_at: now,
        updated_at: now,
      }));

      const insertedCities = await supabase.from("cities").insert(cityRows);
      if (insertedCities.error) throw insertedCities.error;
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

    // Generate cities for in-memory games
    const countryObjects: Country[] = countries.map(c => ({
      id: c.id,
      gameId: c.game_id,
      name: c.name,
      isPlayerControlled: c.is_player_controlled,
      color: c.color,
      positionX: Number(c.position_x),
      positionY: Number(c.position_y),
      cities: []
    }));

    const allCities: City[] = [];
    for (let i = 0; i < countries.length; i++) {
      const country = countryObjects[i];
      const profile = countryProfiles[i];
      const cities = CityGenerator.generateCitiesForCountry(country, {
        ...profile,
        id: stats[country.id].id,
        countryId: country.id,
        turn: 1,
        infrastructureLevel: profile.infrastructureLevel,
        militaryEquipment: {},
        diplomaticRelations: {},
        createdAt: new Date().toISOString()
      });

      country.cities = cities;
      allCities.push(...cities);
    }

    const chatsArr = await ensureChats(gameId, countries);
    const chats: Record<string, { id: string; country_a_id: string; country_b_id: string }> = {};
    for (const ch of chatsArr) chats[ch.id] = { id: ch.id, country_a_id: ch.country_a_id, country_b_id: ch.country_b_id };

    // Convert City[] to DbCity[] for in-memory store
    const dbCities: DbCity[] = allCities.map(city => ({
      id: city.id,
      country_id: city.countryId,
      name: city.name,
      position_x: city.positionX,
      position_y: city.positionY,
      size: city.size,
      resources_per_turn: city.resourcesPerTurn,
      population: city.population,
      infrastructure: city.infrastructure,
      created_at: now,
    }));

    memoryGames.set(gameId, { game, countries, stats, cities: dbCities, chats });
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
        cities: mem.cities || [],
        chats: Object.values(mem.chats),
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

      const citiesRes = await supabase
        .from("cities")
        .select("id, country_id, name, position_x, position_y, size, resources_per_turn, population, infrastructure, created_at")
        .in("country_id", (countriesRes.data ?? []).map((c) => c.id));
      if (citiesRes.error) throw citiesRes.error;

      return NextResponse.json({
        game: game,
        countries: countriesRes.data ?? [],
        stats: statsWithInfra,
        cities: citiesRes.data ?? [],
        chats: chatsRes.data ?? [],
      });
    }
    
    if (statsRes.error) throw statsRes.error;

    const chatsRes = await supabase
      .from("diplomacy_chats")
      .select("id, game_id, country_a_id, country_b_id")
      .eq("game_id", gameId);
    if (chatsRes.error) throw chatsRes.error;

    const citiesRes = await supabase
      .from("cities")
      .select("id, country_id, name, position_x, position_y, size, resources_per_turn, population, infrastructure, created_at")
      .in("country_id", (countriesRes.data ?? []).map((c) => c.id));
    if (citiesRes.error) throw citiesRes.error;

    return NextResponse.json({
      game: game,
      countries: countriesRes.data ?? [],
      stats: statsRes.data ?? [],
      cities: citiesRes.data ?? [],
      chats: chatsRes.data ?? [],
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
        cities: mem.cities || [],
        chats: Object.values(mem.chats),
        note: "Supabase not configured; using in-memory game store.",
      });
    }
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Game not found." 
    }, { status: 404 });
  }
}

