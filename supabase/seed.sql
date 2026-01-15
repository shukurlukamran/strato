-- Seed: one demo game with 6 imaginary countries

insert into games (id, name, current_turn, status)
values (gen_random_uuid(), 'Demo Game', 1, 'active')
returning id;

-- NOTE: Replace <GAME_ID> with the returned id if applying manually.
-- In app code, we’ll create games via API instead of static seed.

