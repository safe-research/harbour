import type z from "zod";
import type { configSchema } from "./schemas.js";

export type Config = z.infer<typeof configSchema>;
