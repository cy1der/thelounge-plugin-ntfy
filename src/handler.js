"use strict";

const { loadUserConfig, getNetworkSetting } = require("./config.js");
const { PluginLogger } = require("./logger.js");

function createHandler(client, network) {
  return async (data) => {
    // Ignore own messages
    if (network.nick === data.nick) {
      return;
    }

    const highlightRegex = new RegExp(network.highlightRegex, "i");
    const message = data.message || "";

    const mentioned = highlightRegex.test(message);
    const isPM = data.target === network.nick;

    let notify = false;
    let userConfig;

    if (mentioned) {
      // Mentions always notify
      notify = true;
    } else if (isPM) {
      // PMs notify only if enabled in config for this network
      const [uc, errors] = loadUserConfig(client.client.name);

      if (errors.length > 0) {
        return;
      }

      userConfig = uc;

      const notifyOnPMs = getNetworkSetting(
        userConfig,
        "config.notify_on_private_messages",
        network.uuid,
        false,
      );

      if (notifyOnPMs) {
        notify = true;
      }
    }

    if (notify) {
      try {
        // Avoid needlessly loading user config multiple times
        if (!userConfig) {
          const [uc, errors] = loadUserConfig(client.client.name);

          if (errors.length > 0) {
            return;
          }

          userConfig = uc;
        }

        let ntfyAuth;

        if (userConfig.ntfy.token) {
          ntfyAuth = {
            username: "",
            password: userConfig.ntfy.token,
          };
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
          title: isPM
            ? `${network.name}: ${data.nick}`
            : `${network.name} ${data.target}: ${data.nick}`,
          message: message,
        });
      } catch (e) {
        PluginLogger.error("Failed to send ntfy notification", e);
      }
    }
  };
}

module.exports = {
  createHandler,
};
