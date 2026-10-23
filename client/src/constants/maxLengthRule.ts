import type { Rule } from 'antd/es/form';

// One wording for every "too long" field message, so the form tests and the UI agree.
export const maxLengthRule = (label: string, max: number): Rule => ({
  max,
  message: `${label} must be at most ${max} characters`,
});
