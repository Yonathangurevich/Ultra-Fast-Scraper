const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Browser instance pool
let browserPool = [];
const MAX_BROWSERS = 2;

// Browser launch options
const BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1920,1080',
    '--single-process',
    '--disable-accelerated-2d-canvas',
    '--disable-dev-profile'
];

// Initialize browser pool
async function initBrowserPool() {
    for (let i = 0; i < MAX_BROWSERS; i++) {
        try {
            const browser = await launchBrowser();
            browserPool.push({ browser, busy: false });
            console.log(`✅ Browser ${i + 1} initialized`);
        } catch (error) {
            console.error(`❌ Failed to init browser ${i + 1}:`, error.message);
        }
    }
}

// Launch a single browser
async function launchBrowser() {
    return await puppeteer.launch({
        headless: 'new',
        args: BROWSER_ARGS,
        ignoreDefaultArgs: ['--enable-automation']
    });
}

// Get available browser from pool
async function getBrowser() {
    let browserObj = browserPool.find(b => !b.busy);
    
    if (!browserObj && browserPool.length > 0) {
        // Wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 100));
        browserObj = browserPool.find(b => !b.busy);
    }
    
    if (!browserObj) {
        // Create new browser if needed
        const browser = await launchBrowser();
        browserObj = { browser, busy: true };
        browserPool.push(browserObj);
    } else {
        browserObj.busy = true;
    }
    
    return browserObj;
}

// Release browser back to pool
function releaseBrowser(browserObj) {
    if (browserObj) {
        browserObj.busy = false;
    }
}

// Main scraping function
async function scrapeWithOptimizations(url) {
    const startTime = Date.now();
    let browserObj = null;
    let page = null;
    
    try {
        console.log('🎯 Getting browser from pool...');
        browserObj = await getBrowser();
        
        // Create new page
        page = await browserObj.browser.newPage();
        
        // Set viewport and user agent
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Enhanced stealth measures
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {}
            };
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });
        });
        
        // Set extra headers
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });
        
        console.log('🚀 Starting navigation to:', url);
        
        // Navigate with smart waiting
        await page.goto(url, {
            waitUntil: ['domcontentloaded', 'networkidle2'],
            timeout: 25000
        });
        
        // Check for Cloudflare and wait for redirect
        const title = await page.title();
        console.log(`📄 Initial title: ${title}`);
        
        if (title.includes('Just a moment') || title.includes('Checking your browser')) {
            console.log('☁️ Cloudflare detected, waiting for bypass...');
            
            // Smart waiting for PartsOuq redirect
            for (let i = 0; i < 15; i++) {
                await page.waitForTimeout(1000);
                
                const currentUrl = page.url();
                const currentTitle = await page.title();
                
                console.log(`⏳ Attempt ${i + 1}/15 - Checking for redirect...`);
                
                // Check if we got the full URL with ssd parameter
                if (currentUrl.includes('ssd=')) {
                    console.log(`✅ Success! Found complete URL with ssd parameter`);
                    break;
                }
                
                // Check if title changed (means we passed Cloudflare)
                if (!currentTitle.includes('Just a moment')) {
                    console.log('✅ Passed Cloudflare check');
                    await page.waitForTimeout(2000);
                    break;
                }
            }
        }
        
        // Final wait
        await page.waitForTimeout(1000);
        
        // Get final URL and content
        const finalUrl = page.url();
        const html = await page.content();
        const cookies = await page.cookies();
        const elapsed = Date.now() - startTime;
        
        console.log(`✅ Final URL: ${finalUrl.substring(0, 100)}...`);
        console.log(`⏱️ Completed in ${elapsed}ms`);
        console.log(`🎯 Has ssd param: ${finalUrl.includes('ssd=') ? 'YES ✅' : 'NO ❌'}`);
        
        return {
            success: true,
            html: html,
            url: finalUrl,
            cookies: cookies,
            hasSSd: finalUrl.includes('ssd='),
            elapsed: elapsed
        };
        
    } catch (error) {
        console.error('❌ Error during scraping:', error.message);
        return {
            success: false,
            error: error.message,
            url: url
        };
        
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
        if (browserObj) {
            releaseBrowser(browserObj);
        }
    }
}

// Main endpoint
app.post('/v1', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { cmd, url, maxTimeout = 30000, session } = req.body;
        
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required'
            });
        }
        
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📨 New Request at ${new Date().toISOString()}`);
        console.log(`🔗 URL: ${url}`);
        console.log(`⏱️ Timeout: ${maxTimeout}ms`);
        console.log(`${'='.repeat(60)}\n`);
        
        // Run scraping with timeout
        const result = await Promise.race([
            scrapeWithOptimizations(url),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), maxTimeout)
            )
        ]);
        
        if (result.success) {
            const elapsed = Date.now() - startTime;
            
            console.log(`\n${'='.repeat(60)}`);
            console.log(`✅ SUCCESS - Total time: ${elapsed}ms`);
            console.log(`🔗 Final URL: ${result.url?.substring(0, 120) || 'N/A'}...`);
            console.log(`📄 HTML Length: ${result.html?.length || 0} bytes`);
            console.log(`🎯 Has ssd param: ${result.hasSSd ? 'YES ✅' : 'NO ❌'}`);
            console.log(`${'='.repeat(60)}\n`);
            
            res.json({
                status: 'ok',
                message: 'Success',
                solution: {
                    url: result.url || url,
                    status: 200,
                    response: result.html,
                    cookies: result.cookies || [],
                    userAgent: 'Mozilla/5.0'
                },
                startTimestamp: startTime,
                endTimestamp: Date.now(),
                version: '4.0.0',
                hasSSd: result.hasSSd || false
            });
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error(`\n${'='.repeat(60)}`);
        console.error('❌ REQUEST FAILED:', error.message);
        console.error(`${'='.repeat(60)}\n`);
        
        res.status(500).json({
            status: 'error',
            message: error.message,
            solution: null
        });
    }
});

// Health check
app.get('/health', async (req, res) => {
    const memory = process.memoryUsage();
    
    res.json({
        status: 'healthy',
        uptime: Math.round(process.uptime()) + 's',
        browsers: browserPool.length,
        activeBrowsers: browserPool.filter(b => b.busy).length,
        memory: {
            used: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
            total: Math.round(memory.heapTotal / 1024 / 1024) + 'MB'
        }
    });
});

// Root
app.get('/', (req, res) => {
    res.send(`
        <h1>⚡ Ultra-Fast Puppeteer Scraper v4.0</h1>
        <p><strong>Status:</strong> Running</p>
        <p><strong>Browsers:</strong> ${browserPool.length} active</p>
        <p><strong>Endpoints:</strong></p>
        <ul>
            <li>POST /v1 - Main scraping endpoint</li>
            <li>GET /health - System status</li>
        </ul>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`
╔════════════════════════════════════════╗
║   ⚡ Ultra-Fast Puppeteer Scraper v4.0  ║
║   Port: ${PORT}                            ║
╚════════════════════════════════════════╝
    `);
    
    console.log('🚀 Initializing browser pool...');
    await initBrowserPool();
    console.log('✅ Ready to scrape!');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📛 SIGTERM received, closing browsers...');
    for (const browserObj of browserPool) {
        await browserObj.browser.close().catch(() => {});
    }
    process.exit(0);
});

// Handle errors
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('💥 Unhandled Rejection:', error);
});
