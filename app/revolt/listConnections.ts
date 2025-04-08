import { RevoltCommand } from "../interfaces";
import universalExecutor from "../universalExecutor";
import npmlog from "npmlog";
import { Message, TextEmbed } from "revolt.js";

export class ListConnectionsCommand implements RevoltCommand {
  data = {
    name: "connections",
    description: "Show existing connections",
  };

  async execute(
    message: Message,
    args: string,
    executor: universalExecutor
  ): Promise<void> {
    try {
      const connections = await executor.connections();

      let embedDescription = "";

      if (connections.length) {
        let desc = "";
        connections.forEach((connection) => {
          desc += `
\`\`\`
\#${connection.revolt} => ${connection.discord}
Bots allowed: ${connection.allowBots ? "yes" : "no"}
\`\`\`
`;
        });

        embedDescription = desc;
      } else {
        embedDescription = "No connections found.";
      }

      // TODO: Convert to TextEmbed object
      // Requires RevoltClient to be passed in
      let replyEmbed = {
        title: "Connected channels",
        colour: "#5765f2",
        icon_url: message.author.avatarURL,
        description: embedDescription,
      };


      await message.reply({
        content: " ",
        embeds: [replyEmbed],
      });
    } catch (e) {
      npmlog.error("Discord", "An error occurred while fetching connections");
      npmlog.error("Discord", e);

      await message.reply("An error happened. Check logs.");
    }
  }
}
