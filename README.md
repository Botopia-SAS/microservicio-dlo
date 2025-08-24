# DLocal Payment & Subscription Microservice

Microservicio en TypeScript/Express para pagos y suscripciones con DLocal, con persistencia en Supabase, manejo de webhooks y páginas de éxito/error con redirección a WhatsApp.

## 🚀 Características

- TypeScript + Express
- Integración DLocal (pagos y suscripciones)
- Supabase para usuarios, planes y payments
- Webhooks de DLocal y páginas de success/error integradas
- CORS configurable y rate limiting

## 📁 Estructura

```
src/
├─ config/              # Carga de .env y configuración
├─ controllers/         # Lógica de Payments, Subscriptions y Webhooks
├─ middleware/          # Validación, manejo de errores
├─ routes/              # /api/payments, /api/subscriptions, /api/webhooks
├─ services/            # DLocal, Supabase
├─ types/               # Tipos TS
└─ index.ts             # Bootstrap del servidor
```

## ⚙️ Configuración (.env)

Variables principales:

- PORT=3000
- DLOCAL_API_URL=https://sandbox.dlocal.com
- DLOCAL_X_LOGIN=... (obligatoria)
- DLOCAL_X_TRANS_KEY=... (obligatoria)
- SUPABASE_URL=...
- SUPABASE_KEY=...
- SUPABASE_SERVICE_ROLE_KEY=...
- CORS_ORIGIN=http://localhost:3000
- PUBLIC_BASE_URL= (opcional) si no se define, usa CORS_ORIGIN
- FRONTEND_BASE_URL= (opcional) si no se define, usa CORS_ORIGIN
- WHATSAPP_NUMBER=573XXXXXXXX (usada en página de success)

Notas de URLs
- El micro expone callbacks públicos en: `${PUBLIC_BASE_URL}/api/webhooks/{dlocal|success|error}`
- Las redirecciones de usuario (back_url) van a `${FRONTEND_BASE_URL}/subscription-cancel`
- Si no defines PUBLIC_BASE_URL ni FRONTEND_BASE_URL, ambos heredan de CORS_ORIGIN para que todo quede en un solo dominio.

Ejemplo rápido:

```env
CORS_ORIGIN=https://mi-dominio.com
# PUBLIC_BASE_URL y FRONTEND_BASE_URL heredan de CORS_ORIGIN
WHATSAPP_NUMBER=573138381310
DLOCAL_X_LOGIN=xxxx
DLOCAL_X_TRANS_KEY=yyyy
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=anon-...
SUPABASE_SERVICE_ROLE_KEY=service-role-...
```

## ▶️ Cómo correr

```bash
npm install
npm run dev   # desarrollo con recarga

# o build + start
npm run build
npm start
```

El servidor arranca en `http://localhost:3000` (o el puerto configurado). Health: `GET /health` y `GET /api/health`.

## 📡 Endpoints

Base de API: `/api`

Health
- GET `/api/health` → estado del servicio

Payments (`/api/payments`)
- POST `/simple` → crear pago simple (solo amount)
- POST `/` → crear pago completo (request validado)
- GET `/:paymentId` → estado del pago
- POST `/:paymentId/cancel` → cancelar pago
- POST `/webhook` → webhook de DLocal (pagos)
- GET `/methods?country=XX` → métodos de pago por país

Subscriptions (`/api/subscriptions`)
- POST `/create` → crear suscripción a partir de user_id y plan_id (guarda payment en Supabase y devuelve subscribe_url)
- GET `/plans` → listar planes de DLocal (paginado)
- POST `/plans` → crear plan simple (selector de país en DLocal Go)
- GET `/plans/:id` → obtener plan por ID
- POST `/webhook` → webhook de suscripciones (procesa eventos y actualiza pagos)
- PATCH `/cancel/by-user` → cancelar por user_id (resuelve plan/subscription y marca “Cancelled”)

Webhooks y callbacks (`/api/webhooks`)
- POST `/dlocal` → webhook de DLocal para actualizar estado de pagos
- GET|POST `/success` → página de éxito (muestra confirmación y botón/enlace a WhatsApp). Usa `WHATSAPP_NUMBER` del .env
- GET|POST `/error` → página de error y enlace a soporte por WhatsApp

## 🔄 Flujo de Suscripción

1) `POST /api/subscriptions/create` con `{ user_id, plan_id }`
2) Se crea el plan en DLocal si aplica y se genera `subscribe_url`
3) Usuario paga en DLocal Go
4) DLocal llama a `POST /api/webhooks/dlocal` (notificación) y/o redirige a `/api/webhooks/success|error`
5) El micro actualiza el payment en Supabase y, si corresponde, asigna el plan al usuario; la página de éxito ofrece botón a WhatsApp

## 🔐 Seguridad y CORS

- CORS usa `CORS_ORIGIN`
- Rate limiting configurable por `RATE_LIMIT_WINDOW_MS` y `RATE_LIMIT_MAX_REQUESTS`
- Usa HTTPS en producción y no expongas tus llaves

## 🧰 Colección Thunder Client

Incluye `thunder-collection.json` y `thunder-environment.json` para probar endpoints desde VS Code.

## � Troubleshooting

- Bloqueo de devtunnels: si tu red bloquea dominios tipo `*.devtunnels.ms`, usa ngrok/Cloudflare Tunnel u otro dominio y ponlo en `CORS_ORIGIN` (y opcionalmente `PUBLIC_BASE_URL`).
- Si ves CORS bloqueado, revisa que el frontend apunte al mismo dominio que `CORS_ORIGIN`.

## 🧪 Scripts útiles

```bash
npm test        # tests (si configuras Jest)
npm run lint    # lint
npm run lint:fix
```

## 📄 Licencia

MIT
