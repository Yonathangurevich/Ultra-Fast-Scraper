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
```

---

## 🎭 scraper.js
```javascript
const { chromium } = require('playwright-extra');
const stealth = require('playwright-extra-plugin-stealth');

// Use stealth plugin
chromium.use(stealth());

// Browser pool for reuse
let browserInstance = null;

async function initBrowser() {
    if (!browserInstance) {
        browserInstance = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--window-size=1920,1080'
            ],
            // Use proxy if configured
            proxy: process.env.PROXY_URL ? {
                server: process.env.PROXY_URL,
                username: process.env.PROXY_USERNAME,
                password: process.env.PROXY_PASSWORD
            } : undefined
        });
    }
    return browserInstance;
}

async function fastScrape(url, options = {}) {
    const { browser, useProxy, session } = options;
    const startTime = Date.now();
    
    let context = null;
    let page = null;
    
    try {
        // Create context with options
        const contextOptions = {
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'en-US',
            timezoneId: 'America/New_York'
        };
        
        // Add proxy if needed and not already in browser
        if (useProxy && process.env.PROXY_URL && !browser.proxy) {
            contextOptions.proxy = {
                server: process.env.PROXY_URL,
                username: process.env.PROXY_USERNAME,
                password: process.env.PROXY_PASSWORD
            };
        }
        
        context = await browser.newContext(contextOptions);
        
        // Create page
        page = await context.newPage();
        
        // Enhanced stealth
        await page.addInitScript(() => {
            // Override webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Mock chrome
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
            
            // Mock permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
            
            // Mock plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // Mock languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });
        
        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });
        
        console.log('🚀 Starting navigation...');
        
        // Navigate with smart waiting
        const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        
        console.log(`📄 Initial status: ${response.status()}`);
        
        // Smart wait for PartsOuq
        let finalUrl = page.url();
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts && !finalUrl.includes('ssd=')) {
            await page.waitForTimeout(500);
            
            // Check for any navigation
            finalUrl = page.url();
            
            // Check if we got redirected
            if (finalUrl !== url) {
                console.log(`🔄 Redirected to: ${finalUrl.substring(0, 80)}...`);
            }
            
            // Check for Cloudflare
            const title = await page.title();
            if (title.includes('Just a moment')) {
                console.log('☁️ Cloudflare detected, waiting...');
                await page.waitForTimeout(1000);
            }
            
            // Check for ssd parameter
            if (finalUrl.includes('ssd=')) {
                console.log('✅ Found ssd parameter!');
                break;
            }
            
            attempts++;
        }
        
        // Final wait for content
        if (finalUrl.includes('ssd=')) {
            await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        }
        
        // Get final state
        const html = await page.content();
        const cookies = await context.cookies();
        const elapsed = Date.now() - startTime;
        
        console.log(`⏱️ Completed in ${elapsed}ms`);
        
        return {
            success: true,
            html: html,
            url: finalUrl,
            cookies: cookies,
            hasSSd: finalUrl.includes('ssd='),
            elapsed: elapsed
        };
        
    } catch (error) {
        console.error('❌ Scraping error:', error.message);
        return {
            success: false,
            error: error.message,
            url: url
        };
        
    } finally {
        if (page) await page.close();
        if (context) await context.close();
    }
}

module.exports = {
    initBrowser,
    fastScrape
};
