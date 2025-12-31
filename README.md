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

## License

This plugin is licensed under [MIT](https://opensource.org/license/mit)
