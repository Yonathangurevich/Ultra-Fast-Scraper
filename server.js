const express = require('express');
const { fastScrape, initBrowser } = require('./scraper');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Initialize browser pool on startup
let browserPool = null;

async function startup() {
    console.log('🚀 Initializing browser pool...');
    browserPool = await initBrowser();
    console.log('✅ Browser pool ready');
}

// Main endpoint
app.post('/v1', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { url, session, useProxy = true } = req.body;
        
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required'
            });
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📨 New Request at ${new Date().toISOString()}`);
        console.log(`🔗 URL: ${url}`);
        console.log(`${'='.repeat(60)}\n`);
        
        const result = await fastScrape(url, {
            browser: browserPool,
            useProxy,
            session
        });
        
        if (result.success) {
            const elapsed = Date.now() - startTime;
            
            console.log(`✅ SUCCESS - Time: ${elapsed}ms`);
            console.log(`🔗 Final URL: ${result.url}`);
            console.log(`🎯 Has ssd: ${result.hasSSd ? 'YES ✅' : 'NO ❌'}`);
            
            res.json({
                status: 'ok',
                message: 'Success',
                solution: {
                    url: result.url,
                    status: 200,
                    response: result.html,
                    cookies: result.cookies || []
                },
                startTimestamp: startTime,
                endTimestamp: Date.now(),
                version: '3.0.0',
                hasSSd: result.hasSSd
            });
        } else {
            throw new Error(result.error || 'Scraping failed');
        }
        
    } catch (error) {
        console.error('❌ REQUEST FAILED:', error.message);
        
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: Math.round(process.uptime()) + 's',
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
        }
    });
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`
╔═══════════════════════════════════════╗
║   ⚡ Playwright Fast Scraper v3.0      ║
║   Port: ${PORT}                           ║
╚═══════════════════════════════════════╝
    `);
    
    await startup();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📛 SIGTERM received, closing browser...');
    if (browserPool) {
        await browserPool.close();
    }
    process.exit(0);
});
