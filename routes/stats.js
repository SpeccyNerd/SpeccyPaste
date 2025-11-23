const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Adjust this path if needed
const pastesDir = path.join(__dirname, '../pastes');

router.get('/', (req, res) => {
  let totalPastes = 0;
  let dailyPastes = 0;

  const today = new Date().toISOString().split('T')[0];

  try {
    const files = fs.readdirSync(pastesDir);

    totalPastes = files.filter(f => f.endsWith('.meta.json')).length;

    files.forEach(file => {
      if (file.endsWith('.meta.json')) {
        const metaPath = path.join(pastesDir, file);
        const stats = fs.statSync(metaPath);
        const createdDate = stats.birthtime.toISOString().split('T')[0];

        if (createdDate === today) {
          dailyPastes++;
        }
      }
    });

    res.json({
      totalPastes,
      dailyPastes,
      uptime: true
    });
  } catch (err) {
    console.error('Failed to read paste stats:', err);
    res.status(500).json({ error: 'Failed to read stats' });
  }
});

module.exports = router;
