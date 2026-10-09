import "fastify";
import type { Buffer } from "node:buffer";

declare module "fastify" {
  interface FastifyRequest {
    rawBody: Buffer;
  }
}