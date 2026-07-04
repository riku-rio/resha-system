const { Events } = require("discord.js");
const logService = require("../services/logService");

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    await logService.logMessageUpdate(oldMessage, newMessage);
  }
};
