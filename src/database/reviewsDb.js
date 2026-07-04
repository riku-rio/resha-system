const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "../../data/reviews_db.json");

function ensureDbExists() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({}, null, 2), "utf8");
  }
}

function readData() {
  ensureDbExists();
  try {
    const content = fs.readFileSync(dbPath, "utf8");
    return JSON.parse(content || "{}");
  } catch (error) {
    console.error("Failed to read reviews database:", error);
    return {};
  }
}

function writeData(data) {
  ensureDbExists();
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write to reviews database:", error);
  }
}

function getGuildConfig(guildId) {
  const data = readData();
  const guildKey = guildId || "global";
  if (!data[guildKey]) {
    data[guildKey] = {
      config: {
        reviewsChannel: null,
        reviewRole: null,
        minDelaySeconds: 0
      },
      reviews: []
    };
    writeData(data);
  }
  // Ensure default structures exist even if the guild key was set in another way
  if (!data[guildKey].config) {
    data[guildKey].config = {
      reviewsChannel: null,
      reviewRole: null,
      minDelaySeconds: 0
    };
  }
  if (!data[guildKey].reviews) {
    data[guildKey].reviews = [];
  }
  return data[guildKey];
}

function saveGuildConfig(guildId, guildConfig) {
  const data = readData();
  const guildKey = guildId || "global";
  data[guildKey] = guildConfig;
  writeData(data);
}

function getGuildReviews(guildId) {
  const config = getGuildConfig(guildId);
  return config.reviews;
}

function getReview(guildId, id) {
  const reviews = getGuildReviews(guildId);
  return reviews.find((r) => r.id === id) || null;
}

function createReview(guildId, { raterId, ratedId, stars, comment, ticketChannelName, source }) {
  const guildConfig = getGuildConfig(guildId);
  const reviews = guildConfig.reviews;
  const maxId = reviews.reduce((max, r) => (r.id > max ? r.id : max), 0);

  const newReview = {
    id: maxId + 1,
    raterId,
    ratedId,
    stars: parseInt(stars, 10),
    comment: (comment || "").trim(),
    ticketChannelName: ticketChannelName || null,
    source: source || "auto", // "auto" or "manual"
    createdAt: new Date().toISOString()
  };

  reviews.push(newReview);
  saveGuildConfig(guildId, guildConfig);
  return newReview;
}

function deleteReview(guildId, id) {
  const guildConfig = getGuildConfig(guildId);
  const reviews = guildConfig.reviews;
  const idx = reviews.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const [deleted] = reviews.splice(idx, 1);
  saveGuildConfig(guildId, guildConfig);
  return deleted;
}

function getAverage(guildId, ratedId) {
  const reviews = getGuildReviews(guildId);
  const memberReviews = reviews.filter((r) => r.ratedId === ratedId);
  if (memberReviews.length === 0) {
    return { average: 0, count: 0 };
  }
  const sum = memberReviews.reduce((acc, r) => acc + r.stars, 0);
  return {
    average: parseFloat((sum / memberReviews.length).toFixed(2)),
    count: memberReviews.length
  };
}

module.exports = {
  getGuildConfig,
  saveGuildConfig,
  getGuildReviews,
  getReview,
  createReview,
  deleteReview,
  getAverage
};
