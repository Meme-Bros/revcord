import {
    Client as RevoltClient,
    Channel as RevoltChannel,
    API
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel as DiscordTextChannel,
    ChannelType as DiscordChannelType,
    GuildChannelCreateOptions as DiscordGuildChannelCreateOptions,
} from "discord.js";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { MappingModel } from "../models/Mapping";
import UniversalExecutor from "../universalExecutor";
import { transformRevoltChannelNameToDiscord } from "../revolt";
import { transformDiscordChannelNameToRevolt } from "../discord";
import { Main } from "../Main";

export default class ChannelCreateEvent implements IBotEvent {
    public DISCORD_EVENT = 'channelCreate';
    public REVOLT_EVENT = 'channel/create';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, channel: RevoltChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {
        if (channel.type !== 'TextChannel' || !('server' in channel)) {
            // We only care about text channels in servers, ignore
            return;
        }

        const target = Main.mappings.find(
            (mapping) => mapping.revolt === channel.id
        );

        if (!target) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        const discordChannel = await discord.channels.fetch(target.discord);

        if (!discordChannel) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        if (!(discordChannel instanceof DiscordTextChannel)) {
            // We only care about text channels, ignore
            return;
        }

        const options: DiscordGuildChannelCreateOptions = {
            name: transformRevoltChannelNameToDiscord(channel.name),
            type: DiscordChannelType.GuildText,
            nsfw: false, // Default to false since nsfw is not available in v7
            topic: undefined, // Default to undefined since description is not available in v7
            parent: discordChannel.parentId || undefined,
        };

        try {
            const createdChannel = await discordChannel.guild.channels.create(options);

            // Save mapping
            const mapping = await MappingModel.create({
                discordGuild: createdChannel.guildId,
                discordChannel: createdChannel.id,
                revoltServer: String(channel.server),
                revoltChannel: channel.id,
                discordChannelName: createdChannel.name,
                revoltChannelName: channel.name
            });

            Main.mappings.push({
                discord: createdChannel.id,
                revolt: channel.id,
            });

            // Initialize webhook
            await UniversalExecutor.initializeWebhook(createdChannel, channel.id);
        } catch (e) {
            npmlog.error("Discord", "Failed to create channel");
            npmlog.error("Discord", e);
        }
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, channel: DiscordTextChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {
        const target = Main.mappings.find(
            (mapping) => mapping.discord === channel.id
        );

        if (!target) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        const revoltChannel = revolt.channels.get(target.revolt);

        if (!revoltChannel || !('server' in revoltChannel)) {
            // We don't have this channel mapped to anything, ignore
            return;
        }

        const data: API.DataCreateServerChannel = {
            type: "Text" as const,
            name: transformDiscordChannelNameToRevolt(channel.name),
            description: channel.topic || undefined,
            nsfw: channel.nsfw || false,
        };

        try {
            const revoltServer = revolt.servers.get(String(revoltChannel.server));
            if (!revoltServer) {
                throw new Error(`Server ${String(revoltChannel.server)} not found`);
            }

            const createdChannel = await revoltServer.createChannel(data);
            const channelData = { _id: createdChannel.id, name: createdChannel.name };

            // Save mapping
            const mapping = await MappingModel.create({
                discordGuild: channel.guildId,
                discordChannel: channel.id,
                revoltServer: String(revoltChannel.server),
                revoltChannel: channelData._id,
                discordChannelName: channel.name,
                revoltChannelName: channelData.name
            });

            Main.mappings.push({
                discord: channel.id,
                revolt: channelData._id,
            });
        } catch (e) {
            npmlog.error("Revolt", "Failed to create channel");
            npmlog.error("Revolt", e);
        }
    }
}
