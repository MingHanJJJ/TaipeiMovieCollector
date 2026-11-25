// Loads the project's single .env file (at the repository root).
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(__dirname, "../../../.env"), quiet: true });
