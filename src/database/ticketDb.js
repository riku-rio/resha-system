const prisma = require("../config/database");

const DEFAULT_EMBED = {
  title: "🎫 Support Tickets",
  description: "Click one of the buttons below to open a support ticket.",
  color: "#5865F2",
  image: null,
  footer: null
};

const DEFAULT_GENERAL = {
  maxTicketsPerUser: 3,
  globalLimit: null,
  logsChannel: null,
  transcriptEnabled: true,
  autoCloseHours: null,
  closeReasonPrompt: true,
  confirmOnClose: true
};

/**
 * Gets (or creates) the full config object for a guild.
 * Returns a plain JS object matching the old JSON shape.
 */
async function getGuildConfig(guildId) {
  let row = await prisma.guildTicketConfig.findUnique({ where: { guildId } });

  if (!row) {
    row = await prisma.guildTicketConfig.create({
      data: {
        guildId,
        buttons: JSON.stringify([]),
        ticketMessages: JSON.stringify({}),
        embedSettings: JSON.stringify(DEFAULT_EMBED),
        general: JSON.stringify(DEFAULT_GENERAL),
        activeTickets: JSON.stringify([]),
        claimStats: JSON.stringify({})
      }
    });
  }

  return {
    buttons: JSON.parse(row.buttons),
    ticketMessages: JSON.parse(row.ticketMessages),
    embedSettings: JSON.parse(row.embedSettings),
    general: JSON.parse(row.general),
    activeTickets: JSON.parse(row.activeTickets),
    claimStats: JSON.parse(row.claimStats)
  };
}

/**
 * Saves the full config object for a guild.
 * @param {string} guildId
 * @param {object} config  - same shape returned by getGuildConfig
 */
async function saveGuildConfig(guildId, config) {
  await prisma.guildTicketConfig.upsert({
    where: { guildId },
    update: {
      buttons: JSON.stringify(config.buttons ?? []),
      ticketMessages: JSON.stringify(config.ticketMessages ?? {}),
      embedSettings: JSON.stringify(config.embedSettings ?? DEFAULT_EMBED),
      general: JSON.stringify(config.general ?? DEFAULT_GENERAL),
      activeTickets: JSON.stringify(config.activeTickets ?? []),
      claimStats: JSON.stringify(config.claimStats ?? {})
    },
    create: {
      guildId,
      buttons: JSON.stringify(config.buttons ?? []),
      ticketMessages: JSON.stringify(config.ticketMessages ?? {}),
      embedSettings: JSON.stringify(config.embedSettings ?? DEFAULT_EMBED),
      general: JSON.stringify(config.general ?? DEFAULT_GENERAL),
      activeTickets: JSON.stringify(config.activeTickets ?? []),
      claimStats: JSON.stringify(config.claimStats ?? {})
    }
  });
}

async function addActiveTicket(guildId, ticket) {
  const config = await getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  config.activeTickets.push(ticket);
  await saveGuildConfig(guildId, config);
}

async function getActiveTicket(guildId, channelId) {
  const config = await getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  return config.activeTickets.find((t) => t.channelId === channelId) || null;
}

async function updateActiveTicket(guildId, channelId, updates) {
  const config = await getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  const index = config.activeTickets.findIndex((t) => t.channelId === channelId);
  if (index !== -1) {
    config.activeTickets[index] = { ...config.activeTickets[index], ...updates };
    await saveGuildConfig(guildId, config);
  }
}

async function removeActiveTicket(guildId, channelId) {
  const config = await getGuildConfig(guildId);
  config.activeTickets = config.activeTickets || [];
  config.activeTickets = config.activeTickets.filter((t) => t.channelId !== channelId);
  await saveGuildConfig(guildId, config);
}

async function incrementClaimCount(guildId, userId) {
  const config = await getGuildConfig(guildId);
  config.claimStats = config.claimStats || {};
  config.claimStats[userId] = (config.claimStats[userId] || 0) + 1;
  await saveGuildConfig(guildId, config);
}

async function getClaimStats(guildId) {
  const config = await getGuildConfig(guildId);
  return config.claimStats || {};
}

async function resetClaimStats(guildId, userId) {
  const config = await getGuildConfig(guildId);
  config.claimStats = config.claimStats || {};
  if (userId) {
    config.claimStats[userId] = 0;
  } else {
    config.claimStats = {};
  }
  await saveGuildConfig(guildId, config);
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
