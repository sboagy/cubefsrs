-- Shared workspace E2E auth users for CubeFSRS local/CI Supabase.
--
-- These users match TuneTrees so both apps can reuse the same test identities.
-- The rows are intentionally limited to auth.users + auth.identities; session
-- and refresh-token rows are created dynamically by GoTrue when tests sign in.

BEGIN;

INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at,
    is_sso_user,
    deleted_at,
    is_anonymous
) VALUES
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009001', 'authenticated', 'authenticated', 'alice.test@tunetrees.test', '$2a$10$Ebep9b0L85GTrP4/xVc91eD/mq6DN5t4fl..MMdjg.6RC/JQj8Pqm', '2025-11-03 04:57:13.792032+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Alice Test", "email_verified": true}', NULL, '2025-11-03 04:57:13.790291+00', '2026-02-17 20:18:56.875219+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009002', 'authenticated', 'authenticated', 'bob.test@tunetrees.test', '$2a$10$R/iG0mVnI6Wuu869Nq7FLeAF7sgVzeD0sJWpHbwkvc7NRpLgQJehe', '2025-11-03 04:57:13.855681+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Bob Test", "email_verified": true}', NULL, '2025-11-03 04:57:13.854279+00', '2026-02-17 20:19:00.558325+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009004', 'authenticated', 'authenticated', 'dave.test@tunetrees.test', '$2a$10$r9DPItO/pXGhF/OQBofbg.oLgKWEqk8bzZfhRBhN1bjrsxQ2PQq7O', '2025-11-03 04:57:13.973981+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Dave Test", "email_verified": true}', NULL, '2025-11-03 04:57:13.972707+00', '2026-02-17 20:19:07.917858+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009005', 'authenticated', 'authenticated', 'eve.test@tunetrees.test', '$2a$10$tfH6mrRYgB5Bsd4uPOShduq0giKBinmss73.cvy5CzmnFpMGFlrFG', '2025-11-03 04:57:14.031725+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Eve Test", "email_verified": true}', NULL, '2025-11-03 04:57:14.03043+00', '2026-02-17 20:19:11.578984+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009006', 'authenticated', 'authenticated', 'frank.test@tunetrees.test', '$2a$10$Bj4LCS0HDPrB3aarTJtcnOMpx.QInY9pudjipKdkmffNq6mrJTqny', '2025-11-03 04:57:14.091538+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Frank Test", "email_verified": true}', NULL, '2025-11-03 04:57:14.090134+00', '2026-02-17 20:19:15.257649+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009007', 'authenticated', 'authenticated', 'grace.test@tunetrees.test', '$2a$10$uSW.fohYTrepT7D.o6VJ8.9nECnKT/SI76JKw5.vRhyZpWZT2ZNh.', '2025-11-03 04:57:14.152838+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Grace Test", "email_verified": true}', NULL, '2025-11-03 04:57:14.151262+00', '2026-02-17 20:19:18.947693+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009008', 'authenticated', 'authenticated', 'henry.test@tunetrees.test', '$2a$10$KFQX5v4ySEi./YNVKOHd..OGI/hBKUatZwO6jVJedWftCLerCJ69y', '2025-11-03 04:57:14.210449+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Henry Test", "email_verified": true}', NULL, '2025-11-03 04:57:14.209206+00', '2026-02-17 20:19:22.624266+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
    ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000009009', 'authenticated', 'authenticated', 'iris.test@tunetrees.test', '$2a$10$.SkKpNefx7y5AawoRvTzeuoCHBTh/m7FtVpY9ZCWQ3aeybZ56I/Jy', '2025-11-03 04:57:14.271042+00', NULL, '', NULL, '', NULL, '', '', NULL, NULL, '{"provider": "email", "providers": ["email"]}', '{"name": "Iris Test", "email_verified": true}', NULL, '2025-11-03 04:57:14.269848+00', '2026-02-17 20:19:26.30959+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at,
    raw_app_meta_data = EXCLUDED.raw_app_meta_data,
    raw_user_meta_data = EXCLUDED.raw_user_meta_data,
    updated_at = EXCLUDED.updated_at,
    deleted_at = NULL,
    is_anonymous = FALSE;

INSERT INTO auth.identities (
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at,
    id
) VALUES
    ('00000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009001', '{"sub": "00000000-0000-4000-8000-000000009001", "email": "alice.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:13.790856+00', '2025-11-03 04:57:13.790876+00', '2025-11-03 04:57:13.790876+00', 'c6572b7b-5591-48a5-809b-216fc0ede696'),
    ('00000000-0000-4000-8000-000000009002', '00000000-0000-4000-8000-000000009002', '{"sub": "00000000-0000-4000-8000-000000009002", "email": "bob.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:13.854811+00', '2025-11-03 04:57:13.854832+00', '2025-11-03 04:57:13.854832+00', '87b3f277-6aab-493a-b943-706e4def70b6'),
    ('00000000-0000-4000-8000-000000009004', '00000000-0000-4000-8000-000000009004', '{"sub": "00000000-0000-4000-8000-000000009004", "email": "dave.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:13.973186+00', '2025-11-03 04:57:13.973202+00', '2025-11-03 04:57:13.973202+00', 'cecd9b3e-8c00-436c-99c6-43b6b43765a4'),
    ('00000000-0000-4000-8000-000000009005', '00000000-0000-4000-8000-000000009005', '{"sub": "00000000-0000-4000-8000-000000009005", "email": "eve.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:14.030921+00', '2025-11-03 04:57:14.030941+00', '2025-11-03 04:57:14.030941+00', 'f29ef89d-c8ea-4e1c-9162-47dfcd89d986'),
    ('00000000-0000-4000-8000-000000009006', '00000000-0000-4000-8000-000000009006', '{"sub": "00000000-0000-4000-8000-000000009006", "email": "frank.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:14.090643+00', '2025-11-03 04:57:14.090657+00', '2025-11-03 04:57:14.090657+00', 'e82af8a8-11f0-41c4-bfc6-78fd69e3ebee'),
    ('00000000-0000-4000-8000-000000009007', '00000000-0000-4000-8000-000000009007', '{"sub": "00000000-0000-4000-8000-000000009007", "email": "grace.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:14.151958+00', '2025-11-03 04:57:14.151974+00', '2025-11-03 04:57:14.151974+00', 'f802afe9-d0e7-4c37-b072-ab909b08967b'),
    ('00000000-0000-4000-8000-000000009008', '00000000-0000-4000-8000-000000009008', '{"sub": "00000000-0000-4000-8000-000000009008", "email": "henry.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:14.209667+00', '2025-11-03 04:57:14.209684+00', '2025-11-03 04:57:14.209684+00', '03cad289-fec7-40b2-a430-7869e87b5ea0'),
    ('00000000-0000-4000-8000-000000009009', '00000000-0000-4000-8000-000000009009', '{"sub": "00000000-0000-4000-8000-000000009009", "email": "iris.test@tunetrees.test", "email_verified": false, "phone_verified": false}', 'email', '2025-11-03 04:57:14.27032+00', '2025-11-03 04:57:14.270335+00', '2025-11-03 04:57:14.270335+00', '2ff72518-d91f-4d48-9c82-ca68ef687bb3')
ON CONFLICT (id) DO UPDATE SET
    provider_id = EXCLUDED.provider_id,
    user_id = EXCLUDED.user_id,
    identity_data = EXCLUDED.identity_data,
    provider = EXCLUDED.provider,
    last_sign_in_at = EXCLUDED.last_sign_in_at,
    updated_at = EXCLUDED.updated_at;

COMMIT;