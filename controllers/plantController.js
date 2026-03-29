const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createNotification } = require('./notificationController');

const DATA_PATH = path.join(__dirname, '../data/forest.json');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { forests: [] };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

exports.getForest = (req, res) => {
  const data = readData();
  const userId = req.user?.userId || req.user?.id; // fallback for different token structures
  const userForest = data.forests.filter(p => !p.userId || p.userId === userId);
  res.json(userForest);
};

exports.savePlant = (req, res) => {
  const { duration, score } = req.body;
  if (!duration) return res.status(400).json({ error: 'Duration is required' });

  const data = readData();
  const plant = {
    id: uuidv4(),
    userId: req.user?.userId || req.user?.id,
    duration: parseFloat(duration),
    score: score || 'Basic Tree',
    createdAt: new Date().toISOString()
  };
  data.forests.push(plant);
  writeData(data);
  
  // Trigger real-time notification
  createNotification(req.app, plant.userId, 'plant:grown', 'Congrats you have grown one plant! 🌱');

  res.status(201).json(plant);
};
