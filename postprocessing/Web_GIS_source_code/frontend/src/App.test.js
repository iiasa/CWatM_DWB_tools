import { validateConfig } from './config/app.config';

test('default frontend configuration is valid', () => {
  expect(validateConfig()).toBe(true);
});
