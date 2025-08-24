import express from 'express';
import cors from 'cors';
import config from './config';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import supabaseService from './services/supabaseService';

const app = express();

// Middleware
app.use(cors({ origin: config.security.corsOrigin }));
app.use(express.json());

// Routes
app.use('/api', routes);

// Error handling
app.use(errorHandler);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'DLocal Subscription Microservice is running',
    timestamp: new Date().toISOString()
  });
});

const PORT = config.port || 3000;

// Test database connection on startup
async function startServer() {
  try {
    console.log('Testing Supabase connection...');
    await supabaseService.testConnection();
    console.log('✅ Supabase connection successful');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📋 API Documentation: http://localhost:${PORT}/api`);
      console.log(`💚 Health Check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();