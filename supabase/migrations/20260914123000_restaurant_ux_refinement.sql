alter table public.restaurants
  add column if not exists google_maps_url text,
  add column if not exists google_place_id text;

alter table public.staff
  add column if not exists avatar_url text,
  add column if not exists avatar_preset text;

alter table public.restaurant_tables
  add column if not exists zone text not null default 'main',
  add column if not exists capacity integer not null default 4,
  add column if not exists shape text not null default 'rectangle',
  add column if not exists layout jsonb not null default '{}'::jsonb;

alter table public.restaurant_tables
  drop constraint if exists restaurant_tables_capacity_check,
  add constraint restaurant_tables_capacity_check check (capacity between 1 and 30);

alter table public.restaurant_tables
  drop constraint if exists restaurant_tables_shape_check,
  add constraint restaurant_tables_shape_check check (shape in ('rectangle','square','round'));

comment on column public.restaurants.google_maps_url is 'Optional Google Maps URL for the restaurant/branch location.';
comment on column public.restaurants.google_place_id is 'Optional Google Maps Place ID for precise branch linking.';
comment on column public.staff.avatar_url is 'Optional uploaded profile/avatar URL for staff identity.';
comment on column public.staff.avatar_preset is 'Optional preset avatar identifier when no uploaded avatar is used.';
comment on column public.restaurant_tables.zone is 'Floor-plan zone identifier, e.g. main, patio, bar.';
comment on column public.restaurant_tables.capacity is 'Number of seats at the table.';
comment on column public.restaurant_tables.shape is 'Visual floor-plan table shape.';
comment on column public.restaurant_tables.layout is 'Restaurant-scoped floor layout metadata such as x/y/width/height.';