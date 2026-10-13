import type { Rule } from 'antd/es/form';
import {
  LOGIN_FORBIDDEN_CHARACTER,
  LOGIN_FORBIDDEN_CHARACTER_MESSAGE,
} from 'shared';

// Shared by every form that sets a login, so the @ rule has one copy.
export const loginForbiddenCharacterRule: Rule = {
  validator: (_, value?: string) =>
    value?.includes(LOGIN_FORBIDDEN_CHARACTER)
      ? Promise.reject(new Error(LOGIN_FORBIDDEN_CHARACTER_MESSAGE))
      : Promise.resolve(),
};
