"use strict";

const { PluginLogger } = require("./src/logger.js");
const {
  setRootDir,
  loadUserConfig,
  saveUserSetting,
} = require("./src/config.js");

const ntfyCommand = {
  input: (client, target, _command, args) => {
    const say = (message) => {
      client.sendMessage(message, target.chan);
    };

    const subcommand = args;

    switch (subcommand[0]) {
      case "config": {
        const subsubcommand = subcommand.slice(1);

        switch (subsubcommand[0]) {
          case "set": {
            const subsubargs = subsubcommand.slice(1);

            if (subsubargs.length < 2) {
              say("Usage: ntfy config set <setting_key> <setting_value>");
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

            if (subsubargs.length < 2) {
              say("Usage: ntfy config remove <setting_key>");
              return;
            }

            const settingKey = subsubargs[0];
            const settingValue = null;
            const response = saveUserSetting(
              client.client.name,
              settingKey,
              settingValue
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

            break;
          }

          default: {
            say("Unknown ntfy config subcommand"); // TODO: help message
            break;
          }
        }

        break;
      }

      default: {
        say("Unknown ntfy subcommand"); // TODO: help message
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
