-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- USERS TABLE
create table public.users (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  line_user_id text unique not null,
  phone text not null,
  display_name text,
  is_blocked boolean default false
);

-- BOOKINGS TABLE
create table public.bookings (
  id uuid default uuid_generate_v4() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  user_id uuid references public.users(id) not null,
  date date not null,
  time time not null,
  holes int not null check (holes in (9, 18)),
  players_count int not null default 1,
  status text default 'confirmed' check (status in ('confirmed', 'checked_in', 'cancelled')),
  amount numeric(10, 2),
  payment_status text default 'pending' check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  line_pay_transaction_id text,
  notes text
);

-- RLS POLICIES (Simple for MVP: Allow all for now, or restrictive?)
-- For MVP with public client, we might need to be careful.
-- Ideally, RLS should only allow users to see their own bookings.
alter table public.users enable row level security;
alter table public.bookings enable row level security;

create policy "Users can insert themselves" on public.users
  for insert with check (true);

create policy "Users can read own data" on public.users
  for select using (line_user_id = current_setting('request.headers')::json->>'x-line-user-id'); 
  -- Note: The above RLS is tricky without custom auth. 
  -- For this MVP, we will rely on client-side filtering and maybe open RLS for "anon" if we don't have real Supabase Auth integrated with LINE.
  -- SIMPLIFICATION: Allow anon to read/write for now, assuming the client app behaves. 
  -- WARN: In production, use Supabase Auth or Custom Claims.

create policy "Enable access for all users" on public.users for all using (true);
create policy "Enable access for all bookings" on public.bookings for all using (true);
