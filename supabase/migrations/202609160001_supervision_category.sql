-- Supervision is its own category again. Former Indirect "Supervision"
-- hours become Individual supervision; Group is the new sibling option.

update public.activities
   set activity_type_id = 'supervision-individual'
 where activity_type_id in (
   'indirect-supervision',
   'type-supervision',
   'type-indirect-supervision'
 );

delete from public.activity_types
 where id = 'indirect-supervision';
