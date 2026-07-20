// Runs before every test file. src/config/env.ts validates and freezes its
// config at import time, so any module that transitively imports it (most
// of the app) needs these present before that first import happens.
// dotenv (loaded inside env.ts) never overwrites vars already set here.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.COMPANY_PHYSICAL_ADDRESS ??= "123 Test St, Test City, TC 00000";
process.env.REPLY_TO_EMAIL ??= "test@example.com";
