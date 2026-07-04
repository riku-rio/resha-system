const prisma = require("../config/database");

const CHANNEL_TYPES = ["messageDelete", "messageEdit", "memberJoin", "memberLeave", "ticket"];

// Maps channel type string to Prisma field name
const CHANNEL_FIELD_MAP = {
  messageDelete: "channelMessageDelete",
  messageEdit:   "channelMessageEdit",
  memberJoin:    "channelMemberJoin",
  memberLeave:   "channelMemberLeave",
  ticket:        "channelTicket"
};

/**
 * Gets (or creates) the logging config for a guild.
 * Returns an object matching the old JSON shape.
 */
async function getGuildConfig(guildId) {
  const key = guildId || "global";
  let row = await prisma.guildLogConfig.findUnique({ where: { guildId: key } });

  if (!row) {
    row = await prisma.guildLogConfig.create({
      data: { guildId: key }
    });
  }

  return {
    enabled: row.enabled,
    autoCreate: row.autoCreate,
    channels: {
      messageDelete: row.channelMessageDelete || null,
      messageEdit:   row.channelMessageEdit   || null,
      memberJoin:    row.channelMemberJoin     || null,
      memberLeave:   row.channelMemberLeave    || null,
      ticket:        row.channelTicket         || null
    }
  };
}

/**
 * Saves the logging config for a guild.
 * Accepts the same shape as returned by getGuildConfig.
 */
async function saveGuildConfig(guildId, config) {
  const key = guildId || "global";
  const ch = config.channels || {};
  await prisma.guildLogConfig.upsert({
    where: { guildId: key },
    update: {
      enabled:             config.enabled    ?? false,
      autoCreate:          config.autoCreate ?? false,
      channelMessageDelete: ch.messageDelete ?? null,
      channelMessageEdit:   ch.messageEdit   ?? null,
      channelMemberJoin:    ch.memberJoin    ?? null,
      channelMemberLeave:   ch.memberLeave   ?? null,
      channelTicket:        ch.ticket        ?? null
    },
    create: {
      guildId: key,
      enabled:             config.enabled    ?? false,
      autoCreate:          config.autoCreate ?? false,
      channelMessageDelete: ch.messageDelete ?? null,
      channelMessageEdit:   ch.messageEdit   ?? null,
      channelMemberJoin:    ch.memberJoin    ?? null,
      channelMemberLeave:   ch.memberLeave   ?? null,
      channelTicket:        ch.ticket        ?? null
    }
  });
}

/**
 * Sets a specific log channel type.
 * @param {string} guildId
 * @param {string} type - one of: messageDelete, messageEdit, memberJoin, memberLeave, ticket
 * @param {string} channelId
 */
async function setLogChannel(guildId, type, channelId) {
  const key = guildId || "global";
  const field = CHANNEL_FIELD_MAP[type];
  if (!field) return;

  await prisma.guildLogConfig.upsert({
    where: { guildId: key },
    update: { [field]: channelId },
    create: { guildId: key, [field]: channelId }
  });
}

/**
 * Toggles the autoCreate flag.
 */
async function setAutoCreate(guildId, bool) {
  const key = guildId || "global";
  await prisma.guildLogConfig.upsert({
    where: { guildId: key },
    update: { autoCreate: bool },
    create: { guildId: key, autoCreate: bool }
  });
}

module.exports = {
  getGuildConfig,
  saveGuildConfig,
  setLogChannel,
  setAutoCreate
};
