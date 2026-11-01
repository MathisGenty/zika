-- =====================================================================
-- Zìkǎ 字卡 — amis et défi du jour
-- À coller une seule fois dans Supabase : SQL Editor → New query → Run
-- =====================================================================

-- Profils publics : pseudo, avatar, série de jours
create table public.profiles (
  id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  pseudo text not null check (char_length(pseudo) between 3 and 20),
  avatar text not null default '学',
  streak int not null default 0,
  last_active date,
  created_at timestamptz not null default now()
);
create unique index profiles_pseudo_unique on public.profiles (lower(pseudo));

alter table public.profiles enable row level security;
create policy "voir les profils" on public.profiles
  for select to authenticated using (true);
create policy "créer son profil" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "modifier son profil" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Amitiés : une demande (pending) que l'autre accepte (accepted)
create table public.friendships (
  id bigint generated always as identity primary key,
  requester uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  check (requester <> addressee)
);

alter table public.friendships enable row level security;
create policy "voir ses amitiés" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "envoyer une demande" on public.friendships
  for insert to authenticated with check (auth.uid() = requester and status = 'pending');
create policy "accepter une demande" on public.friendships
  for update to authenticated using (auth.uid() = addressee) with check (auth.uid() = addressee and status = 'accepted');
create policy "retirer une amitié" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

-- Scores du défi du jour : un seul essai par jour et par personne
create table public.daily_scores (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null,
  level int not null check (level between 1 and 6),
  score int not null check (score between 0 and 100000),
  correct int not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.daily_scores enable row level security;
create policy "enregistrer son score" on public.daily_scores
  for insert to authenticated with check (auth.uid() = user_id);
create policy "voir ses scores et ceux de ses amis" on public.daily_scores
  for select to authenticated using (
    auth.uid() = user_id or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.addressee = daily_scores.user_id)
          or (f.addressee = auth.uid() and f.requester = daily_scores.user_id))
    )
  );
