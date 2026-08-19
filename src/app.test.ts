import request from "supertest";
import app from "./app";

describe("GET /healthz", () => {
  it("responde 200 OK", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
  });
});
