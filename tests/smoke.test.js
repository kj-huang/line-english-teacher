const request = require('supertest');
const app = require('../app');

describe('Smoke tests', () => {
  it('should success GET on /smoke route', async () => {
    let response = await request(app).get('/smoke-test');

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe('success');
  });

  it('should check POST on /webhook route', async () => {
    let response = await request(app).post('/webhook');

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe('success');
  })
})