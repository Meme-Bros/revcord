import {
    Client as RevoltClient,
    Channel as RevoltChannel,
} from "revolt.js";
import {
    Client as DiscordClient,
    TextChannel as DiscordTextChannel,
    ChannelType as DiscordChannelType,
} from "discord.js";
import npmlog from "npmlog";
import type IBotEvent from "./IBotEvent";
import { MappingModel } from "../models/Mapping";
import { Main } from "../Main";


export default class ChannelDeleteEvent implements IBotEvent
{
    public DISCORD_EVENT = 'channelDelete';
    public REVOLT_EVENT = 'channel/delete';

    public async revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, channelId: string, channel: RevoltChannel|null, eventParameterThree: undefined): Promise<void> {        
        const revoltServerMapping = await MappingModel.findOne({
            where: {
              revoltChannel: channelId
            }
        });

        if (! revoltServerMapping) {
            npmlog.info('Revolt', `Attempted to automatically unlink deleted channel, but Revolt channel ID "${channelId}" is unknown, so it's probably not connected to anything.`);

            return;
        }

        await MappingModel.destroy({
            where: {
                revoltChannel: channelId
            }
        });

        await Main.refreshMapping();

        npmlog.info('Revolt', `Automatically disconnected Discord channel "${revoltServerMapping.discordChannel}" from Revolt channel "${channelId}"`);
    }

    public async discordToRevolt(revolt: RevoltClient, discord: DiscordClient, channel: DiscordTextChannel, eventParameterTwo: undefined, eventParameterThree: undefined): Promise<void> {        
        if (channel.type !== DiscordChannelType.GuildText) {
            npmlog.info('Discord', `Discord channel "${channel.name}" was deleted, but it's not a text channel. Ignoring`);

            return;
        }

        const channelId = channel.id;

        const discordGuildMapping = await MappingModel.findOne({
            where: {
              discordChannel: channelId
            }
        });

        if (! discordGuildMapping) {
            npmlog.info('Discord', `Attempted to automatically unlink deleted channel, but Discord channel ID "${channelId}" is unknown, so it's probably not connected to anything.`);

            return;
        }

        await MappingModel.destroy({
            where: {
                discordChannel: channelId
            }
        });

        await Main.refreshMapping();

        npmlog.info('Discord', `Automatically disconnected Discord channel "${channel.id}" from Revolt channel "${discordGuildMapping.revoltChannel}"`);
    }
}
