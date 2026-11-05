update public.platform_settings set value = value || jsonb_build_object(
'NG', jsonb_build_object('nav','/__l5e/assets-v1/044dabef-bb49-45ff-9d22-8b11a9a4babf/bookacrew-ng-nav-t.png','signup','/__l5e/assets-v1/8ed76ad8-c654-4276-a8f1-1a8bc21adada/bookacrew-ng-signup-t.png'),
'IN', jsonb_build_object('nav','/__l5e/assets-v1/e6e41b8b-3d78-4fb6-b80c-f213a2b32c4d/bookacrew-in-nav-t.png','signup','/__l5e/assets-v1/27f8d30a-2182-4063-881e-b35abdfe5ede/bookacrew-in-signup-t.png'))
where key='country_logos';