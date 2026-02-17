const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data.json");

// Load persisted data or initialize
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return { count: 0, ips: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

// Serve static files from project root
app.use(express.static(__dirname));

// Trust proxy headers so req.ip reflects the real client IP behind reverse proxies
app.set("trust proxy", true);

// Visit endpoint — increments only for new IPs
app.get("/api/visit", (req, res) => {
  const ip = req.ip;
  const data = loadData();

  if (!data.ips.includes(ip)) {
    data.ips.push(ip);
    data.count++;
    saveData(data);
  }

  res.json({ count: data.count });
});

app.listen(PORT, () => {
  console.log(`Visitor counter running on http://localhost:${PORT}`);
});
