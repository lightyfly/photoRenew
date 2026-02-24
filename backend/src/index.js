import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataFilePath = path.join(__dirname, '../data/users.json');

app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function ensureDataFile() {
  try {
    await fs.access(dataFilePath);
  } catch {
    await fs.mkdir(path.dirname(dataFilePath), { recursive: true });
    await fs.writeFile(dataFilePath, JSON.stringify({ users: [] }, null, 2), 'utf8');
  }
}

async function readDb() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFilePath, 'utf8');
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(dataFilePath, JSON.stringify(db, null, 2), 'utf8');
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hashed = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hashed };
}

function verifyPassword(password, salt, expectedHash) {
  const currentHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(currentHash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: missing token.' });
  }

  const db = await readDb();
  const user = db.users.find((item) => item.token === token);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: invalid token.' });
  }

  req.user = user;
  req.db = db;
  return next();
}

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'photo-renew-backend' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const db = await readDb();
    const exists = db.users.some((item) => item.email === normalizedEmail);

    if (exists) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const { salt, hashed } = hashPassword(password);
    const token = createToken();
    const now = new Date().toISOString();
    const user = {
      id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordSalt: salt,
      passwordHash: hashed,
      token,
      remainingCredits: 5,
      createdAt: now,
      updatedAt: now
    };

    db.users.push(user);
    await writeDb(db);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        remainingCredits: user.remainingCredits
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Registration failed.', details: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const db = await readDb();
    const user = db.users.find((item) => item.email === normalizedEmail);

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    user.token = createToken();
    user.updatedAt = new Date().toISOString();
    await writeDb(db);

    return res.json({
      token: user.token,
      user: {
        id: user.id,
        email: user.email,
        remainingCredits: user.remainingCredits
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Login failed.', details: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      remainingCredits: req.user.remainingCredits
    }
  });
});

app.post('/api/restore', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const model = process.env.GOOGLE_MODEL || 'gemini-2.5-flash-image-preview';

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GOOGLE_API_KEY in environment variables.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Use multipart/form-data with field name "image".' });
    }

    if (req.user.remainingCredits <= 0) {
      return res.status(403).json({ error: 'No credits left. Please recharge your account.' });
    }

    const customPrompt = req.body.prompt?.trim();
    const prompt =
      customPrompt ||
      'Restore this old photograph. Keep faces and identity unchanged, remove scratches, dust, folds, improve clarity and color naturally, and preserve realistic texture.';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: req.file.mimetype,
                data: req.file.buffer.toString('base64')
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.3
      }
    };

    const { data } = await axios.post(endpoint, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000
    });

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => part.inline_data?.data);

    if (!imagePart?.inline_data?.data) {
      return res.status(502).json({
        error: 'Google API did not return an image.',
        raw: data
      });
    }

    req.user.remainingCredits -= 1;
    req.user.updatedAt = new Date().toISOString();
    await writeDb(req.db);

    return res.json({
      imageBase64: imagePart.inline_data.data,
      mimeType: imagePart.inline_data.mime_type || 'image/png',
      remainingCredits: req.user.remainingCredits
    });
  } catch (error) {
    const details = error.response?.data || error.message;
    return res.status(500).json({
      error: 'Failed to restore photo.',
      details
    });
  }
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Photo Renew backend running on http://localhost:${port}`);
  });
}

export default app;
