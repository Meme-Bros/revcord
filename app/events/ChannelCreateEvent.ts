import {
    Client as RevoltClient,
    Channel as RevoltChannel,
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel as DiscordTextChannel,
    ChannelType as DiscordChannelType,
    CategoryCreateChannelOptions as DiscordCategoryCreateChannelOptions,
} from "discord.js";
import { AuditLogEvent as DiscordAuditLogEvent } from "discord-api-types/v10"
import {
    DataCreateChannel as RevoltDataCreateChannel
} from "revolt-api/esm/types";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { MappingModel } from "../models/Mapping";
import UniversalExecutor from "../universalExecutor";
import { transformRevoltChannelNameToDiscord } from "../revolt";
import { transformDiscordChannelNameToRevolt } from "../discord";
import { Main } from "../Main";


export default class ChannelCreateEvent implements IBotEvent
{
    public DISCORD_EVENT = 'channelCreate';
    public REVOLT_EVENT = 'channel/create';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, channel: RevoltChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {        
        if (channel.channel_type !== 'TextChannel') {
            npmlog.info('Revolt', `Revolt channel "${channel.name}" was created, but it's not a text channel. Ignoring`);

            return;
        }

        const universalExecutor = new UniversalExecutor(discord, revolt);
        const revoltServerId = channel.server_id;

        // Grab a random channel mapping item that already has this server linked
        const revoltServerMapping = await MappingModel.findOne({
            where: {
                revoltServer: revoltServerId
            }
        });

        if (! revoltServerMapping) {
            npmlog.error('Revolt', `Attempted to automatically create channel, but Revolt server ID "${revoltServerId}" is unknown. Have you mapped at least one channel before for this server?`);
                
            return;
        }

        const discordGuildId = revoltServerMapping.discordGuild;
        const discordGuild = await discord.guilds.fetch(discordGuildId);

        if (! discordGuild) {
            npmlog.error('Revolt', `We can't find Discord guild with ID "${discordGuildId}".`);

            return;
        }

        const discordChannelInformation: DiscordCategoryCreateChannelOptions = {
            type: DiscordChannelType.GuildText,
            name: transformRevoltChannelNameToDiscord(channel.name),
            topic: channel.description,
            nsfw: channel.nsfw
        };

        const existingDiscordChannel = discordGuild.channels.cache.find((channel) => channel.name === discordChannelInformation.name);

        if (existingDiscordChannel) {
            npmlog.warn('Revolt', `The Discord server already has a channel called "${discordChannelInformation.name}", so we won't create/map this channel automatically.`);

            return;
        }

        const discordChannel = await discordGuild.channels.create(discordChannelInformation);

        // Make sure the caches are up-to-date
        await discord.channels.fetch(discordChannel.id);
        await revolt.channels.fetch(channel._id);

        await universalExecutor.connect(discordChannel.id, channel._id);
        await Main.refreshMapping();

        npmlog.info('Revolt', `Automatically linked Discord channel "${discordChannel.id}" to Revolt channel "${channel._id}"`);

        await channel.sendMessage(`Discord channel "${discordChannel.name}" (${discordChannel.id}) has been linked to Revolt channel "${channel.name}" (${channel._id})`);
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, channel: DiscordTextChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {        
        if (channel.type !== DiscordChannelType.GuildText) {
            npmlog.info('Discord', `Discord channel "${channel.name}" was created, but it's not a text channel. Ignoring`);

            return;
        }

        const auditLogFetch = await channel.guild.fetchAuditLogs({limit: 1, type: DiscordAuditLogEvent.ChannelCreate });
        const firstAuditLog = auditLogFetch.entries.first();
        if (! firstAuditLog) {
            npmlog.error('Discord', `We couldn't get the audit log of Discord channel ID "${channel.id}". Are we missing audit permissions?`);

            return;
        }

        if (firstAuditLog.executor.id === discord.user.id) {
            npmlog.warn('Discord', `We won't create Revolt channel "${channel.name}", as the Discord ChannelCreate event was created by us.`);

            return;
        }

        const universalExecutor = new UniversalExecutor(discord, revolt);
        const discordGuildId = channel.guildId;

        // Grab a random channel mapping item that already has this guild linked
        const discordGuildMapping = await MappingModel.findOne({
            where: {
                discordGuild: discordGuildId
            }
        });

        if (! discordGuildMapping) {
            npmlog.error('Discord', `Attempted to automatically create channel, but Discord guild ID "${discordGuildId}" is unknown. Have you mapped at least one channel before for this guild?`);
        
            return;
        }

        const revoltServerId = discordGuildMapping.revoltServer;
        const revoltServer = revolt.servers.get(revoltServerId);

        if (! revoltServer) {
            npmlog.error('Discord', `We can't find Revolt server with ID "${revoltServerId}".`);

            return;
        }

        const revoltChannelInformation: RevoltDataCreateChannel = {
            type: 'Text',
            name: transformDiscordChannelNameToRevolt(channel.name),
            description: channel.topic,
            nsfw: channel.nsfw
        }

        const existingRevoltChannel = revoltServer.channels.find((channel) => channel.name === revoltChannelInformation.name);

        if (existingRevoltChannel) {
            npmlog.warn('Discord', `The Revolt server already has a channel called "${revoltChannelInformation.name}", so we won't create/map this channel automatically.`);
        
            return;
        }

        const revoltChannel = await revoltServer.createChannel(revoltChannelInformation);

        // Make sure the caches are up-to-date
        await discord.channels.fetch(channel.id);
        await revolt.channels.fetch(revoltChannel._id);

        await universalExecutor.connect(channel.id, revoltChannel._id);
        await Main.refreshMapping();

        npmlog.info('Discord', `Automatically linked Discord channel "${channel.id}" to Revolt channel "${revoltChannel._id}"`);

        await channel.send(`Discord channel "${channel.name}" (${channel.id}) has been linked to Revolt channel "${revoltChannelInformation.name}" (${revoltChannel._id})`);
    }
}
