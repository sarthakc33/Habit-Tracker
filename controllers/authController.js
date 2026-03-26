const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { JWT_SECRET } = require('../middleware/auth');

const USERS_PATH = path.join(__dirname, '../data/users.json');

function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8')); }
  catch { return { users: [] }; }
}
function writeUsers(data) { fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2)); }

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const data = readUsers();
    const exists = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = {
      id: uuidv4(),
      username,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    data.users.push(user);
    writeUsers(data);

    // Initialize gamification for this user
    const GAMI_PATH = path.join(__dirname, '../data/gamification.json');
    let gamiData;
    try { gamiData = JSON.parse(fs.readFileSync(GAMI_PATH, 'utf8')); }
    catch { gamiData = { users: {} }; }
    if (!gamiData.users) gamiData.users = {};
    gamiData.users[user.id] = {
      xp: 0, level: 1, streak: 0, lastActiveDate: null, badges: [], history: []
    };
    fs.writeFileSync(GAMI_PATH, JSON.stringify(gamiData, null, 2));

    const token = generateToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, createdAt: user.createdAt }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const data = readUsers();
    const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, createdAt: user.createdAt }
    });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.getProfile = (req, res) => {
  const data = readUsers();
  const user = data.users.find(u => u.id === req.user.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, username: user.username, createdAt: user.createdAt });
};
