-- Run this once in Supabase: Project > SQL Editor > New query > Run

create table bookings (
  id uuid primary key default gen_random_uuid(),
  equip_id text not null,
  equip_name text not null,
  date date not null,
  start_hour int not null,
  end_hour int not null,
  booked_by text not null,
  created_at timestamptz default now()
);

-- Allow the website (using the public "anon" key) to read and write bookings.
-- This is fine for a trust-based, no-login lab tool with ~20 known users.
alter table bookings enable row level security;

create policy "Anyone can read bookings"
  on bookings for select
  using (true);

create policy "Anyone can create bookings"
  on bookings for insert
  with check (true);

create policy "Anyone can cancel bookings"
  on bookings for delete
  using (true);

-- Optional: enable realtime updates so everyone's screen refreshes live
alter publication supabase_realtime add table bookings;
