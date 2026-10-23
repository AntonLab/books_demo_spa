import type { Rule } from 'antd/es/form';

// One wording for every "too long" field message.
export const maxLengthRule = (label: string, max: number): Rule => ({
  max,
  message: `${label} must be at most ${max} characters`,
});
