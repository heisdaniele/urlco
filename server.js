const express = require('express');
const bodyParser = require('body-parser');
const shortid = require('shortid');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '/'))); // Serve static files from root directory

// Serve the index.html file at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/track', (req, res) => {
    res.sendFile(path.join(__dirname, 'track.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle URL shortening
app.post('/api/shorten', async (req, res) => {
    const { longUrl } = req.body;
    const shortUrl = shortid.generate();

    const { data, error } = await supabase
        .from('urls')
        .insert([{ original_url: longUrl, short_url: shortUrl }])
        .single();

    if (error) {
        console.error('Error shortening URL:', error.message);
        console.error('Details:', error.details);
        console.error('Hint:', error.hint);
        return res.status(500).json({ error: 'Failed to shorten URL' });
    }

    res.json({ shortUrl });
});

// Handle redirection and click count increment
app.get('/:shortUrl', async (req, res) => {
    const { shortUrl } = req.params;

    const { data, error } = await supabase
        .from('urls')
        .select('original_url, click_count')
        .eq('short_url', shortUrl)
        .single();

    if (error || !data) {
        return res.status(404).send('URL not found');
    }

    // Increment click count
    const { original_url, click_count } = data;
    await supabase
        .from('urls')
        .update({ click_count: click_count + 1 })
        .eq('short_url', shortUrl);

    res.redirect(original_url);
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});