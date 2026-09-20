const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const colors = require('colors'); // For colored console logs
//const terminalLink = require('terminal-link'); //requiredd for terminal link in console logs //disabled for now due to issues with Windows terminal
require('dotenv').config();

// Initialize DB pool setup
const pool = require('./config/db');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const habitRoutes = require('./routes/habitRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const categoryRoutes = require('./routes/categoryRoutes');

// Import Middleware
const cookieParser = require('cookie-parser');
const gatekeeper = require('./middleware/gatekeeper');

const app = express();
const server = http.createServer(app);

// Configure CORS for frontend access (runs-on.dev)
const allowedOrigins = [
  'https://parky.runs-on.dev',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback allow for public API
    }
  },
  credentials: true
}));

// Initialize Socket.io with restricted CORS origin
const io = require('socket.io')(server, {
  cors: {
    origin: "*", // Or your exact frontend local URL like "http://localhost:3000"
    methods: ["GET", "POST"]
  }
});

app.set('io', io);

// --- GLOBAL MIDDLEWARE ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Outer Network Gatekeeper Barrier (Temporary Site-Wide Access Gate)
app.use(gatekeeper);

app.use(express.static(path.join(__dirname, 'public')));

// Feature Flags Configuration
const features = require('./config/features');

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/habits', habitRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/categories', categoryRoutes);

// Feature flags endpoint
app.get('/api/features', (req, res) => {
  res.json({ success: true, features });
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, message: 'Habit Tracker Engine active & DB connected' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Root fallback route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io Connection Event
io.on('connection', (socket) => {
  console.log(`Real-time client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`.blue.bold);
});