import dotenv from 'dotenv';
dotenv.config();

import { createApp } from '../lib/app.js';

const PORT = process.env.PORT || 4000;

const app = await createApp();
app.listen(PORT, () => {
  console.log(`Resolve listening on http://localhost:${PORT}`);
});
