import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "../src/handler.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return await handleRequest(req, res);
}

