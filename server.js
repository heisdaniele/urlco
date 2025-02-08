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

// Middleware
app.use(bodyParser.json());
// (Note: Express 4.16+ includes express.json(), so bodyParser.json() is optional)
app.use(express.static(path.join(__dirname, '/'))); // Serve static files from the root directory

// Serve index.html at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve track.html at /track
app.get('/track', (req, res) => {
  res.sendFile(path.join(__dirname, 'track.html'));
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
    return res.status(500).json({ error: 'Failed to shorten URL' });
  }

  res.json({ shortUrl });
});

// Handle redirection and atomic click count update for short URLs
app.get('/:shortUrl', async (req, res) => {
  const { shortUrl } = req.params;

  try {
    console.log(`Received alias: ${shortUrl}`);

    // Retrieve the original URL for the alias
    const { data, error } = await supabase
      .from('urls')
      .select('original_url')
      .eq('short_url', shortUrl)
      .single();

    if (error || !data) {
      console.error(`URL not found for alias: ${shortUrl}`);
      return res.status(404).send('URL not found');
    }

    // Atomically increment the click count using the RPC function
    const { error: rpcError } = await supabase.rpc('increment_click_count', { p_alias: shortUrl });
    if (rpcError) {
      console.error('Error incrementing click count via RPC:', rpcError);
      // Optionally, you can continue with the redirect even if the update fails.
    } else {
      console.log(`Click count incremented for alias: ${shortUrl}`);
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
});
