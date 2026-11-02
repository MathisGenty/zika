-- =====================================================================
-- Zìkǎ 字卡 — profil personnalisé (badges)
-- À coller une seule fois dans Supabase : SQL Editor → New query → Run
-- Ajoute au profil public : titre, vitrine de 3 badges, couleur d'avatar, nombre de badges.
-- Les règles de sécurité existantes s'appliquent : chacun ne modifie que son propre profil.
-- =====================================================================
alter table public.profiles
  add column if not exists title text,
  add column if not exists showcase text[] not null default '{}',
  add column if not exists color text not null default 'jade',
  add column if not exists badge_count int not null default 0;

alter table public.profiles
  add constraint profiles_showcase_max3 check (coalesce(array_length(showcase, 1), 0) <= 3),
  add constraint profiles_color_ok check (color in ('jade', 'rouge', 'or', 'bleu', 'prune', 'encre'));
