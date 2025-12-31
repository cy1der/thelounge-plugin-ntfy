"use strict";

const { PluginLogger } = require("./src/logger.js");
const { createHandler } = require("./src/handler.js");
const {
  setRootDir,
  loadUserConfig,
  saveUserSetting,
} = require("./src/config.js");

// user -> Map<network.uuid -> handler and client>
const globalActiveListeners = new Map();

const ntfyCommand = {
  input: async (client, target, command, args) => {
    const say = (message) => {
      client.sendMessage(message, target.chan);
    };

    const helpMessage = () => {
      say(`${command} command help:`);
      say(`/${command} start - Start the ntfy listener for this network`);
      say(`/${command} stop - Stop the ntfy listener for this network`);
      say(
        `/${command} status - Show the ntfy listener status for this network`
      );
      say(`/${command} test - Send a test notification`);
      say(
        `/${command} config set <setting_key> <setting_value> - Set a configuration setting`
      );
      say(
        `/${command} config remove <setting_key> - Set configuration setting to null`
      );
      say(
        `/${command} config print - Print the current configuration with warnings if any`
      );
    };

    const subcommand = args;
    const network = target.network;

    if (subcommand.length === 0) {
      helpMessage();
      return;
    }

    if (typeof subcommand[0] !== "string") {
      helpMessage();
      return;
    }

    switch (subcommand[0].toLowerCase()) {
      case "start": {
        const [_, errors] = loadUserConfig(client.client.name);

        if (errors.length > 0) {
          say("Cannot start ntfy listener due to invalid configuration:");
          for (const error of errors) {
            say(`- ${error.instancePath} ${error.message}`);
          }
          return;
        }

        const userListeners = globalActiveListeners.get(client.client.name);

        if (
          userListeners &&
          typeof userListeners.has === "function" &&
          userListeners.has(network.uuid)
        ) {
          say("ntfy listener is already running for this network");
          return;
        }

        const handler = createHandler(client, network);
        network.irc.on("privmsg", handler);

        if (!userListeners) {
          const map = new Map();
          map.set(network.uuid, { handler: handler, client: client });
          globalActiveListeners.set(client.client.name, map);
        } else {
          userListeners.set(network.uuid, { handler: handler, client: client });
        }

        say("ntfy listener started for this network");

        break;
      }

      case "stop": {
        const userListeners = globalActiveListeners.get(client.client.name);

        if (
          !userListeners ||
          typeof userListeners.has !== "function" ||
          !userListeners.has(network.uuid)
        ) {
          say("ntfy listener is not running for this network");
          return;
        }

        const { handler } = userListeners.get(network.uuid);
        network.irc.removeListener("privmsg", handler);
        userListeners.delete(network.uuid);

        say("ntfy listener stopped for this network");

        break;
      }

      case "status": {
        const userListeners = globalActiveListeners.get(client.client.name);

        if (
          userListeners &&
          typeof userListeners.has === "function" &&
          userListeners.has(network.uuid)
        ) {
          say("ntfy listener is running for this network");
        } else {
          say("ntfy listener is not running for this network");
        }

        break;
      }

      case "test": {
        const { NtfyClient, MessagePriority } = await import("ntfy");

        const [userConfig, errors] = loadUserConfig(client.client.name);

        if (errors.length > 0) {
          say("Cannot test ntfy due to invalid configuration:");
          for (const error of errors) {
            say(`- ${error.instancePath} ${error.message}`);
          }
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

        const ntfyClient = new NtfyClient({
          server: userConfig.ntfy.server,
          topic: userConfig.ntfy.topic,
          priority: MessagePriority.HIGH,
          tags: ["speech_balloon"],
          authorization: ntfyAuth,
        });

        try {
          ntfyClient.publish({
            title: `${network.name} #afakechannel: ntfy`,
            message: `Hello, ${client.client.name}!`,
          });
          say(`Sent to ${userConfig.ntfy.server}/${userConfig.ntfy.topic}`);
        } catch (error) {
          say(`Failed to send test notification: ${error.message}`);
        }

        break;
      }

      case "config": {
        const subsubcommand = subcommand.slice(1);

        if (subsubcommand.length === 0) {
          helpMessage();
          return;
        }

        if (typeof subsubcommand[0] !== "string") {
          helpMessage();
          return;
        }

        switch (subsubcommand[0].toLowerCase()) {
          case "set": {
            const subsubargs = subsubcommand.slice(1);

            if (subsubargs.length < 2) {
              helpMessage();
              return;
            }

            const settingKey = subsubargs[0];
            const settingValue = subsubargs.slice(1).join(" ");
            const response = saveUserSetting(
              client.client.name,
              settingKey,
              settingValue
            );

            say(response);

            break;
          }

          case "remove": {
            const subsubargs = subsubcommand.slice(1);

            if (subsubargs.length < 1) {
              helpMessage();
              return;
            }

            const settingKey = subsubargs[0];
            const response = saveUserSetting(
              client.client.name,
              settingKey,
              null
            );

            say(response);

            break;
          }

          case "print": {
            const [userConfig, errors] = loadUserConfig(client.client.name);

            const printConfig = (obj, parentKey = "") => {
              for (const key in obj) {
                const value = obj[key];
                const fullKey = parentKey ? `${parentKey}.${key}` : key;

                if (typeof value === "object" && value !== null) {
                  printConfig(value, fullKey);
                } else {
                  say(`${fullKey}=${value}`);
                }
              }
            };

            printConfig(userConfig);

            if (errors.length > 0) {
              say("");

              for (const error of errors) {
                say(`Warning: ${error.instancePath} ${error.message}`);
              }
            }

            if (
              userConfig.ntfy.token &&
              userConfig.ntfy.username &&
              userConfig.ntfy.password
            ) {
              say(
                "Warning: Both ntfy.token and ntfy.username/password are set, ntfy.token will be used for authentication"
              );
            }

            break;
          }

          default: {
            helpMessage();
            break;
          }
        }

        break;
      }

      default: {
        helpMessage();
        break;
      }
    }
  },
  allowDisconnected: true,
};

module.exports = {
  onServerStart(tl) {
    PluginLogger.init(tl.Logger);

    const configDir = tl.Config.getPersistentStorageDir();
    setRootDir(configDir);
    PluginLogger.info(`[ntfy] Using config directory: ${configDir}`);

    tl.Commands.add("ntfy", ntfyCommand);
  },
};
