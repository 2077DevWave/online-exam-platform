"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("./database");
const app_1 = require("./app");
const env_1 = require("./config/env");
const app = (0, app_1.createApp)();
async function start() {
    await (0, database_1.getDb)();
    console.log('Database ready.');
    app.listen(env_1.env.port, () => {
        console.log(`Server running on http://localhost:${env_1.env.port}`);
    });
}
start().catch(console.error);
