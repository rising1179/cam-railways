# Cam — Per-user Password Version

- Pass sheet = `role | id | hash` (argon2)
- UI: /student and /teacher
- Health: /healthz
- Env: PORT, JWT_SECRET, GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_JSON, CACHE_TTL_SECONDS
