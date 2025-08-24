import { Router } from 'express';
import config from '../config';
import paymentsRouter from './payments';
import subscriptionsRouter from './subscriptions';
import webhooksRouter from './webhooks';

const router = Router();

// Ruta de health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'DLocal Payment & Subscription Gateway API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Rutas de pagos (mantenidas para compatibilidad)
router.use('/payments', paymentsRouter);

// Rutas de suscripciones
router.use('/subscriptions', subscriptionsRouter);

// Rutas de webhooks
router.use('/webhooks', webhooksRouter);

// Link inicial: muestra un loading corto y redirige a WhatsApp
router.get('/whatsapp/start', (req, res) => {
  const phoneNumber = config.whatsapp.phoneNumber;
  const rawMessage = (req.query.message as string) || 'Quiero realizar una página web';
  const message = encodeURIComponent(rawMessage);
  const whatsappLink = `https://wa.me/${phoneNumber}?text=${message}`;

  const html = `<!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Redirigiendo a WhatsApp…</title>
    <meta http-equiv="refresh" content="2;url=${whatsappLink}" />
    <style>
      html, body { height: 100%; }
      body { display:flex; align-items:center; justify-content:center; margin:0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
      .card { background:#111827; border:1px solid #1f2937; border-radius:16px; padding:28px 24px; max-width:420px; width:92%; text-align:center; box-shadow: 0 20px 40px rgba(0,0,0,.35); }
      .spinner { width:42px; height:42px; border:4px solid #334155; border-top-color:#22c55e; border-radius:50%; margin:0 auto 16px; animation: spin 0.9s linear infinite; }
      h1 { font-size:20px; margin:0 0 6px; }
      p { margin:0 0 14px; color:#94a3b8; }
      a { color:#22c55e; text-decoration:none; font-weight:600; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
    <script>
      // Redirección rápida con fallback del meta refresh
      setTimeout(function(){ window.location.href = ${JSON.stringify(whatsappLink)}; }, 800);
    </script>
  </head>
  <body>
    <div class="card">
      <div class="spinner" aria-hidden="true"></div>
      <h1>Abriendo WhatsApp…</h1>
      <p>Estamos redirigiéndote para empezar a chatear. Esto tomará menos de un segundo.</p>
      <p>Si no ocurre nada, haz clic aquí: <br/><a href="${whatsappLink}">Ir a WhatsApp</a></p>
    </div>
  </body>
  </html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
});

export default router;
