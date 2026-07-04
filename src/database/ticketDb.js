const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "../../data/ticket_db.json");

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
    console.error("Failed to read ticket database:", error);
    return {};
  }
}

function writeData(data) {
  ensureDbExists();
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write to ticket database:", error);
  }
}

function getGuildConfig(guildId) {
  const data = readData();
  if (!data[guildId]) {
    data[guildId] = {
      buttons: [],
      ticketMessages: {},
      embedSettings: {
        title: "🎫 Support Tickets",
        description: "Click one of the buttons below to open a support ticket.",
        color: "#5865F2",
        image: null,
        footer: null
      },
      general: {
        maxTicketsPerUser: 3,
        globalLimit: null,
        logsChannel: null,
        transcriptEnabled: true,
        autoCloseHours: null,
        closeReasonPrompt: true,
        confirmOnClose: true
      },
      activeTickets: [], // Track active tickets
      claimStats: {} // Track claimed ticket counts per staff member
    };
    writeData(data);
  }
  if (!data[guildId].claimStats) {
    data[guildId].claimStats = {};
    writeData(data);
  }
  return data[guildId];
}

function saveGuildConfig(guildId, config) {
  const data = readData();
  data[guildId] = config;
  writeData(data);
}

function addActiveTicket(guildId, ticket) {
  const config = getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  config.activeTickets.push(ticket);
  saveGuildConfig(guildId, config);
}

function getActiveTicket(guildId, channelId) {
  const config = getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  return config.activeTickets.find(t => t.channelId === channelId) || null;
}

function updateActiveTicket(guildId, channelId, updates) {
  const config = getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  const index = config.activeTickets.findIndex(t => t.channelId === channelId);
  if (index !== -1) {
    config.activeTickets[index] = { ...config.activeTickets[index], ...updates };
    saveGuildConfig(guildId, config);
  }
}

function removeActiveTicket(guildId, channelId) {
  const config = getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  config.activeTickets = config.activeTickets.filter(t => t.channelId !== channelId);
  saveGuildConfig(guildId, config);
}

function incrementClaimCount(guildId, userId) {
  const config = getGuildConfig(guildId);
  config.claimStats = config.claimStats || {};
  config.claimStats[userId] = (config.claimStats[userId] || 0) + 1;
  saveGuildConfig(guildId, config);
}

function getClaimStats(guildId) {
  const config = getGuildConfig(guildId);
  return config.claimStats || {};
}

function resetClaimStats(guildId, userId) {
  const config = getGuildConfig(guildId);
  config.claimStats = config.claimStats || {};
  if (userId) {
    config.claimStats[userId] = 0;
  } else {
    config.claimStats = {};
  }
  saveGuildConfig(guildId, config);
}

module.exports = {
  getGuildConfig,
  saveGuildConfig,
  addActiveTicket,
  getActiveTicket,
  updateActiveTicket,
  removeActiveTicket,
  incrementClaimCount,
  getClaimStats,
  resetClaimStats
};
