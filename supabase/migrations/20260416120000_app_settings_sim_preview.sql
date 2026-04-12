-- Toggle for Admin: show tournament preview / test-only controls (default off).
INSERT INTO public.app_settings (key, value)
VALUES ('sim_preview_test_mode', 'false')
ON CONFLICT (key) DO NOTHING;
