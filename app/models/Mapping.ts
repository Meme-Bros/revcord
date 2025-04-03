import { Model, InferAttributes, InferCreationAttributes } from "sequelize";

export class MappingModel extends Model<
  InferAttributes<MappingModel>,
  InferCreationAttributes<MappingModel>
> {
  declare id: number;
  declare discordGuild: string;
  declare revoltServer: string;
  declare discordChannel: string;
  declare revoltChannel: string;
  declare discordChannelName: string;
  declare revoltChannelName: string;
  declare allowBots?: boolean;
}
