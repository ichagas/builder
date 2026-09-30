/**
 * WebSocket auth: AUTH_MODE=local accepts only signed dev-login tokens; the
 * former unverified-decode dev branch (NODE_ENV=development / SKIP_AUTH) is gone.
 */
import http from "http";
import { AddressInfo } from "net";
import WebSocket from "ws";
import jwt from "jsonwebtoken";

jest.mock("../utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../utils/database", () => ({ __esModule: true, default: { query: jest.fn() } }));

const SECRET = "f".repeat(64);
const savedEnv = { ...process.env };

async function connect(token: string | undefined, env: Record<string, string> = {}): Promise<{ userId?: string }> {
  delete process.env.ENTRA_TENANT_ID;
  delete process.env.ENTRA_CLIENT_ID;
  Object.assign(process.env, { AUTH_MODE: "local", JWT_SECRET: SECRET, NODE_ENV: "development" }, env);
  let wss!: import("ws").WebSocketServer;
  const server = http.createServer();
  jest.isolateModules(() => {
    wss = require("../websocket").initWebSocket(server);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  try {
    return await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${token ? `?token=${encodeURIComponent(token)}` : ""}`);
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.event === "connected") {
          ws.close();
          resolve({ userId: msg.payload.userId });
        }
      });
      ws.on("error", reject);
    });
  } finally {
    wss.clients.forEach((c) => c.terminate());
    await new Promise<void>((r) => wss.close(() => r()));
    await new Promise<void>((r) => server.close(() => r()));
  }
}

afterEach(() => {
  process.env = { ...savedEnv };
});

describe("WebSocket auth (AUTH_MODE=local)", () => {
  it("identifies a valid dev-login token", async () => {
    const token = jwt.sign({ sub: "u1", email: "a@b.co" }, SECRET, { algorithm: "HS256", issuer: "pronghorn-local-dev", expiresIn: "1h" });
    expect((await connect(token)).userId).toBe("u1");
  });

  it("treats an invalid signature as anonymous", async () => {
    const token = jwt.sign({ sub: "u1" }, "0".repeat(64), { algorithm: "HS256", issuer: "pronghorn-local-dev" });
    expect((await connect(token)).userId).toBeUndefined();
  });

  it("treats an expired token as anonymous", async () => {
    const token = jwt.sign({ sub: "u1" }, SECRET, { algorithm: "HS256", issuer: "pronghorn-local-dev", expiresIn: -60 });
    expect((await connect(token)).userId).toBeUndefined();
  });

  it("never trusts an unsigned token, even with NODE_ENV=development and SKIP_AUTH=true", async () => {
    const unsigned = jwt.sign({ sub: "attacker" }, "", { algorithm: "none" as jwt.Algorithm });
    expect((await connect(unsigned, { SKIP_AUTH: "true" })).userId).toBeUndefined();
  });
});

describe("WebSocket auth (Entra mode)", () => {
  it("no longer decodes unverified tokens in development or with SKIP_AUTH", async () => {
    const forged = jwt.sign({ sub: "attacker" }, "whatever");
    const res = await connect(forged, {
      AUTH_MODE: "entra",
      ENTRA_TENANT_ID: "t",
      ENTRA_CLIENT_ID: "c",
      SKIP_AUTH: "true",
    });
    expect(res.userId).toBeUndefined();
  });
});
