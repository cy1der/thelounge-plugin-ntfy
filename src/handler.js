"use strict";

const { loadUserConfig } = require("./config.js");

function createHandler(client, network) {
  return async (data) => {
    const highlightRegex = new RegExp(network.highlightRegex, "i");
    const message = data.message || "";

    if (highlightRegex.test(message)) {
      // Load config after each message to get latest settings
      const [userConfig, errors] = loadUserConfig(client.client.name);

      if (errors.length > 0) {
        return;
      }

      let ntfyAuth;

      if (userConfig.ntfy.token) {
        ntfyAuth = userConfig.ntfy.token;
      } else if (userConfig.ntfy.username && userConfig.ntfy.password) {
        ntfyAuth = {
          username: userConfig.ntfy.username,
          password: userConfig.ntfy.password,
        };
      }

      const { NtfyClient, MessagePriority } = await import("ntfy");

      const ntfyClient = new NtfyClient({
        server: userConfig.ntfy.server,
        topic: userConfig.ntfy.topic,
        priority: MessagePriority.HIGH,
        tags: ["speech_balloon"],
        authorization: ntfyAuth,
      });

      ntfyClient.publish({
        title: `${network.name} ${data.target}: ${data.nick}`,
        message: message,
      });
    }
  };
}

module.exports = {
  createHandler,
};
