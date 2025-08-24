# DLocal Payment Gateway Microservice

Un microservicio TypeScript/Express para integración con la pasarela de pago DLocal.

## 🚀 Características

- **TypeScript**: Tipado estático para mayor seguridad
- **Express.js**: Framework web minimalista y rápido
- **DLocal Integration**: Integración completa con DLocal API
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Validación de datos con Joi
- **Error Handling**: Manejo robusto de errores
- **Webhooks**: Soporte para notificaciones de DLocal

## 📁 Estructura del Proyecto

```
src/
├── config/           # Configuración de la aplicación
├── controllers/      # Controladores de rutas
├── middleware/       # Middleware personalizado
├── routes/          # Definición de rutas
├── services/        # Servicios de terceros (DLocal)
├── types/           # Tipos TypeScript
├── utils/           # Utilidades y helpers
└── index.ts         # Punto de entrada de la aplicación
```

## 🛠️ Instalación

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd dlocal-payment-gateway
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   ```bash
   cp .env.example .env
   ```
   
   Edita el archivo `.env` con tus credenciales de DLocal:
   ```env
   DLOCAL_X_LOGIN=tu_x_login
   DLOCAL_X_TRANS_KEY=tu_x_trans_key
   DLOCAL_WEBHOOK_SECRET=tu_webhook_secret
   ```

4. **Compilar el proyecto**
   ```bash
   npm run build
   ```

5. **Iniciar en desarrollo**
   ```bash
   npm run dev
   ```

## 📡 API Endpoints

### Health Check
```http
GET /api/health
```

### Crear Pago
```http
POST /api/payments
Content-Type: application/json

{
  "amount": 100.00,
  "currency": "USD",
  "country": "US",
  "payer": {
    "name": "John Doe",
    "email": "john@example.com",
    "document": "12345678",
    "phone": "+1234567890"
  },
  "orderId": "ORDER-123",
  "description": "Test payment",
  "successUrl": "https://yoursite.com/success",
  "errorUrl": "https://yoursite.com/error",
  "cancelUrl": "https://yoursite.com/cancel"
}
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "paymentId": "PAY_123456789",
    "orderId": "ORDER-123",
    "status": "PENDING",
    "amount": 100.00,
    "currency": "USD",
    "redirectUrl": "https://dlocal.com/payment/redirect/...",
    "createdDate": "2025-08-23T10:00:00Z"
  },
  "message": "Payment created successfully"
}
```

### Consultar Estado de Pago
```http
GET /api/payments/{paymentId}
```

### Cancelar Pago
```http
POST /api/payments/{paymentId}/cancel
```

### Webhook (DLocal Notifications)
```http
POST /api/payments/webhook
```

### Obtener Métodos de Pago
```http
GET /api/payments/methods?country=US
```

## 🔐 Configuración de Seguridad

### Variables de Entorno Requeridas

- `DLOCAL_X_LOGIN`: Tu X-Login de DLocal
- `DLOCAL_X_TRANS_KEY`: Tu X-Trans-Key de DLocal  
- `DLOCAL_WEBHOOK_SECRET`: Secret para verificar webhooks

### Variables Opcionales

- `PORT`: Puerto del servidor (default: 3000)
- `NODE_ENV`: Entorno de ejecución (development/production)
- `CORS_ORIGIN`: Origen permitido para CORS
- `RATE_LIMIT_WINDOW_MS`: Ventana de tiempo para rate limiting
- `RATE_LIMIT_MAX_REQUESTS`: Máximo de requests por ventana

## 🔄 Flujo de Pago

1. **Cliente envía datos de pago** → `POST /api/payments`
2. **Servidor crea pago en DLocal** → Recibe URL de redirección
3. **Cliente es redirigido** → DLocal procesa el pago
4. **DLocal envía webhook** → `POST /api/payments/webhook`
5. **Servidor procesa notificación** → Actualiza estado del pago

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Linting
npm run lint

# Fix linting issues
npm run lint:fix
```

## 🚀 Despliegue

### Producción
```bash
npm run build
npm start
```

### Docker (Opcional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

## 📚 Documentación DLocal

- [DLocal API Documentation](https://docs.dlocalgo.com/integration-api/)
- [Webhook Documentation](https://docs.dlocalgo.com/webhooks/)

## ⚠️ Consideraciones de Seguridad

1. **Nunca exponer las credenciales** en el código fuente
2. **Usar HTTPS** en producción
3. **Verificar firmas de webhooks** para evitar requests maliciosos
4. **Implementar rate limiting** para prevenir abusos
5. **Validar todos los inputs** del usuario

## 🤝 Contribución

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Soporte

Para soporte técnico o preguntas:
- Crear un issue en GitHub
- Consultar la documentación de DLocal
- Contactar al equipo de desarrollo
