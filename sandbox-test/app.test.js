const request = require("supertest");
const app = require("./app");

describe("GET /ping", () => {
  it("responds with { pong: true }", async () => {
    const res = await request(app).get("/ping");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ pong: true });
  });
});

describe("GET /echo", () => {
  it("echoes the msg query parameter", async () => {
    const res = await request(app).get("/echo?msg=hello");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ echo: "hello" });
  });

  it("returns 400 when msg is missing", async () => {
    const res = await request(app).get("/echo");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "msg query parameter is required" });
  });
});
