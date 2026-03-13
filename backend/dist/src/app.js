import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { settingsRouter } from './routes/settings.js';
import { locationsRouter } from './routes/locations.js';
import { adminRouter } from './routes/admin/index.js';
import { contractorsRouter } from './routes/contractors.js';
import { submissionsRouter } from './routes/submissions.js';
import { reportsRouter } from './routes/reports.js';
import { dashboardRouter } from './routes/dashboard.js';
import { exchangeRatesRouter } from './routes/exchangeRates.js';
import { errorHandler } from './middleware/errorHandler.js';
export function createApp() {
    const app = express();
    app.use(cors({
        origin: true,
        credentials: true
    }));
    app.use(express.json({ limit: '5mb' }));
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.use('/api/auth', authRouter);
    app.use('/api/settings', settingsRouter);
    app.use('/api/locations', locationsRouter);
    app.use('/api/dashboard', dashboardRouter);
    app.use('/api/contractors', contractorsRouter);
    app.use('/api/submissions', submissionsRouter);
    app.use('/api/reports', reportsRouter);
    app.use('/api/exchange-rates', exchangeRatesRouter);
    // Admin
    app.use('/api/admin', adminRouter);
    app.use(errorHandler);
    return app;
}
