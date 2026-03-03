const express = require('express');
const cors    = require('cors');
const https   = require('https');
const app     = express();

app.use(cors());
app.use(express.json());

const SCANNER_SECRET    = process.env.SCANNER_SECRET;
const JUNKIE_IDENTIFIER = process.env.JUNKIE_IDENTIFIER;

const detections = [];
const MAX_STORE  = 500;

// ══════════════════════════════════════════
// POST /api/ingest  — Scanner privé
// ══════════════════════════════════════════
app.post('/api/ingest', (req, res) => {
    const { secret, detections: incoming } = req.body;

    if (!secret || secret !== SCANNER_SECRET)
        return res.status(403).json({ error: 'Unauthorized' });

    if (!Array.isArray(incoming) || incoming.length === 0)
        return res.status(400).json({ error: 'No detections' });

    for (const d of incoming) {
        const exists = detections.find(
            x => x.jobId === d.jobId && x.animalName === d.animalName
        );
        if (!exists) {
            detections.push({
                name:         d.name         || '?',
                animalName:   d.animalName   || '?',
                mutation:     d.mutation     || 'None',
                trait:        d.trait        || 'None',
                rarity:       d.rarity       || 'Common',
                pps:          d.pps          || 0,
                ppsFormatted: d.ppsFormatted || '$0',
                gameId:       d.gameId       || 0,
                jobId:        d.jobId        || '',
                scannerName:  d.scannerName  || '?',
                timestamp:    d.timestamp    || Math.floor(Date.now() / 1000),
            });
        }
    }

    if (detections.length > MAX_STORE)
        detections.splice(0, detections.length - MAX_STORE);

    console.log(`[INGEST] +${incoming.length} | Total: ${detections.length}`);
    return res.json({ ok: true });
});

// ══════════════════════════════════════════
// GET /api/panel?key=XXX  — Panel user
// ══════════════════════════════════════════
app.get('/api/panel', (req, res) => {
    const key = req.query.key;

    if (!key)
        return res.status(400).json({ valid: false, error: 'No key provided' });

    console.log(`[PANEL] Key check: ${key.substring(0, 8)}...`);

    verifyJunkieKey(key, (valid, error) => {
        if (!valid) {
            console.log(`[PANEL] Rejected — ${error}`);
            return res.status(403).json({ valid: false, error: error || 'Invalid key' });
        }

        const sorted = [...detections]
            .sort((a, b) => b.pps - a.pps)
            .slice(0, 100)
            .map(d => ({
                name:         d.name,
                animalName:   d.animalName,
                mutation:     d.mutation,
                trait:        d.trait,
                rarity:       d.rarity,
                ppsFormatted: d.ppsFormatted,
                gameId:       d.gameId,
                jobId:        d.jobId,
                scannerName:  d.scannerName,
                timestamp:    d.timestamp,
            }));

        console.log(`[PANEL] Accepted — ${sorted.length} detections envoyées`);
        return res.json({ valid: true, detections: sorted });
    });
});

// ══════════════════════════════════════════
// Vérification Key Junkie
// FIX: headers navigateur pour bypass Cloudflare
// ══════════════════════════════════════════
function verifyJunkieKey(key, callback) {
    if (!JUNKIE_IDENTIFIER) {
        console.log('[JUNKIE] ⚠️ JUNKIE_IDENTIFIER non défini dans Railway !');
        return callback(false, 'Server misconfigured');
    }

    const options = {
        hostname: 'jnkie.com',
        path: `/api/verifykey?key=${encodeURIComponent(key)}&service=${encodeURIComponent(JUNKIE_IDENTIFIER)}`,
        method: 'GET',
        headers: {
            'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept':          'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer':         'https://jnkie.com/',
            'Origin':          'https://jnkie.com',
        }
    };

    console.log(`[JUNKIE] Checking: jnkie.com${options.path}`);

    const req = https.request(options, (resp) => {
        let data = '';
        resp.on('data', chunk => data += chunk);
        resp.on('end', () => {
            console.log(`[JUNKIE] Status: ${resp.statusCode} | Raw: ${data.substring(0, 300)}`);
            try {
                const json = JSON.parse(data);
                const isValid = json.success === true || json.valid === true;
                callback(isValid, json.message || json.error || null);
            } catch (e) {
                console.log(`[JUNKIE] Parse error: ${e.message} | Raw: ${data.substring(0, 150)}`);
                callback(false, 'Junkie parse error');
            }
        });
    });

    req.on('error', (e) => {
        console.log(`[JUNKIE] Network error: ${e.message}`);
        callback(false, 'Junkie unreachable');
    });

    req.end();
}

// ══════════════════════════════════════════
// Démarrage
// ══════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[ZYRA SERVER] Running on port ${PORT}`);
    console.log(`[ZYRA SERVER] JUNKIE_IDENTIFIER = ${JUNKIE_IDENTIFIER || '⚠️  NOT SET — ajoute dans Railway Variables !'}`);
    console.log(`[ZYRA SERVER] SCANNER_SECRET    = ${SCANNER_SECRET    ? '✅ SET' : '⚠️  NOT SET'}`);
});
