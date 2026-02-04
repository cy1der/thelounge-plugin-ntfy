"use strict";

const {
  loadUserConfig,
  getNetworkSetting,
  ServerConfig,
} = require("./config.js");
const { PluginLogger } = require("./logger.js");

function stripIrcFormatting(message) {
  return message.replace(
    /[\x02\x0F\x16\x1D\x1F]|(?:\x03(?:\d{1,2}(?:,\d{1,2})?)?)/g,
    "",
  );
}

function createHandler(client, network) {
  return async (data) => {
    // Ignore own messages
    if (network.nick === data.nick) {
      return;
    }

    const isPM = data.target === network.nick;

    const channel = isPM
      ? network.channels.find((chan) => chan.name === data.nick)
      : network.channels.find(
          (chan) => chan.name.toLowerCase() === data.target.toLowerCase(),
        );

    if (channel && channel.muted) {
      // Ignore messages in muted channels
      return;
    }

    let channelUrl = null;

    try {
      channelUrl = ServerConfig.get().baseUrl
        ? new URL(`/#/chan-${channel.id}`, ServerConfig.get().baseUrl)
        : null;
    } catch (error) {
      PluginLogger.error(
        `Failed to construct channel URL for notification: ${error.message}`,
      );
      PluginLogger.debug(
        `Payload: ${JSON.stringify({ ...data, message: "[REDACTED]" })}`,
      );
      PluginLogger.debug(
        `Channels: ${JSON.stringify(network.channels.map(({ messages, ...rest }) => rest))}`,
      );
    }

    const highlightRegex = new RegExp(network.highlightRegex, "i");
    const message = data.message || "";

    const mentioned = highlightRegex.test(message);

    let notify = false;
    let userConfig;

    if (mentioned && !isPM) {
      // Mentions always notify in channels
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

        const { NtfyClient } = await import("ntfy");

        const ntfyClient = new NtfyClient({
          server: userConfig.ntfy.server,
          topic: userConfig.ntfy.topic,
          priority: userConfig.ntfy.priority,
          tags: ["speech_balloon"],
          authorization: ntfyAuth,
        });

        await ntfyClient.publish({
          title: isPM
            ? `${network.name}: ${data.nick}`
            : `${network.name} ${data.target}: ${data.nick}`,
          message: stripIrcFormatting(message),
          clickURL: channelUrl ? channelUrl.toString() : undefined,
          actions: channelUrl
            ? [
                {
                  label: "Open",
                  type: "view",
                  url: channelUrl.toString(),
                },
              ]
            : undefined,
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
