# The Lounge ntfy Plugin

A plugin for [The Lounge](https://thelounge.chat/) that sends a message to an [ntfy](https://ntfy.sh/) server whenever you are mentioned in a chat.

## Installation

Via the `thelounge` command line:

```bash
thelounge install thelounge-plugin-ntfy
```

Restart The Lounge after installation

## Usage

This plugin introduces the `/ntfy` command, subcommands are:

- `/ntfy start`: Start the ntfy listener for the network
- `/ntfy stop`: Stop the ntfy listener for the network
- `/ntfy status`: Show the ntfy listener status for this network
- `/ntfy test`: Send a test notification
- `/ntfy config`: Config commands
  - `/ntfy config set <setting_key> <setting_value>`: Set a configuration setting
  - `/ntfy config remove <setting_key>`: Set a configuration setting to null
  - `/ntfy config print`: Print the current configuration with warnings if any

## Setup

This plugin will **not** work out of the box, by default the plugin sends notifications to the official `ntfy.sh` server but no topic is set. To set a topic, enter this command:

```
/ntfy config set ntfy.topic <topic>
```

You may also set your account credentials or token as well if needed, see the config print command for all the possible settings.

To start/stop sending push notifications in the desired network, enter:

```
/ntfy start/stop
```

## Private Messages

By default, you will only be notified when you are mentioned, **this includes messages sent privately to you**. If you want to be notified of all private messages, enter this command and start the notifier like usual:

```
/ntfy config set config.notify_on_private_messages true
```

## License

This plugin is licensed under [MIT](https://opensource.org/license/mit)
