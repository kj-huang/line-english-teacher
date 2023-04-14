const request = require('supertest');
const app = require('../app');

describe('GET /', () => {
  it('should return 200 OK', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toEqual('Live');
  })

  //should return 200 ok in /health route
  it('should return 200 OK in /health route', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.text).toEqual('OK');
  });
});
