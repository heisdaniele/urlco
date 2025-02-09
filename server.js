const express = require('express');
const bodyParser = require('body-parser');
const shortid = require('shortid');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

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

// Handle redirection and track click events for main_urls
app.get('/:shortUrl', async (req, res) => {
  try {
    const { shortUrl } = req.params;
    console.log(`Received alias: ${shortUrl}`);

    // Retrieve the original URL from main_urls table (also get the record id)
    const { data, error } = await supabase
      .from('main_urls')
      .select('original_url, id')
      .eq('short_url', shortUrl)
      .single();

    if (error || !data) {
      console.error(`Alias not found: ${shortUrl}`);
      return res.status(404).send('URL not found');
    }

    // Extract IP and device information from the request headers
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const deviceType = /mobile/i.test(userAgent) ? 'Mobile' : 'Desktop';

    // Use ipinfo.io to get location information
    let location = 'Unknown';
    try {
      const ipinfoToken = process.env.IPINFO_TOKEN;
      if (ipinfoToken && ipAddress) {
        // If ipAddress is a list, take the first value and remove any port number
        let ip = ipAddress.split(',')[0].trim().split(':')[0];
        // Check for local addresses
        if (ip === '::1' || ip === '127.0.0.1') {
          location = 'Localhost';
        } else {
          const response = await axios.get(`https://ipinfo.io/${ip}/json?token=${ipinfoToken}`);
          if (response && response.data) {
            const { city, region, country } = response.data;
            location = `${city || ''}${city && region ? ', ' : ''}${region || ''}${(city || region) && country ? ', ' : ''}${country || ''}`;
          }
        }
      }
    } catch (err) {
      console.error("Error fetching location info:", err.message);
    }

    // Insert a new click event into the click_events table for main_urls
    const { error: clickError } = await supabase
      .from('click_events')
      .insert({
        url_id: data.id,
        url_type: 'main',
        location: location,
        device_type: deviceType
      });
    if (clickError) {
      console.error('Error inserting click event:', clickError);
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
