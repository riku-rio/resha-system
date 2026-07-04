const { Events } = require("discord.js");
const path = require("path");

module.exports = {
  name: Events.ClientReady,
  execute(client) {
    console.log(`Bot is ready as ${client.user.tag}`);
    try {
      const ticketpanel = require("../commands/ticketpanel");
      if (ticketpanel && typeof ticketpanel.init === "function") {
        ticketpanel.init(client);
        console.log("Ticket auto-close checker initialized successfully.");
      }
    } catch (error) {
      console.error("Failed to initialize ticket auto-close checker:", error);
    }
  },
};
