const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

// Permanent stats log
const statsLogPath = path.join(__dirname, 'stats-log.jsonl');

// Server uptime start
const serverStart = Date.now();

router.get('/', (req, res) => {
  let totalPastes = 0;
  let dailyPastes = 0;
  let yearlyPastes = 0;

  const now = new Date();
  const currentYear = now.getFullYear();
  const todayString = now.toISOString().split('T')[0]; // yyyy-mm-dd

  try {
    let lines = [];

    if (fs.existsSync(statsLogPath)) {
      lines = fs.readFileSync(statsLogPath, 'utf8')
        .trim()
        .split('\n')
        .filter(line => line.length > 0);
    }

    lines.forEach(line => {
      try {
        const entry = JSON.parse(line);
        const created = new Date(entry.created);

        totalPastes++;

        // Yearly stats
        if (created.getFullYear() === currentYear) {
          yearlyPastes++;
        }

        // Daily stats
        const createdDay = created.toISOString().split('T')[0];
        if (createdDay === todayString) {
          dailyPastes++;
        }

      } catch (err) {
        console.error("Bad log entry:", err);
      }
    });

    // Uptime (in multiple formats)
    const uptimeMS = Date.now() - serverStart;
    const uptime = {
      seconds: Math.floor(uptimeMS / 1000),
      minutes: Math.floor(uptimeMS / 60000),
      hours: Math.floor(uptimeMS / 3600000),
      days: Math.floor(uptimeMS / 86400000)
    };

    res.json({
      totalPastes,
      dailyPastes,
      yearlyPastes,
      uptime
    });

  } catch (err) {
    console.error('Failed to load stats log:', err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

module.exports = router;
