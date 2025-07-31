import type z from "zod";
import type { configSchema } from "./schemas";

export type Config = z.infer<typeof configSchema>;
