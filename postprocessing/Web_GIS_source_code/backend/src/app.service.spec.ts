import { AppService } from './app.service';

describe('AppService', () => {
  it('returns the backend status message', () => {
    const service = new AppService();

    expect(service.getHello()).toBe('Hello World! DWB Backend is running!');
  });
});
