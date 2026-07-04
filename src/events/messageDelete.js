const { Events } = require("discord.js");
const logService = require("../services/logService");

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    await logService.logMessageDelete(message);
  }
};
