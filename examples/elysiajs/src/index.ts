import { loadConfig } from "./lib/config";
import { createApp } from "./app";

const config = loadConfig();
const app = createApp(config);

app.listen(config.port);

console.log(`ElysiaJS e-catalog example running at http://localhost:${config.port}`);
console.log(`Payment mode: ${config.paymentMode}`);
