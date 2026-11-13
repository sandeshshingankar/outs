-- Rental categories are public catalogue metadata, not private student data.
-- Allow the public Rent discovery page and unauthenticated visitors to load them.
grant select on public.rent_categories to anon, authenticated;

drop policy if exists rent_categories_public_read on public.rent_categories;
create policy rent_categories_public_read
  on public.rent_categories
  for select
  to anon, authenticated
  using (is_active = true);

-- Add useful campus rental categories without duplicating existing records.
insert into public.rent_categories(name, slug, subcategories, sort_order)
values
  ('Books & Study Materials', 'books-study-materials', array['Textbooks','Reference Books','Notes','Exam Preparation Materials','Other Study Materials'], 8),
  ('Engineering Tools', 'engineering-tools', array['Drawing Instruments','Soldering Kit','Multimeter','Arduino Kit','Other Engineering Tools'], 9),
  ('Lab Equipment', 'lab-equipment', array['Breadboard','Sensors','Electronics Components','Lab Kit','Other Lab Equipment'], 10),
  ('Furniture', 'furniture', array['Study Table','Chair','Desk Lamp','Storage','Other Furniture'], 11),
  ('Musical Instruments', 'musical-instruments', array['Guitar','Keyboard','Ukulele','Other Musical Instruments'], 12),
  ('Cameras & Photography', 'cameras-photography', array['Camera','Tripod','Ring Light','Microphone','Other Photography Equipment'], 13)
on conflict (slug) do update
set name = excluded.name,
    subcategories = excluded.subcategories,
    sort_order = excluded.sort_order;
