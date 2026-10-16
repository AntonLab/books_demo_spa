import type { Sequelize } from 'sequelize';

// A Model carries no instance until initModels binds it; a repository used
// before that fails loudly rather than on a later undefined access.
export function sequelizeOf(model: {
  name: string;
  sequelize?: Sequelize;
}): Sequelize {
  if (!model.sequelize) {
    throw new Error(`${model.name} model is not initialised`);
  }
  return model.sequelize;
}
