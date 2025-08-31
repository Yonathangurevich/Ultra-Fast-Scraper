const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;

// Browser instance pool - הגבלה קבועה!
let browserPool = [];
const MAX_BROWSERS = 1; // ⚡ הורדנו ל-1 לחסוך זיכרון
const MAX_REQUESTS_PER_BROWSER = 50; // נסגור browser אחרי 50 requests

// ✅ Browser launch options מיטובים לזיכרון
const BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--disable-gpu',
    '--no-first-run',
    '--window-size=1366,768', // 🔥 הקטנו מ-1920x1080
    // ❌ הסרנו --single-process שאוכל הרבה זיכרון!
    '--disable-accelerated-2d-canvas',
    '--disable-dev-profile',
    '--memory-pressure-off', // ✅ תוספת לניהול זיכרון
    '--max_old_space_size=512', // ✅ הגבלת זיכרון Node.js
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
];

// מעקב requests per browser
const browserStats = new Map();

// משתנה למעקב ניקויים אחרונים - רק לצורך debug נדיר
let lastCleanupTime = Date.now();
let cleanupCount = 0;

// Initialize browser pool
async function initBrowserPool() {
    console.log('🚀 Initializing optimized browser pool...');
    for (let i = 0; i < MAX_BROWSERS; i++) {
        try {
            const browserObj = await createNewBrowser();
            if (browserObj) {
                browserPool.push(browserObj);
                console.log(`✅ Browser ${i + 1} initialized`);
            }
        } catch (error) {
            console.error(`❌ Failed to init browser ${i + 1}:`, error.message);
        }
    }
}

// יצירת browser חדש עם מעקב
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
        console.error('❌ Failed to create browser:', error.message);
        return null;
    }
}

// Get available browser from pool
async function getBrowser() {
    // נסה למצוא browser פנוי
    let browserObj = browserPool.find(b => !b.busy);
    
    if (!browserObj) {
        // חכה עד שישתחרר browser (לא יוצר חדש!)
        for (let i = 0; i < 100; i++) { // עד 10 שניות
            await new Promise(resolve => setTimeout(resolve, 100));
            browserObj = browserPool.find(b => !b.busy);
            if (browserObj) break;
        }
    }
    
    if (!browserObj) {
        throw new Error('No browsers available - all busy');
    }
    
    // בדוק אם Browser עשה יותר מדי requests
    if (browserObj.requests >= MAX_REQUESTS_PER_BROWSER) {
        await recycleBrowser(browserObj);
    }
    
    browserObj.busy = true;
    browserObj.requests++;
    
    return browserObj;
}

// מחזור browser שעשה יותר מדי requests - בשקט!
async function recycleBrowser(browserObj) {
    try {
        // סגור browser ישן
        await browserObj.browser.close();
        browserStats.delete(browserObj.id);
        
        // צור browser חדש
        const newBrowserObj = await createNewBrowser();
        if (newBrowserObj) {
            // החלף במקום הישן
            const index = browserPool.indexOf(browserObj);
            browserPool[index] = newBrowserObj;
            // לא מדפיסים כלום! עובד בשקט
        }
    } catch (error) {
        // רק אם יש בעיה קריטית
        console.error('❌ Critical error recycling browser:', error.message);
    }
}

// Release browser back to pool
function releaseBrowser(browserObj) {
    if (browserObj) {
        browserObj.busy = false;
        // לא מדפיסים כל release - רק משחררים בשקט
    }
}

// ✅ פונקציה שקטה לניקוי זיכרון - בלי לוגים!
async function silentMemoryCleanup() {
    try {
        // Force garbage collection בשקט
        if (global.gc) {
            global.gc();
        }
        
        cleanupCount++;
        
        // רק אם עברו 10 דקות (10 ניקויים) נדפיס סטטוס קצר
        if (cleanupCount % 10 === 0) {
            const memory = process.memoryUsage();
            console.log(`[${new Date().toLocaleTimeString()}] Memory: ${Math.round(memory.heapUsed / 1024 / 1024)}MB | Browsers: ${browserPool.filter(b => !b.busy).length}/${browserPool.length} free`);
        }
    } catch (error) {
        // אפילו שגיאות - לא מדפיסים אלא אם הן קריטיות
        if (error.message.includes('critical') || error.message.includes('fatal')) {
            console.error('❌ Critical cleanup error:', error.message);
        }
    }
}

// Main scraping function - מיטוב לזיכרון
async function scrapeWithOptimizations(url) {
    const startTime = Date.now();
    let browserObj = null;
    let page = null;
    
    try {
        browserObj = await getBrowser();
        
        // Create new page עם הגבלות זיכרון
        page = await browserObj.browser.newPage();
        
        // ✅ הגבלת זיכרון לדף
        await page.setCacheEnabled(false); // חסוך זיכרון
        await page.setViewport({ width: 1366, height: 768 }); // גודל קטן יותר
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
        
        // Navigate עם timeout קצר יותר
        await page.goto(url, {
            waitUntil: ['domcontentloaded'], // ✅ רק domcontentloaded, לא networkidle2
            timeout: 20000 // ✅ הקטנו מ-25000
        });
        
        // Check for Cloudflare and wait for redirect - מיטוב
        const title = await page.title();
        
        if (title.includes('Just a moment') || title.includes('Checking your browser')) {
            // Smart waiting מקוצר
            for (let i = 0; i < 10; i++) { // ✅ הקטנו מ-15 ל-10
                await page.waitForTimeout(1000);
                
                const currentUrl = page.url();
                const currentTitle = await page.title();
                
                if (currentUrl.includes('ssd=') || !currentTitle.includes('Just a moment')) {
                    break;
                }
            }
        }
        
        // Final wait קצר יותר
        await page.waitForTimeout(500); // ✅ הקטנו מ-1000
        
        // Get final results
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
        // ✅ ניקוי יסודי
        if (page) {
            await page.close().catch(() => {});
            page = null; // Clear reference
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
        const { cmd, url, maxTimeout = 25000, session } = req.body; // ✅ הקטנו timeout
        
        if (!url) {
            return res.status(400).json({
                status: 'error',
                message: 'URL is required'
            });
        }
        
        console.log(`📨 Request: ${url.substring(0, 50)}...`);
        
        // Run scraping with timeout
        const result = await Promise.race([
            scrapeWithOptimizations(url),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), maxTimeout)
            )
        ]);
        
        if (result.success) {
            const elapsed = Date.now() - startTime;
            console.log(`✅ Success in ${elapsed}ms`);
            
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
                version: '4.2.0-quiet',
                hasSSd: result.hasSSd || false
            });
        } else {
            throw new Error(result.error || 'Unknown error');
        }
        
    } catch (error) {
        console.error(`❌ Request failed:`, error.message);
        
        res.status(500).json({
            status: 'error',
            message: error.message,
            solution: null
        });
    }
});

// Enhanced health check
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
        cleanupCount: cleanupCount,
        version: '4.2.0-quiet'
    });
});

// Root
app.get('/', (req, res) => {
    const memory = process.memoryUsage();
    res.send(`
        <h1>⚡ Quiet Scraper v4.2</h1>
        <p><strong>Status:</strong> Running</p>
        <p><strong>Memory:</strong> ${Math.round(memory.heapUsed / 1024 / 1024)}MB</p>
        <p><strong>Browsers:</strong> ${browserPool.length} (${browserPool.filter(b => b.busy).length} busy)</p>
        <p><strong>Cleanups:</strong> ${cleanupCount} performed</p>
        <p><strong>Mode:</strong> Silent operation 🤫</p>
    `);
});

// Start server
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`
╔════════════════════════════════════════╗
║   ⚡ Quiet Scraper v4.2                ║
║   Port: ${PORT}                            ║
║   Mode: Silent Memory Management       ║
╚════════════════════════════════════════╝
    `);
    
    console.log('🚀 Initializing...');
    await initBrowserPool();
    
    // ✅ הפעלת ניקוי שקט כל דקה
    setInterval(silentMemoryCleanup, 60000);
    console.log('✅ Ready! Running in quiet mode.');
});

// Graceful shutdown עם ניקוי יסודי
process.on('SIGTERM', async () => {
    console.log('📛 Shutting down...');
    for (const browserObj of browserPool) {
        await browserObj.browser.close().catch(() => {});
    }
    browserPool = [];
    browserStats.clear();
    process.exit(0);
});

// Handle errors בשקט
process.on('uncaughtException', (error) => {
    // רק שגיאות קריטיות
    if (error.message.includes('ENOMEM') || error.message.includes('FATAL')) {
        console.error('💥 Critical error:', error.message);
    }
    // נסה לנקות זיכרון
    if (global.gc) global.gc();
});

process.on('unhandledRejection', (error) => {
    // רק שגיאות קריטיות
    if (error && error.message && (error.message.includes('ENOMEM') || error.message.includes('FATAL'))) {
        console.error('💥 Critical rejection:', error.message);
    }
});
