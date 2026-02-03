"use strict";

const { PluginLogger } = require("./src/logger.js");
const { createHandler } = require("./src/handler.js");
const {
  setRootDir,
  loadUserConfig,
  saveUserSetting,
  saveNetworkSetting,
  ServerConfig,
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
      say(
        `/${command} start [all] - Start the ntfy listener for this network or all networks if 'all' is specified`,
      );
      say(
        `/${command} stop [all] - Stop the ntfy listener for this network or all networks if 'all' is specified`,
      );
      say(
        `/${command} status [all] - Show the ntfy listener status for this network or all networks if 'all' is specified`,
      );
      say(`/${command} test - Send a test notification`);
      say(
        `/${command} config set <setting_key> <setting_value> - Set a global configuration setting`,
      );
      say(
        `/${command} config remove <setting_key> - Set global configuration setting to null`,
      );
      say(
        `/${command} config network set <setting_key> <setting_value> - Set a per-network setting for this network`,
      );
      say(
        `/${command} config network remove <setting_key> - Remove per-network setting for this network`,
      );
      say(
        `/${command} config print - Print the current configuration with warnings if any`,
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
        let all = false;
        const [_, errors] = loadUserConfig(client.client.name);
        const subsubcommand = subcommand.slice(1);

        if (
          typeof subsubcommand[0] === "string" &&
          subsubcommand.length > 0 &&
          subsubcommand[0].toLowerCase() === "all"
        ) {
          all = true;
        }

        if (errors.length > 0) {
          say(
            `Cannot start ntfy listener${all ? "s" : ""} due to invalid configuration:`,
          );

          for (const error of errors) {
            say(`- ${error.instancePath} ${error.message}`);
          }

          return;
        }

        let userListeners = globalActiveListeners.get(client.client.name);

        if (!userListeners) {
          userListeners = new Map();
          globalActiveListeners.set(client.client.name, userListeners);
        }

        if (all) {
          const networks = client.client.networks;
          let started = 0;
          let skipped = 0;

          for (const net of networks) {
            if (userListeners.has(net.uuid)) {
              skipped++;
              continue;
            }

            const handler = createHandler(client, net);
            net.irc.on("privmsg", handler);

            userListeners.set(net.uuid, { handler: handler, client: client });

            started++;
          }

          if (started === 0 && skipped === 0) {
            say("No networks available to start ntfy listeners");
            return;
          }
          if (started > 0) {
            say(
              `Started ntfy listener${started !== 1 ? "s" : ""} for ${started} network${started !== 1 ? "s" : ""}`,
            );
          }
          if (skipped > 0) {
            say(
              `Skipped ${skipped} network${skipped !== 1 ? "s" : ""} because ntfy listener is already running`,
            );
          }
        } else {
          if (userListeners.has(network.uuid)) {
            say("ntfy listener is already running for this network");
            return;
          }

          const handler = createHandler(client, network);
          network.irc.on("privmsg", handler);

          userListeners.set(network.uuid, { handler: handler, client: client });

          say("ntfy listener started for this network");
        }

        break;
      }

      case "stop": {
        let all = false;
        const subsubcommand = subcommand.slice(1);

        if (
          typeof subsubcommand[0] === "string" &&
          subsubcommand.length > 0 &&
          subsubcommand[0].toLowerCase() === "all"
        ) {
          all = true;
        }

        let userListeners = globalActiveListeners.get(client.client.name);

        if (!userListeners) {
          userListeners = new Map();
          globalActiveListeners.set(client.client.name, userListeners);
        }

        if (all) {
          const networks = client.client.networks;
          let stopped = 0;
          let skipped = 0;

          for (const net of networks) {
            if (!userListeners.has(net.uuid)) {
              skipped++;
              continue;
            }

            const { handler } = userListeners.get(net.uuid);
            net.irc.removeListener("privmsg", handler);

            userListeners.delete(net.uuid);

            stopped++;
          }

          if (stopped === 0 && skipped === 0) {
            say("No networks available to stop ntfy listeners");
            return;
          }
          if (stopped > 0) {
            say(
              `Stopped ntfy listener${stopped !== 1 ? "s" : ""} for ${stopped} network${stopped !== 1 ? "s" : ""}`,
            );
          }
          if (skipped > 0) {
            say(
              `Skipped ${skipped} network${skipped !== 1 ? "s" : ""} because ntfy listener was not running`,
            );
          }
        } else {
          if (!userListeners.has(network.uuid)) {
            say("ntfy listener is not running for this network");
            return;
          }

          const { handler } = userListeners.get(network.uuid);
          network.irc.removeListener("privmsg", handler);

          userListeners.delete(network.uuid);

          say("ntfy listener stopped for this network");
        }

        break;
      }

      case "status": {
        let all = false;
        const subsubcommand = subcommand.slice(1);

        if (
          typeof subsubcommand[0] === "string" &&
          subsubcommand.length > 0 &&
          subsubcommand[0].toLowerCase() === "all"
        ) {
          all = true;
        }

        let userListeners = globalActiveListeners.get(client.client.name);

        if (!userListeners) {
          userListeners = new Map();
          globalActiveListeners.set(client.client.name, userListeners);
        }

        if (all) {
          const networks = client.client.networks;
          for (const net of networks) {
            if (userListeners.has(net.uuid)) {
              say(`${net.name}: running`);
            } else {
              say(`${net.name}: not running`);
            }
          }
        } else {
          if (userListeners.has(network.uuid)) {
            say("ntfy listener is running for this network");
          } else {
            say("ntfy listener is not running for this network");
          }
        }

        break;
      }

      case "test": {
        try {
          const { NtfyClient } = await import("ntfy");

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

          const ntfyClient = new NtfyClient({
            server: userConfig.ntfy.server,
            topic: userConfig.ntfy.topic,
            priority: userConfig.ntfy.priority,
            tags: ["speech_balloon"],
            authorization: ntfyAuth,
          });

          await ntfyClient.publish({
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
              settingValue,
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
              null,
            );

            say(response);

            break;
          }

          case "print": {
            const [userConfig, errors] = loadUserConfig(client.client.name);

            const sensitiveKeys = new Set(["ntfy.password", "ntfy.token"]);
            const perNetworkKeys = new Set([
              "config.notify_on_private_messages",
            ]);

            const printConfig = (obj, parentKey = "") => {
              for (const key in obj) {
                const value = obj[key];
                const fullKey = parentKey ? `${parentKey}.${key}` : key;

                if (perNetworkKeys.has(fullKey)) {
                  // Special handling for per-network settings
                  if (typeof value === "object" && value !== null) {
                    const networkValue = value[network.uuid];
                    say(
                      `${fullKey}=${networkValue !== undefined ? networkValue : "(not set for this network)"}`,
                    );
                  } else {
                    say(`${fullKey}=(not set for this network)`);
                  }
                } else if (typeof value === "object" && value !== null) {
                  printConfig(value, fullKey);
                } else if (sensitiveKeys.has(fullKey) && value) {
                  say(`${fullKey}=********`);
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
                "Warning: Both ntfy.token and ntfy.username/password are set, ntfy.token will be used for authentication",
              );
            }

            break;
          }

          case "network": {
            const networkArgs = subsubcommand.slice(1);

            if (networkArgs.length === 0) {
              helpMessage();
              return;
            }

            if (typeof networkArgs[0] !== "string") {
              helpMessage();
              return;
            }

            switch (networkArgs[0].toLowerCase()) {
              case "set": {
                const setArgs = networkArgs.slice(1);

                if (setArgs.length < 2) {
                  helpMessage();
                  return;
                }

                const settingKey = setArgs[0];
                const settingValue = setArgs.slice(1).join(" ");
                const response = saveNetworkSetting(
                  client.client.name,
                  settingKey,
                  network.uuid,
                  settingValue,
                );

                say(response);

                break;
              }

              case "remove": {
                const removeArgs = networkArgs.slice(1);

                if (removeArgs.length < 1) {
                  helpMessage();
                  return;
                }

                const settingKey = removeArgs[0];
                const response = saveNetworkSetting(
                  client.client.name,
                  settingKey,
                  network.uuid,
                  null,
                );

                say(response);

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

    ServerConfig.init(tl.Config.getConfig());

    const configDir = tl.Config.getPersistentStorageDir();
    setRootDir(configDir);
    PluginLogger.info(`[ntfy] Using config directory: ${configDir}`);

    tl.Commands.add("ntfy", ntfyCommand);
  },
};
