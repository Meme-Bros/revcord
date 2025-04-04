import { Client as RevoltClient } from "revolt.js";
import { Client as DiscordClient } from "discord.js";

export default interface IBotEvent {
    DISCORD_EVENT: string | null;
    REVOLT_EVENT: string | null;

    revoltToDiscord(revolt: RevoltClient, discord: DiscordClient, eventParameterOne: any, eventParameterTwo: any, eventParameterThree: any): Promise<void>;
    discordToRevolt(revolt: RevoltClient, discord: DiscordClient, eventParameterOne: any, eventParameterTwo: any, eventParameterThree: any): Promise<void>;
}
