const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Browser instance pool
let browserPool = [];
const MAX_BROWSERS = 1;
const MAX_REQUESTS_PER_BROWSER = 50;

// ✅ הגדרת רמות לוג
const LOG_LEVELS = {
    SILENT: 0,    // בלי לוגים בכלל
    ERROR: 1,     // רק שגיאות קריטיות
    MINIMAL: 2,   // מינימום הכרחי
    VERBOSE: 3    // כל הלוגים (למטרות debug)
};

// 🔥 הגדר רמת לוג דיפולטיבית - שנה לפי הצורך
const CURRENT_LOG_LEVEL = process.env.LOG_LEVEL || LOG_LEVELS.MINIMAL;

// ✅ פונקציית לוג חכמה
function smartLog(level, message, ...args) {
    if (level <= CURRENT_LOG_LEVEL) {
        console.log(message, ...args);
    }
}

function smartError(message, ...args) {
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.ERROR) {
        console.error(message, ...args);
    }
}

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
    '--window-size=1366,768',
    '--disable-accelerated-2d-canvas',
    '--disable-dev-profile',
    '--memory-pressure-off',
    '--max_old_space_size=512',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
];

// Browser stats tracking
const browserStats = new Map();
let lastCleanupTime = Date.now();
let cleanupCount = 0;
let requestCount = 0;
let successCount = 0;
let errorCount = 0;

// Initialize browser pool
async function initBrowserPool() {
    smartLog(LOG_LEVELS.MINIMAL, '🚀 Initializing browser pool...');
    for (let i = 0; i < MAX_BROWSERS; i++) {
        try {
            const browserObj = await createNewBrowser();
            if (browserObj) {
                browserPool.push(browserObj);
                smartLog(LOG_LEVELS.MINIMAL, `✅ Browser ${i + 1} ready`);
            }
        } catch (error) {
            smartError(`❌ Failed to init browser ${i + 1}:`, error.message);
        }
    }
}

// Create new browser
async function createNewBrowser() {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: [...BROWSER_ARGS, '--disable-features=site-per-process'],
            ignoreDefaultArgs: ['--enable-automation'],
            handleSIGINT: false,
            handleSIGTERM: false,
            handleSIGHUP: false
        });
        
        const browserId = Date.now() + Math.random();
        browserStats.set(browserId, { requests: 0, created: Date.now() });
        
        return { 
            browser, 
            busy: false, 
            id: browserId,
            requests: 0 
        };
    } catch (error) {
        smartError('❌ Failed to create browser:', error.message);
        return null;
    }
}

// Get available browser from pool
async function getBrowser() {
    let browserObj = browserPool.find(b => !b.busy);
    
    if (!browserObj) {
        for (let i = 0; i < 100; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            browserObj = browserPool.find(b => !b.busy);
            if (browserObj) break;
        }
    }
    
    if (!browserObj) {
        throw new Error('No browsers available - all busy');
    }
    
    // Recycle browser silently if needed
    if (browserObj.requests >= MAX_REQUESTS_PER_BROWSER) {
        await recycleBrowser(browserObj);
    }
    
    browserObj.busy = true;
    browserObj.requests++;
    
    return browserObj;
}

// 🔥 מחזור browser בשקט מוחלט
async function recycleBrowser(browserObj) {
    try {
        await browserObj.browser.close();
        browserStats.delete(browserObj.id);
        
        const newBrowserObj = await createNewBrowser();
        if (newBrowserObj) {
            const index = browserPool.indexOf(browserObj);
            browserPool[index] = newBrowserObj;
            // 🔥 לא מדפיסים כלום! עובד בשקט מוחלט
        }
    } catch (error) {
        // רק אם יש בעיה קריטית ביותר
        if (error.message && error.message.includes('FATAL')) {
            smartError('❌ Fatal recycling error:', error.message);
        }
    }
}

// Release browser back to pool
function releaseBrowser(browserObj) {
    if (browserObj) {
        browserObj.busy = false;
        // 🔥 בלי לוגים!
    }
}

// 🔥 ניקוי זיכרון שקט לחלוטין
async function silentMemoryCleanup() {
    try {
        if (global.gc) {
            global.gc();
        }
        
        cleanupCount++;
        
        // 🔥 הדפס סטטוס רק פעם בשעה (60 ניקויים)
        if (cleanupCount % 60 === 0) {
            const memory = process.memoryUsage();
            const stats = {
                memory: Math.round(memory.heapUsed / 1024 / 1024),
                requests: requestCount,
                success: successCount,
                errors: errorCount,
                uptime: Math.round(process.uptime() / 60)
            };
            smartLog(LOG_LEVELS.MINIMAL, 
                `📊 Hourly Stats | Mem: ${stats.memory}MB | Reqs: ${stats.requests} | Success: ${stats.success} | Errors: ${stats.errors} | Uptime: ${stats.uptime}m`
            );
            // Reset counters
            requestCount = 0;
            successCount = 0;
            errorCount = 0;
        }
    } catch (error) {
        // שקט מוחלט אלא אם כן קריטי
        if (error.message && error.message.toLowerCase().includes('fatal')) {
            smartError('Fatal cleanup error:', error.message);
        }
    }
}

// Main scraping function
async function scrapeWithOptimizations(url) {
    const startTime = Date.now();
    let browserObj = null;
    let page = null;
    
    try {
        browserObj = await getBrowser();
        page = await browserObj.browser.newPage();
        
        await page.setCacheEnabled(false);
        await page.setViewport({ width: 1366, height: 768 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Stealth measures
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
        
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });
        
        await page.goto(url, {
            waitUntil: ['domcontentloaded'],
            timeout: 20000
        });
        
        const title = await page.title();
        
        if (title.includes('Just a moment') || title.includes('Checking your browser')) {
            for (let i = 0; i < 10; i++) {
                await page.waitForTimeout(1000);
                const currentUrl = page.url();
                const currentTitle = await page.title();
                if (currentUrl.includes('ssd=') || !currentTitle.includes('Just a moment')) {
                    break;
                }
            }
        }
        
        await page.waitForTimeout(500);
        
        const finalUrl = page.url();
        const html = await page.content();
        const cookies = await page.cookies();
        const elapsed = Date.now() - startTime;
        
        return {
            success: true,
            html: html,
            url: finalUrl,
            cookies: cookies,
            hasSSd: finalUrl.includes('ssd='),
            elapsed: elapsed
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
            url: url
        };
        
    } finally {
        if (page) {
            await page.close().catch(() => {});
            page = null;
        }
        if (browserObj) {
            releaseBrowser(browserObj);
        }
    }
}

// Main endpoint
app.post('/v1', async (req, res) => {
    const startTime = Date.now();
    requestCount++;
    
    try {
        const { cmd, url, maxTimeout = 25000, session } = req.body;
        
        if (!url) {
            errorCount++;
            return res.status(400).json({
                status: 'error',
                message: 'URL is required'
            });
        }
        
        // 🔥 לוג רק ב-VERBOSE mode
        smartLog(LOG_LEVELS.VERBOSE, `📨 Request: ${url.substring(0, 50)}...`);
        
        const result = await Promise.race([
            scrapeWithOptimizations(url),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), maxTimeout)
            )
        ]);
        
        if (result.success) {
            successCount++;
            const elapsed = Date.now() - startTime;
            
            // 🔥 לוג הצלחה רק ב-VERBOSE
            smartLog(LOG_LEVELS.VERBOSE, `✅ Success in ${elapsed}ms`);
            
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
                version: '5.0.0-silent',
                hasSSd: result.hasSSd || false
            });
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        errorCount++;
        // 🔥 שגיאות רק ברמת ERROR
        smartError(`❌ Request failed:`, error.message);
        
        res.status(500).json({
            status: 'error',
            message: error.message,
            solution: null
        });
    }
});

// Health check endpoint
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
        },
        stats: {
            totalRequests: requestCount,
            success: successCount,
            errors: errorCount,
            cleanups: cleanupCount
        },
        logLevel: CURRENT_LOG_LEVEL,
        version: '5.0.0-silent'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    const memory = process.memoryUsage();
    res.send(`
        <h1>⚡ Silent Scraper v5.0</h1>
        <p><strong>Status:</strong> Running</p>
        <p><strong>Memory:</strong> ${Math.round(memory.heapUsed / 1024 / 1024)}MB</p>
        <p><strong>Browsers:</strong> ${browserPool.length} (${browserPool.filter(b => b.busy).length} busy)</p>
        <p><strong>Total Requests:</strong> ${requestCount}</p>
        <p><strong>Success Rate:</strong> ${requestCount > 0 ? Math.round((successCount/requestCount)*100) : 0}%</p>
        <p><strong>Log Level:</strong> ${CURRENT_LOG_LEVEL === 0 ? 'SILENT' : CURRENT_LOG_LEVEL === 1 ? 'ERROR' : CURRENT_LOG_LEVEL === 2 ? 'MINIMAL' : 'VERBOSE'}</p>
        <p><strong>Mode:</strong> Ultra Silent 🤫</p>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    // 🔥 הודעת התחלה מינימלית
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.MINIMAL) {
        console.log(`⚡ Silent Scraper v5.0 | Port: ${PORT} | Log Level: ${CURRENT_LOG_LEVEL}`);
    }
    
    await initBrowserPool();
    
    // הפעלת ניקוי שקט כל דקה
    setInterval(silentMemoryCleanup, 60000);
    
    if (CURRENT_LOG_LEVEL >= LOG_LEVELS.MINIMAL) {
        console.log('✅ Ready!');
    }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    smartLog(LOG_LEVELS.MINIMAL, '📛 Shutting down...');
    for (const browserObj of browserPool) {
        await browserObj.browser.close().catch(() => {});
    }
    browserPool = [];
    browserStats.clear();
    process.exit(0);
});

// 🔥 טיפול בשגיאות - רק קריטיות
process.on('uncaughtException', (error) => {
    if (error.message && (error.message.includes('ENOMEM') || error.message.includes('FATAL'))) {
        smartError('💥 Critical error:', error.message);
    }
    if (global.gc) global.gc();
});

process.on('unhandledRejection', (error) => {
    if (error && error.message && (error.message.includes('ENOMEM') || error.message.includes('FATAL'))) {
        smartError('💥 Critical rejection:', error.message);
    }
});
