import { Webhook } from "discord.js";
import dotenv from "dotenv";
import npmlog from "npmlog";
import { DataTypes, Sequelize } from "sequelize";

import { Bot } from "./Bot";
import { CachedMessage, Mapping } from "./interfaces";
import { MappingModel } from "./models/Mapping";
import { BridgedEvents } from "./bridgedEvents";

export class Main {
  static mappings: Mapping[];
  static webhooks: Webhook[];

  /** Cache of messages sent by the bot from Discord to Revolt */
  static discordCache: CachedMessage[];

  /** Cache of messages sent by the bot from Revolt to Discord */
  static revoltCache: CachedMessage[];

  /** List of recent bridged events that can be used to prevent handling
   *  events multiple times that are hard to figure out the event author of */
  static recentBridgedEvents: BridgedEvents;

  private bot: Bot;

  constructor() {
    dotenv.config();

    const discordToken = process.env.DISCORD_TOKEN;
    const revoltToken = process.env.REVOLT_TOKEN;

    if (!discordToken || !revoltToken) {
      throw "At least one token was not provided";
    }

    Main.webhooks = [];

    Main.discordCache = [];
    Main.revoltCache = [];

    Main.recentBridgedEvents = new BridgedEvents();
  }

  /**
   * Initialize Sequelize
   */
  async initDb(): Promise<void> {
    const sequelize = new Sequelize({
      dialect: "sqlite",
      storage: "revcord.sqlite",
      logging: false,
    });

    await sequelize.authenticate();
    npmlog.info("db", "Connection has been established successfully.");

    // Initialize the Mapping model
    // TODO move to a different file/method
    MappingModel.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        revoltServer: {
          type: DataTypes.STRING,
        },
        discordGuild: {
          type: DataTypes.STRING,
        },
        discordChannel: {
          type: DataTypes.STRING,
        },
        revoltChannel: {
          type: DataTypes.STRING,
        },
        discordChannelName: {
          type: DataTypes.STRING,
        },
        revoltChannelName: {
          type: DataTypes.STRING,
        },
        allowBots: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
      },
      { sequelize, modelName: "mapping" }
    );

    // Sync
    await sequelize.sync({ alter: true });
  }

  public static async refreshMapping(): Promise<Mapping[]> {
    const mappingsInDb = await MappingModel.findAll({});
    const mappings = mappingsInDb.map((mapping) => ({
      discord: mapping.discordChannel,
      revolt: mapping.revoltChannel,
      allowBots: mapping.allowBots,
    }));

    Main.mappings = mappings;

    return mappings;
  }

  /**
   * Start the Web server, Discord and Revolt bots
   */
  public async start(): Promise<void> {
    try {
      await this.initDb();
      await Main.refreshMapping();
    } catch (e) {
      npmlog.error(
        "db",
        "A database error occurred. If you don't know what to do, try removing the `revcord.sqlite` file (will reset all your settings)."
      );
      npmlog.error("db", e);
    }

    this.bot = new Bot();
    this.bot.start();
  }
}
