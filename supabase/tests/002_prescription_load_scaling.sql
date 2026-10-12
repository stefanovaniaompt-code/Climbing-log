begin;
select plan(13);

select is(
  private.scale_load_values('{"load_value":"32.5","unit":"kg"}'::jsonb, 1.1),
  '{"load_value":"36","unit":"kg"}'::jsonb,
  'legacy numeric strings are scaled and remain strings'
);

select is(
  private.scale_load_values('{"loadKg":20,"unit":"kg","steps":[{"loadKg":25}]}'::jsonb, 1.1),
  '{"loadKg":22,"unit":"kg","steps":[{"loadKg":27.5}]}'::jsonb,
  'modern numeric kilogram loads and structured rows are scaled'
);

select is(
  private.scale_load_values('{"load_type":"bodyweight","load_value":"70","unit":"kg"}'::jsonb, 1.1),
  '{"load_type":"bodyweight","load_value":"70","unit":"kg"}'::jsonb,
  'bodyweight values are not treated as external kilograms'
);

select is(
  private.scale_load_values('{"load_type":"added_weight","load_value":"20","unit":"kg"}'::jsonb, 1.1),
  '{"load_type":"added_weight","load_value":"22","unit":"kg"}'::jsonb,
  'added kilogram loads remain scalable'
);

select is(
  private.scale_load_values('{"load_type":"climbing_grade","load_value":"7a","unit":"french"}'::jsonb, 1.1),
  '{"load_type":"climbing_grade","load_value":"7a","unit":"french"}'::jsonb,
  'climbing grades are not treated as kilograms'
);

select is(
  private.scale_load_values('{"load_value":"calcolato su 1RM 50 kg"}'::jsonb, 1.1),
  '{"load_value":"calcolato su 1RM 50 kg"}'::jsonb,
  'descriptive legacy load text is left untouched'
);

select is(
  private.scale_load_values_report('{"loadKg":20,"unit":"kg"}'::jsonb, 1.1) ->> 'updated',
  '1',
  'numeric kilogram values are counted as updated'
);

select is(
  private.scale_load_values_report('{"load_value":"32.5","unit":"kg"}'::jsonb, 1.1) ->> 'updated',
  '1',
  'legacy numeric strings are counted as updated'
);

select is(
  private.scale_load_values_report('{"dose":"20 kg nella prima serie, poi aumentare"}'::jsonb, 1.1) ->> 'unscalable',
  '1',
  'free-text kilogram progressions are reported as unscalable'
);

select is(
  private.scale_load_values_report('{"load_type":"test_percentage","load_value":"85","unit":"%"}'::jsonb, 1.1) -> 'value',
  '{"load_type":"test_percentage","load_value":"85","unit":"%"}'::jsonb,
  'test percentages are not treated as kilogram loads'
);

select is(
  private.scale_load_values_report('{"load_type":"bodyweight","load_value":"70","unit":"kg"}'::jsonb, 1.1) -> 'value',
  '{"load_type":"bodyweight","load_value":"70","unit":"kg"}'::jsonb,
  'bodyweight remains unchanged in the report path'
);

select is(
  private.scale_load_values_report('{"load_type":"climbing_grade","load_value":"7a","unit":"french"}'::jsonb, 1.1) -> 'value',
  '{"load_type":"climbing_grade","load_value":"7a","unit":"french"}'::jsonb,
  'climbing grades remain unchanged in the report path'
);

select is(
  private.scale_load_values_report('{"loadKg":20,"dose":"20 kg nella prima serie, poi aumentare","unit":"kg"}'::jsonb, 1.1),
  '{"value":{"loadKg":22,"dose":"20 kg nella prima serie, poi aumentare","unit":"kg"},"updated":1,"unscalable":1}'::jsonb,
  'partial updates preserve prose and report both outcomes'
);

select * from finish();
rollback;
