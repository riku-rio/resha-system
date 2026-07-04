const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "../../data/logs_db.json");

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
    console.error("Failed to read logs database:", error);
    return {};
  }
}

function writeData(data) {
  ensureDbExists();
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write to logs database:", error);
  }
}

function getGuildConfig(guildId) {
  const data = readData();
  const guildKey = guildId || "global";
  if (!data[guildKey]) {
    data[guildKey] = {
      enabled: false,
      autoCreate: false,
      channels: {
        messageDelete: null,
        messageEdit: null,
        memberJoin: null,
        memberLeave: null,
        ticket: null
      }
    };
    writeData(data);
  }
  
  if (data[guildKey].enabled === undefined) data[guildKey].enabled = false;
  if (data[guildKey].autoCreate === undefined) data[guildKey].autoCreate = false;
  if (!data[guildKey].channels) {
    data[guildKey].channels = {
      messageDelete: null,
      messageEdit: null,
      memberJoin: null,
      memberLeave: null,
      ticket: null
    };
  }
  if (data[guildKey].channels.ticket === undefined) {
    data[guildKey].channels.ticket = null;
  }
  return data[guildKey];
}

function saveGuildConfig(guildId, config) {
  const data = readData();
  const guildKey = guildId || "global";
  data[guildKey] = config;
  writeData(data);
}

function setLogChannel(guildId, type, channelId) {
  const config = getGuildConfig(guildId);
  config.channels = config.channels || {};
  config.channels[type] = channelId;
  saveGuildConfig(guildId, config);
}

function setAutoCreate(guildId, bool) {
  const config = getGuildConfig(guildId);
  config.autoCreate = bool;
  saveGuildConfig(guildId, config);
}

module.exports = {
  getGuildConfig,
  saveGuildConfig,
  setLogChannel,
  setAutoCreate
};
