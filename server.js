const express = require('express');
const bodyParser = require('body-parser');
const shortid = require('shortid');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const port = process.env.PORT || 3000;

// Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials - check environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve track.html at /track
app.get('/track', (req, res) => {
  res.sendFile(path.join(__dirname, 'track.html'));
});

// Handle URL shortening (using auto-generated alias)
app.post('/api/shorten', async (req, res) => {
  try {
    const { longUrl } = req.body;
    if (!longUrl) {
      return res.status(400).json({ error: 'Missing required field: longUrl' });
    }

    // Generate an alias automatically using shortid
    const shortUrl = shortid.generate();

    // Insert into main_urls table
    const { data, error } = await supabase
      .from('main_urls')
      .insert([{ original_url: longUrl, short_url: shortUrl }])
      .single();

    if (error) {
      console.error('Error shortening URL:', error.message);
      return res.status(500).json({ error: 'Failed to shorten URL' });
    }

    res.json({ shortUrl });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle redirection and atomic click count update for main_urls
app.get('/:shortUrl', async (req, res) => {
  try {
    const { shortUrl } = req.params;
    console.log(`Received alias: ${shortUrl}`);

    // Retrieve the original URL from main_urls table
    const { data, error } = await supabase
      .from('main_urls')
      .select('original_url')
      .eq('short_url', shortUrl)
      .single();

    if (error || !data) {
      console.error(`Alias not found: ${shortUrl}`);
      return res.status(404).send('URL not found');
    }

    // Atomically increment the click count using the RPC function for main_urls
    const { data: newClickCount, error: rpcError } = await supabase.rpc('increment_click_count_main', { p_alias: shortUrl });
    if (rpcError) {
      console.error('Error incrementing click count via RPC:', rpcError);
      // Optionally, you can continue with the redirect even if the update fails.
    } else {
      console.log(`New click count for alias ${shortUrl}:`, newClickCount);
    }

    console.log(`Redirecting to ${data.original_url}`);
    res.redirect(data.original_url);
  } catch (err) {
    console.error('Redirect Error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// Catch-all route: serve index.html for any unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Supabase connected to: ${supabaseUrl}`);
});

module.exports = app;
